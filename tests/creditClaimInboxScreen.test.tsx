import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KeyboardAvoidingView } from 'react-native';
import ClaimsInboxScreen from '@/app/supplier/credit/claims';
import { ApiError } from '@/lib/api/errors';
import { resetAttemptKeys } from '@/lib/credit/attemptKeys';
import { confirmClaim, fetchStoreClaims, rejectClaim } from '@/services/credit';
import { MandiSkeletonCard } from '@/components/common';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/supplier/credit/claims',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/components/supplier/StoreSelector', () => ({ StoreSelector: () => null }));
let mockGranted: string[] = ['CREDIT_MODIFY'];
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
  fetchStoreClaims: jest.fn(),
  confirmClaim: jest.fn(),
  rejectClaim: jest.fn(),
}));

const listM = fetchStoreClaims as jest.Mock;
const confirmM = confirmClaim as jest.Mock;
const rejectM = rejectClaim as jest.Mock;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const claim = (id: number, o: Record<string, unknown> = {}) => ({
  id, invoiceId: 10 + id, invoiceNumber: `INV-${id}`, agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', amount: '5000.0000', method: 'UPI', reference: `UTR${id}`, paidOn: '2026-10-01',
  note: null, status: 'SUBMITTED', decisionNote: null, confirmedAmount: null, creditPaymentId: null,
  createdAt: daysAgo(3), decidedAt: null, ...o,
});
const LIST = [
  claim(1, { note: 'paid at the counter' }),
  claim(2, { restaurantName: 'Dosa House', outletName: 'HSR', method: 'CASH', reference: null, amount: '1200.5000' }),
  claim(3),
];

const apiError = (code: string, status: number, message = `server says ${code}`) =>
  new ApiError({ code, message, status });
const deferred = <T,>() => {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const refetch = jest.spyOn(client, 'refetchQueries');
  render(<QueryClientProvider client={client}><ClaimsInboxScreen /></QueryClientProvider>);
  return { invalidate, refetch };
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;
async function openSheet(id = 1) {
  renderScreen();
  await screen.findByTestId(`claim-row-${id}`);
  press(`claim-row-${id}`);
  await screen.findByTestId('claim-review-sheet');
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAttemptKeys();
  mockGranted = ['CREDIT_MODIFY'];
  mockOffline = false;
  listM.mockResolvedValue(LIST);
  confirmM.mockResolvedValue({ ...claim(1), status: 'CONFIRMED' });
  rejectM.mockResolvedValue({ ...claim(1), status: 'REJECTED' });
});

