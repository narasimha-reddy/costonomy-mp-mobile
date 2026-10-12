import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RequestReviewScreen from '@/app/supplier/credit/request/[id]';
import { ApiError } from '@/lib/api/errors';
import { approveCredit, fetchAgreement, rejectCredit } from '@/services/credit';
import { fetchCreditPolicy, fetchRequestContext } from '@/services/creditRequests';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => true }),
  usePathname: () => '/supplier/credit/request/31',
  useLocalSearchParams: () => ({ id: '31' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
let mockGranted: string[] = [];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForStore: (p: string) => mockGranted.includes(p) }),
}));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchAgreement: jest.fn(),
  approveCredit: jest.fn(),
  rejectCredit: jest.fn(),
}));
jest.mock('@/services/creditRequests', () => ({
  ...jest.requireActual('@/services/creditRequests'),
  fetchRequestContext: jest.fn(),
  fetchCreditPolicy: jest.fn(),
}));

const agreementM = fetchAgreement as jest.Mock;
const approveM = approveCredit as jest.Mock;
const rejectM = rejectCredit as jest.Mock;
const contextM = fetchRequestContext as jest.Mock;
const policyM = fetchCreditPolicy as jest.Mock;

const agreement = (over: Record<string, unknown> = {}) => ({
  id: 31, status: 'REQUESTED', outletId: 9, outletName: 'Koramangala', restaurantName: 'Spice Co', outletLocality: 'HSR',
  approvedLimit: '0.0000', latestRequest: {
    purpose: 'Weekly vegetables', requestedLimit: '50000.0000', requestedPeriodDays: 30, note: null,
    createdAt: '2026-10-03T10:00:00Z',
  }, ...over,
});
const context = (over: Record<string, unknown> = {}) => ({
  agreementId: 31, status: 'REQUESTED', outletId: 9, outletName: 'Koramangala', restaurantName: 'Spice Co',
  asOf: '2026-10-06', windowDays: 90, ordersCount90d: 12, ordersValue90d: '84000.0000', averageOrderValue: '7000.00',
  cancelledOrders90d: 1, firstOrderDate: '2026-06-28', lastOrderDate: '2026-10-06', previousOverdueCount: 1,
  pastLineStatus: 'CLOSED', pastLineEndedAt: '2026-10-05T10:00:00Z', history: [], ...over,
});
const policy = (over: Record<string, unknown> = {}) => ({
  supplierStoreId: 5, creditEnabled: true, defaultCreditLimit: 25000, defaultCreditPeriodDays: 15,
  defaultGracePeriodDays: 2, maxSingleOrderCredit: 5000, maxOverdueAmount: null, ...over,
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockOffline = false; });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><RequestReviewScreen /></QueryClientProvider>);
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted = ['CREDIT_MODIFY', 'CREDIT_REQUEST_VIEW'];
  agreementM.mockResolvedValue(agreement());
  contextM.mockResolvedValue(context());
  policyM.mockResolvedValue(policy());
});