describe('the list', () => {
  it('asks the server for the claims waiting', async () => {
    renderScreen();
    await screen.findByTestId('claim-row-1');
    expect(listM).toHaveBeenCalledWith('tok', 5, 'SUBMITTED');
  });

  it('groups claims by restaurant and shows every fact', async () => {
    renderScreen();
    await screen.findByTestId('claim-row-1');
    const spice = within(screen.getByTestId('claim-group-Spice Co'));
    expect(spice.getByTestId('claim-row-1')).toBeTruthy();
    expect(spice.getByTestId('claim-row-3')).toBeTruthy();
    expect(spice.queryByTestId('claim-row-2')).toBeNull();
    const row = within(screen.getByTestId('claim-row-1'));
    for (const pattern of [/INV-1/, /₹5,000/, /UPI/, /UTR1/, /paid at the counter/, /3 days ago/, /icon:cash-check/]) {
      expect(row.getByText(pattern)).toBeTruthy();
    }
    expect(within(screen.getByTestId('claim-group-Dosa House')).getByTestId('claim-row-2')).toBeTruthy();
  });

  it('shows a skeleton while loading', () => {
    listM.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.queryByTestId('claim-row-1')).toBeNull();
    expect(screen.UNSAFE_getAllByType(MandiSkeletonCard).length).toBeGreaterThan(0);
    expect(screen.queryByText('No payments waiting for you')).toBeNull();
  });

  it('says plainly when nothing is waiting', async () => {
    listM.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('No payments waiting for you')).toBeTruthy();
  });

  it('shows an error with a retry that asks again', async () => {
    listM.mockRejectedValueOnce(apiError('X', 500));
    renderScreen();
    expect(await screen.findByText(/Couldn't load/)).toBeTruthy();
    fireEvent.press(screen.getByText('Try Again'));
    await screen.findByTestId('claim-row-1');
    expect(listM).toHaveBeenCalledTimes(2);
  });

  it('says so when offline', async () => {
    mockOffline = true;
    renderScreen();
    await screen.findByTestId('claim-row-1');
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('refreshes by pulling down', async () => {
    renderScreen();
    await screen.findByTestId('claim-row-1');
    const scroll = screen.getByTestId('mandi-screen-scroll');
    await act(async () => { await scroll.props.refreshControl.props.onRefresh(); });
    expect(listM).toHaveBeenCalledTimes(2);
  });
});

describe('confirming', () => {
  it('prefills the claimed amount and confirms in full without sending an amount', async () => {
    await openSheet();
    expect(screen.getByTestId('claim-confirm-amount').props.value).toBe('5000');
    press('claim-confirm');
    await waitFor(() => expect(confirmM).toHaveBeenCalledTimes(1));
    expect(confirmM).toHaveBeenCalledWith('tok', 1, expect.any(String), undefined);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/confirmed/i), 'success'));
  });

  it('confirms a lower amount and sends it', async () => {
    await openSheet();
    fireEvent.changeText(screen.getByTestId('claim-confirm-amount'), '3000');
    press('claim-confirm');
    await waitFor(() => expect(confirmM).toHaveBeenCalledWith('tok', 1, expect.any(String), '3000.00'));
  });

  it('blocks an amount above the claim and sends nothing', async () => {
    await openSheet();
    fireEvent.changeText(screen.getByTestId('claim-confirm-amount'), '5001');
    expect(screen.getByText(/more than/i)).toBeTruthy();
    expect(disabled('claim-confirm')).toBe(true);
    press('claim-confirm');
    expect(confirmM).not.toHaveBeenCalled();
  });

  it('a double tap sends once', async () => {
    const d = deferred<unknown>();
    confirmM.mockReturnValue(d.promise);
    await openSheet();
    press('claim-confirm');
    press('claim-confirm');
    expect(confirmM).toHaveBeenCalledTimes(1);
    expect(disabled('claim-confirm')).toBe(true);
    expect(disabled('claim-reject-start')).toBe(true);
    await act(async () => { d.resolve({ ...claim(1), status: 'CONFIRMED' }); });
  });

  it('refetches the claims, agreements and invoices after success and closes the sheet', async () => {
    const { invalidate } = renderScreen();
    await screen.findByTestId('claim-row-1');
    press('claim-row-1');
    await screen.findByTestId('claim-review-sheet');
    press('claim-confirm');
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['store', 5, 'credit-claims']),
      JSON.stringify(['store', 5, 'credit-agreements']),
      JSON.stringify(['credit-agreement']),
    ]));
    await waitFor(() => expect(screen.queryByTestId('claim-review-sheet')).toBeNull());
  });

  it('keeps the same key when the same confirm is retried after a network failure', async () => {
    confirmM.mockRejectedValueOnce(new Error('network'));
    await openSheet();
    press('claim-confirm');
    await screen.findByTestId('claim-error');
    press('claim-confirm');
    await waitFor(() => expect(confirmM).toHaveBeenCalledTimes(2));
    expect(confirmM.mock.calls[1]![2]).toBe(confirmM.mock.calls[0]![2]);
  });

  it('shows the server message on CREDIT_OVERPAYMENT and refreshes', async () => {
    confirmM.mockRejectedValue(apiError('CREDIT_OVERPAYMENT', 409, 'You can confirm at most ₹4,000.'));
    await openSheet();
    press('claim-confirm');
    expect(await screen.findByText('You can confirm at most ₹4,000.')).toBeTruthy();
    expect(disabled('claim-confirm')).toBe(false);
  });

  it('shows the server message on CREDIT_CLAIM_STATE and refetches the list', async () => {
    confirmM.mockRejectedValue(apiError('CREDIT_CLAIM_STATE', 409, 'This was already settled.'));
    await openSheet();
    press('claim-confirm');
    expect(await screen.findByText('This was already settled.')).toBeTruthy();
    await waitFor(() => expect(listM.mock.calls.length).toBeGreaterThan(1));
  });

  it('is off while offline', async () => {
    mockOffline = true;
    await openSheet();
    expect(disabled('claim-confirm')).toBe(true);
    press('claim-confirm');
    expect(confirmM).not.toHaveBeenCalled();
  });
});