describe('Request review: what they asked', () => {
  it('shows the restaurant, the outlet and what was asked', async () => {
    renderScreen();
    expect(await screen.findByText('Weekly vegetables')).toBeTruthy();
    expect(screen.getAllByText(/Spice Co/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Koramangala/).length).toBeGreaterThan(0);
    expect(screen.getByText('₹50,000.00')).toBeTruthy();
    expect(screen.getByText(/30 days/)).toBeTruthy();
  });

  it('shows a skeleton while loading', () => {
    agreementM.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    expect(screen.queryByText('Weekly vegetables')).toBeNull();
    expect(screen.queryByTestId('request-actions')).toBeNull();
  });

  it('keeps a huge amount and a long name in the layout', async () => {
    agreementM.mockResolvedValue(agreement({
      restaurantName: 'A very long restaurant name that goes on and on '.repeat(4),
      latestRequest: { purpose: null, requestedLimit: '999999999.99', requestedPeriodDays: 180, createdAt: '2026-10-03T10:00:00Z' },
    }));
    renderScreen();
    expect(await screen.findByText('₹99,99,99,999.99')).toBeTruthy();
  });

  it('says so, with Retry, when the request cannot load', async () => {
    agreementM.mockRejectedValueOnce(new ApiError({ code: 'X', message: 'boom', status: 500 }));
    renderScreen();
    fireEvent.press(await screen.findByText('Try again'));
    expect(await screen.findByText('Weekly vegetables')).toBeTruthy();
  });

  it('says the request is gone on a 404', async () => {
    agreementM.mockRejectedValue(new ApiError({ code: 'X', message: 'nope', status: 404 }));
    renderScreen();
    expect(await screen.findByText('This request is no longer available')).toBeTruthy();
    expect(screen.queryByTestId('request-actions')).toBeNull();
  });

  it('shows the offline banner and holds the actions back', async () => {
    mockOffline = true;
    renderScreen();
    await screen.findByText('Weekly vegetables');
    expect(screen.getAllByText(/offline/i).length).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId('action-approve-asked'));
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
  });

  it('refetches the request and its context on pull to refresh', async () => {
    renderScreen();
    await screen.findByText('Weekly vegetables');
    const callsBefore = agreementM.mock.calls.length;
    await act(async () => { screen.getByTestId('mandi-screen-scroll').props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(agreementM.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe('Request review: the context card', () => {
  it('words the server figures, nothing more', async () => {
    renderScreen();
    expect(await screen.findByText('Ordered 12 times in the last 90 days, ₹84,000 in total (average ₹7,000).')).toBeTruthy();
    expect(screen.getByText('First order 28 Jun, last 6 Oct.')).toBeTruthy();
    expect(screen.getByText('1 cancelled order.')).toBeTruthy();
    expect(screen.getByText('1 earlier invoice of theirs with you went overdue.')).toBeTruthy();
    expect(screen.getByText('Earlier credit line with you was closed on 5 Oct.')).toBeTruthy();
    expect(screen.getByText('You only see your own history with this restaurant')).toBeTruthy();
    expect(contextM).toHaveBeenCalledWith('tok', 5, 31);
  });

  it('does not work out an average of its own', async () => {
    contextM.mockResolvedValue(context({ ordersCount90d: 3, ordersValue90d: '100.0000', averageOrderValue: '99.99' }));
    renderScreen();
    expect(await screen.findByText('Ordered 3 times in the last 90 days, ₹100 in total (average ₹99.99).')).toBeTruthy();
  });

  it('says there are no orders when the server has none', async () => {
    contextM.mockResolvedValue(context({
      ordersCount90d: 0, ordersValue90d: '0.0000', averageOrderValue: null, cancelledOrders90d: 0, firstOrderDate: null,
      lastOrderDate: null, previousOverdueCount: 0, pastLineStatus: null, pastLineEndedAt: null,
    }));
    renderScreen();
    expect(await screen.findByText('No orders with you yet')).toBeTruthy();
    expect(screen.queryByText(/First order/)).toBeNull();
    expect(screen.queryByText(/cancelled/)).toBeNull();
    expect(screen.queryByText(/Earlier credit line/)).toBeNull();
    expect(screen.getByText('You only see your own history with this restaurant')).toBeTruthy();
  });

  it('lists the line history in the server order', async () => {
    contextM.mockResolvedValue(context({
      history: [
        { at: '2026-10-05T10:00:00Z', event: 'CLOSED', note: 'Paid up' },
        { at: '2026-08-01T10:00:00Z', event: 'REQUESTED', note: null },
      ],
    }));
    renderScreen();
    expect(await screen.findByTestId('history-0')).toBeTruthy();
    expect(screen.getByText('Closed · 5th Oct 2026 · Paid up')).toBeTruthy();
    expect(screen.getByText('Requested · 1st Aug 2026')).toBeTruthy();
    expect(screen.getByTestId('history-1')).toBeTruthy();
  });

  it('shows no card and a neutral line when the context is a 404', async () => {
    contextM.mockRejectedValue(new ApiError({ code: 'X', message: 'nope', status: 404 }));
    renderScreen();
    expect(await screen.findByText('Their history with you is not available.')).toBeTruthy();
    expect(screen.queryByText(/Ordered/)).toBeNull();
    expect(screen.getByTestId('action-approve-asked')).toBeTruthy();
    expect(screen.queryByText('This request is no longer available')).toBeNull();
  });

  it('offers Retry on the card when the context fails for another reason', async () => {
    contextM.mockRejectedValueOnce(new ApiError({ code: 'X', message: 'boom', status: 500 }));
    renderScreen();
    fireEvent.press(await screen.findByTestId('context-retry'));
    expect(await screen.findByText(/Ordered 12 times/)).toBeTruthy();
  });

  it('does not ask for the context without CREDIT_REQUEST_VIEW', async () => {
    mockGranted = ['CREDIT_MODIFY'];
    renderScreen();
    await screen.findByText('Weekly vegetables');
    expect(contextM).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ordered 12 times/)).toBeNull();
  });
});

describe('Request review: permissions', () => {
  it('shows no actions without CREDIT_MODIFY', async () => {
    mockGranted = ['CREDIT_REQUEST_VIEW'];
    renderScreen();
    await screen.findByText('Weekly vegetables');
    expect(screen.queryByTestId('request-actions')).toBeNull();
    expect(screen.queryByTestId('action-approve-asked')).toBeNull();
    expect(screen.queryByTestId('action-decline')).toBeNull();
    expect(policyM).not.toHaveBeenCalled();
  });

  it('shows all four actions with CREDIT_MODIFY', async () => {
    renderScreen();
    await screen.findByText('Weekly vegetables');
    for (const id of ['approve-asked', 'approve-usual', 'change-terms', 'decline']) {
      expect(screen.getByTestId(`action-${id}`)).toBeTruthy();
    }
  });

  it('shows no actions once the request is no longer waiting, and says where it stands', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'APPROVED', offerExpiresOn: '2026-10-20' }));
    renderScreen();
    expect(await screen.findByText('Offer sent, waiting for the restaurant (valid until 20th Oct 2026)')).toBeTruthy();
    expect(screen.queryByTestId('request-actions')).toBeNull();
  });
});

describe('Request review: approve as asked', () => {
  it('states the consequence, then sends no terms', async () => {
    approveM.mockResolvedValue({});
    const { invalidate } = renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(screen.getByTestId('action-approve-asked'));
    expect(screen.getByText(/credit starts at once/i)).toBeTruthy();
    expect(approveM).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('confirm-sheet-confirm'));
    await waitFor(() => expect(approveM).toHaveBeenCalledWith('tok', 31, {}));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith('Credit approved', 'success');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['store', 5, 'credit', 'receivables'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['store', 5, 'credit-agreements'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-agreement', 31] });
  });

  it('sends one request when the button is tapped twice', async () => {
    approveM.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(screen.getByTestId('action-approve-asked'));
    fireEvent.press(screen.getByTestId('confirm-sheet-confirm'));
    fireEvent.press(screen.getByTestId('confirm-sheet-confirm'));
    await waitFor(() => expect(approveM).toHaveBeenCalledTimes(1));
  });

  it('shows the server message on a 409 and refetches the request', async () => {
    approveM.mockRejectedValue(new ApiError({ code: 'INVALID_STATE_TRANSITION', message: 'Already answered', status: 409 }));
    renderScreen();
    await screen.findByText('Weekly vegetables');
    const before = agreementM.mock.calls.length;
    fireEvent.press(screen.getByTestId('action-approve-asked'));
    fireEvent.press(screen.getByTestId('confirm-sheet-confirm'));
    expect(await screen.findByText('Already answered')).toBeTruthy();
    await waitFor(() => expect(agreementM.mock.calls.length).toBeGreaterThan(before));
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('Request review: approve at my usual terms', () => {
  it('previews the exact terms and sends the policy defaults as the body', async () => {
    approveM.mockResolvedValue({});
    renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(await screen.findByTestId('action-approve-usual'));
    expect(screen.getByText('Limit ₹25,000')).toBeTruthy();
    expect(screen.getByText('Pay within 15 days')).toBeTruthy();
    expect(screen.getByText('Grace 2 days')).toBeTruthy();
    expect(screen.getByText('Per-order cap ₹5,000')).toBeTruthy();
    expect(screen.getByText(/Your restaurant will be asked to accept these terms/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('confirm-sheet-confirm'));
    await waitFor(() => expect(approveM).toHaveBeenCalledWith('tok', 31, {
      approvedLimit: '25000', creditPeriodDays: 15, gracePeriodDays: 2, maxSingleOrderCredit: '5000',
    }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Sent with your terms. The restaurant has to accept.', 'success'));
  });

  it('is hidden when the store has no defaults', async () => {
    policyM.mockResolvedValue(policy({ defaultCreditLimit: null, defaultCreditPeriodDays: null }));
    renderScreen();
    await screen.findByText('Weekly vegetables');
    await waitFor(() => expect(policyM).toHaveBeenCalled());
    expect(screen.queryByTestId('action-approve-usual')).toBeNull();
    expect(screen.getByTestId('action-approve-asked')).toBeTruthy();
  });

  it('is hidden when the policy cannot be read', async () => {
    policyM.mockRejectedValue(new ApiError({ code: 'X', message: 'no', status: 403 }));
    renderScreen();
    await screen.findByText('Weekly vegetables');
    await waitFor(() => expect(policyM).toHaveBeenCalled());
    expect(screen.queryByTestId('action-approve-usual')).toBeNull();
  });
});

describe('Request review: change terms', () => {
  it('opens the terms form and sends them as an offer, with the optional note', async () => {
    approveM.mockResolvedValue({});
    renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(screen.getByTestId('action-change-terms'));
    expect(screen.getByTestId('terms-limit').props.value).toBe('50000');
    fireEvent.changeText(screen.getByTestId('terms-limit'), '30000');
    fireEvent.press(screen.getByTestId('terms-period-45'));
    fireEvent.changeText(screen.getByTestId('terms-grace'), '5');
    fireEvent.changeText(screen.getByTestId('terms-reason'), 'Start smaller');
    fireEvent.press(screen.getByTestId('terms-save'));
    await waitFor(() => expect(approveM).toHaveBeenCalledWith('tok', 31, {
      approvedLimit: '30000', creditPeriodDays: 45, gracePeriodDays: 5, note: 'Start smaller',
    }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe('Request review: decline', () => {
  it('needs a reason before it can be sent', async () => {
    renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(screen.getByTestId('action-decline'));
    expect(screen.getByTestId('decline-sheet-confirm').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('decline-sheet-confirm'));
    expect(rejectM).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('decline-sheet-reason'), '  ');
    fireEvent.press(screen.getByTestId('decline-sheet-confirm'));
    expect(rejectM).not.toHaveBeenCalled();
  });

  it('fills the reason from a quick reason and sends it', async () => {
    rejectM.mockResolvedValue({});
    const { invalidate } = renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(screen.getByTestId('action-decline'));
    fireEvent.press(screen.getByText('Not enough order history'));
    expect(screen.getByTestId('decline-sheet-reason').props.value).toBe('Not enough order history');
    fireEvent.press(screen.getByTestId('decline-sheet-confirm'));
    await waitFor(() => expect(rejectM).toHaveBeenCalledWith('tok', 31, 'Not enough order history'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith('Request declined. The restaurant is told.', 'success');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['store', 5, 'credit', 'receivables'] });
  });

  it('"Other" clears the reason so something is typed', async () => {
    rejectM.mockResolvedValue({});
    renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(screen.getByTestId('action-decline'));
    fireEvent.press(screen.getByText('Prefer to be paid upfront'));
    fireEvent.press(screen.getByText('Other'));
    expect(screen.getByTestId('decline-sheet-reason').props.value).toBe('');
    fireEvent.changeText(screen.getByTestId('decline-sheet-reason'), 'Closing the store soon');
    fireEvent.press(screen.getByTestId('decline-sheet-confirm'));
    await waitFor(() => expect(rejectM).toHaveBeenCalledWith('tok', 31, 'Closing the store soon'));
  });

  it('shows the server message when declining is refused', async () => {
    rejectM.mockRejectedValue(new ApiError({ code: 'INVALID_STATE_TRANSITION', message: 'Already answered', status: 409 }));
    renderScreen();
    await screen.findByText('Weekly vegetables');
    fireEvent.press(screen.getByTestId('action-decline'));
    fireEvent.press(screen.getByText('Limit not available now'));
    fireEvent.press(screen.getByTestId('decline-sheet-confirm'));
    expect(await screen.findByTestId('decline-sheet-error')).toBeTruthy();
    expect(screen.getByText('Already answered')).toBeTruthy();
  });
});