describe('rejecting', () => {
  it('needs a reason', async () => {
    await openSheet();
    press('claim-reject-start');
    expect(disabled('claim-reject-send')).toBe(true);
    press('claim-reject-send');
    expect(rejectM).not.toHaveBeenCalled();
    press('reject-reason-Other');
    expect(disabled('claim-reject-send')).toBe(true);
    fireEvent.changeText(screen.getByTestId('reject-text'), 'ab');
    expect(disabled('claim-reject-send')).toBe(true);
  });

  it('sends a quick reason', async () => {
    await openSheet();
    press('claim-reject-start');
    press('reject-reason-Not received');
    press('claim-reject-send');
    await waitFor(() => expect(rejectM).toHaveBeenCalledWith('tok', 1, 'Not received'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/not received|told/i), 'success'));
  });

  it('sends a free-text reason once on a double tap', async () => {
    const d = deferred<unknown>();
    rejectM.mockReturnValue(d.promise);
    await openSheet();
    press('claim-reject-start');
    press('reject-reason-Other');
    fireEvent.changeText(screen.getByTestId('reject-text'), 'no money in my account');
    press('claim-reject-send');
    press('claim-reject-send');
    expect(rejectM).toHaveBeenCalledTimes(1);
    expect(rejectM).toHaveBeenCalledWith('tok', 1, 'no money in my account');
    await act(async () => { d.resolve({}); });
  });

  it('shows a server error', async () => {
    rejectM.mockRejectedValue(apiError('CREDIT_CLAIM_STATE', 409, 'Already answered.'));
    await openSheet();
    press('claim-reject-start');
    press('reject-reason-Wrong supplier');
    press('claim-reject-send');
    expect(await screen.findByText('Already answered.')).toBeTruthy();
  });
});

describe('permission', () => {
  it('CREDIT_COLLECT alone may act', async () => {
    mockGranted = ['CREDIT_COLLECT'];
    await openSheet();
    expect(screen.getByTestId('claim-confirm')).toBeTruthy();
  });

  it('without either permission the sheet is view-only with an explanation', async () => {
    mockGranted = ['CREDIT_VIEW'];
    await openSheet();
    expect(screen.queryByTestId('claim-confirm')).toBeNull();
    expect(screen.queryByTestId('claim-reject-start')).toBeNull();
    expect(screen.getByTestId('claims-view-only')).toBeTruthy();
    expect(screen.getByTestId('claim-review-sheet')).toBeTruthy();
  });
});

describe('the sheet with the keyboard open', () => {
  it('keeps the form in a scroll container inside a keyboard-avoiding wrapper', async () => {
    await openSheet();
    const wrapper = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(wrapper.props.behavior).toBe('padding');
    const avoiding = screen.getByTestId('claim-review-sheet-keyboard-avoiding');
    const scroll = screen.getByTestId('claim-review-sheet-scroll');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(within(avoiding).getByTestId('claim-review-sheet-scroll')).toBeTruthy();
    expect(within(scroll).getByTestId('claim-confirm-amount')).toBeTruthy();
    expect(within(scroll).getByTestId('claim-confirm')).toBeTruthy();
  });
});
