import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierCreditScreen from '@/app/supplier/(tabs)/credit';
import { ApiError } from '@/lib/api/errors';
import {
  approveCredit, fetchReceivableRestaurants, fetchReceivables, fetchStoreAgreements,
} from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/supplier/credit',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/components/supplier/SupplierHeader', () => ({ SupplierHeader: () => null }));
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
  fetchStoreAgreements: jest.fn(),
  fetchReceivables: jest.fn(),
  fetchReceivableRestaurants: jest.fn(),
  approveCredit: jest.fn(),
}));

const receivablesM = fetchReceivables as jest.Mock;
const restaurantsM = fetchReceivableRestaurants as jest.Mock;
const agreementsM = fetchStoreAgreements as jest.Mock;
const approveM = approveCredit as jest.Mock;

const base = (over: Record<string, unknown> = {}) => ({
  asOf: '2026-10-06', totalReceivable: 342000, overdue: 41500, inGrace: 2000, dueToday: 0, dueThisWeek: 58000,
  collectedThisMonth: 120400,
  exposure: { extended: 600000, drawn: 120000, availableToLend: 480000 },
  counts: { restaurants: 2, linesActive: 2, linesSuspended: 0, requestsPending: 0, claimsWaiting: 3, overdueRestaurants: 1 },
  pendingActions: [{ kind: 'CLAIMS_WAITING', count: 3 }, { kind: 'OVERDUE_RESTAURANTS', count: 1 }],
  ...over,
});
const row = (id: number, over: Record<string, unknown> = {}) => ({
  agreementId: id, outletId: 70 + id, outletName: `Outlet ${id}`, restaurantName: `Restaurant ${id}`, status: 'ACTIVE',
  owed: 12000, overdue: 0, nextDueAmount: 6500, nextDueDate: '2026-10-04', dueState: 'DUE_SOON', claimsWaiting: 0,
  limit: 50000, utilized: 25000, utilization: 50.0, ...over,
});
const page = (items: unknown[], over: Record<string, unknown> = {}) =>
  ({ items, page: 0, size: 20, total: items.length, hasNext: false, ...over });
const request = (id: number) => ({
  id, status: 'REQUESTED', outletId: 9, outletName: `Asker ${id}`, restaurantName: 'Spice Co', outletLocality: 'HSR',
  latestRequest: { purpose: 'Weekly vegetables', requestedLimit: '50000.0000', requestedPeriodDays: 30 },
});
const lastRestaurantsParams = () => restaurantsM.mock.calls[restaurantsM.mock.calls.length - 1]?.[2];

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockOffline = false; });

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><SupplierCreditScreen /></QueryClientProvider>);
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  receivablesM.mockResolvedValue(base());
  restaurantsM.mockResolvedValue(page([row(1, { overdue: 6500, dueState: 'OVERDUE', claimsWaiting: 2 }), row(2)]));
  agreementsM.mockResolvedValue([]);
});

describe('Receivables home: figures', () => {
  it('shows what is to be received, overdue, exposure and collected, all from the server', async () => {
    renderTab();
    const hero = await screen.findByTestId('receivables-hero');
    expect(hero.props.accessibilityLabel).toContain('To receive ₹3,42,000.00');
    expect(hero.props.accessibilityLabel).toContain('₹41,500.00 overdue');
    expect(screen.getByTestId('receivables-overdue')).toBeTruthy();
    expect(screen.getByText('Lent ₹1,20,000.00 of ₹6,00,000.00')).toBeTruthy();
    expect(screen.getByText('Collected this month')).toBeTruthy();
    expect(screen.getByText('₹1,20,400.00')).toBeTruthy();
    expect(screen.getByTestId('exposure-bar').props.accessibilityValue).toMatchObject({ now: 20 });
  });

  it('has no overdue line when nothing is overdue', async () => {
    receivablesM.mockResolvedValue(base({ overdue: 0 }));
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(screen.queryByTestId('receivables-overdue')).toBeNull();
  });

  it('shows a crore-scale amount in full', async () => {
    receivablesM.mockResolvedValue(base({ totalReceivable: 999999999.99, overdue: 999999999.99 }));
    renderTab();
    const hero = await screen.findByTestId('receivables-hero');
    expect(hero.props.accessibilityLabel).toContain('₹99,99,99,999.99');
    expect(within(hero).getByText('99,99,99,999')).toBeTruthy();
  });

  it('is a distinct "nothing owed" screen, not an empty one, when lines exist but owe nothing', async () => {
    receivablesM.mockResolvedValue(base({ totalReceivable: 0, overdue: 0, pendingActions: [] }));
    restaurantsM.mockResolvedValue(page([row(1, { owed: 0, nextDueAmount: null, nextDueDate: null, dueState: null })]));
    renderTab();
    expect((await screen.findByTestId('receivables-hero')).props.accessibilityLabel).toContain('₹0.00');
    expect(screen.getByText('Outlet 1')).toBeTruthy();
    expect(screen.queryByText('No restaurant has credit with you yet')).toBeNull();
  });
});

describe('Receivables home: states', () => {
  it('shows a skeleton while loading', () => {
    receivablesM.mockReturnValue(new Promise(() => undefined));
    renderTab();
    expect(screen.queryByTestId('receivables-hero')).toBeNull();
    expect(screen.queryByText("Couldn't load your receivables.")).toBeNull();
  });

  it('says so, with Retry, when it cannot load, and Retry refetches', async () => {
    receivablesM.mockRejectedValueOnce(new Error('boom'));
    renderTab();
    fireEvent.press(await screen.findByText('Try again'));
    expect(await screen.findByTestId('receivables-hero')).toBeTruthy();
    expect(receivablesM).toHaveBeenCalledTimes(2);
  });

  it('explains how credit starts when no restaurant has a line yet', async () => {
    receivablesM.mockResolvedValue(base({
      totalReceivable: 0, overdue: 0, pendingActions: [],
      counts: { restaurants: 0, linesActive: 0, linesSuspended: 0, requestsPending: 0, claimsWaiting: 0, overdueRestaurants: 0 },
    }));
    restaurantsM.mockResolvedValue(page([]));
    renderTab();
    expect(await screen.findByText('No restaurant has credit with you yet')).toBeTruthy();
    expect(screen.getByText(/asks you for credit/)).toBeTruthy();
  });

  it('shows a friendly no-access view when the server says 404', async () => {
    receivablesM.mockRejectedValue(new ApiError({ code: 'NOT_FOUND', message: 'nope', status: 404 }));
    renderTab();
    expect(await screen.findByText("You don't have access to credit for this store")).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('shows the offline banner', async () => {
    mockOffline = true;
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('refetches everything on pull to refresh', async () => {
    renderTab();
    await screen.findByTestId('receivables-hero');
    await act(async () => { screen.getByTestId('mandi-screen-scroll').props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(receivablesM).toHaveBeenCalledTimes(2));
    expect(restaurantsM.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the hero when only the restaurant list fails, and retries the list', async () => {
    restaurantsM.mockRejectedValueOnce(new Error('boom'));
    renderTab();
    expect(await screen.findByTestId('receivables-hero')).toBeTruthy();
    fireEvent.press(await screen.findByText('Try again'));
    expect(await screen.findByText('Outlet 1')).toBeTruthy();
  });
});

describe('Receivables home: round actions', () => {
  it('opens claims (with the count), ageing, payouts', async () => {
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(within(screen.getByTestId('action-claims-badge')).getByText('3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('action-claims'));
    expect(mockPush).toHaveBeenLastCalledWith('/supplier/credit/claims');
    fireEvent.press(screen.getByTestId('action-ageing'));
    expect(mockPush).toHaveBeenLastCalledWith('/supplier/credit/ageing');
    fireEvent.press(screen.getByTestId('action-payouts'));
    expect(mockPush).toHaveBeenLastCalledWith('/supplier/credit/payouts');
  });

  it('has no badge when no claim waits', async () => {
    receivablesM.mockResolvedValue(base({ counts: { ...base().counts, claimsWaiting: 0 }, pendingActions: [] }));
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(screen.queryByTestId('action-claims-badge')).toBeNull();
  });

  it('Requests says there is nothing to answer when none wait', async () => {
    renderTab();
    await screen.findByTestId('receivables-hero');
    fireEvent.press(screen.getByTestId('action-requests'));
    expect(mockToast).toHaveBeenCalledWith('No credit requests waiting', 'info');
  });
});

describe('Receivables home: pending actions come from the server', () => {
  it('renders exactly the kinds sent, and nothing else', async () => {
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(screen.getByTestId('pending-CLAIMS_WAITING')).toBeTruthy();
    expect(screen.getByTestId('pending-OVERDUE_RESTAURANTS')).toBeTruthy();
    expect(screen.queryByTestId('pending-REQUESTS_PENDING')).toBeNull();
    expect(screen.queryByTestId('pending-LINE_AT_LIMIT')).toBeNull();
    expect(screen.getByText('3 payments waiting for your OK')).toBeTruthy();
    expect(screen.getByText('1 restaurant overdue')).toBeTruthy();
  });

  it('shows no strip when the server sends none, even with claims counted', async () => {
    receivablesM.mockResolvedValue(base({ pendingActions: [] }));
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(screen.queryByTestId('pending-strip')).toBeNull();
  });

  it('ignores a kind it does not know', async () => {
    receivablesM.mockResolvedValue(base({ pendingActions: [{ kind: 'FUTURE_THING', count: 2 }] }));
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(screen.queryByTestId('pending-FUTURE_THING')).toBeNull();
    expect(screen.queryByTestId('pending-strip')).toBeNull();
  });

  it('claims chip opens the claims inbox', async () => {
    renderTab();
    fireEvent.press(await screen.findByTestId('pending-CLAIMS_WAITING'));
    expect(mockPush).toHaveBeenCalledWith('/supplier/credit/claims');
  });

  it('overdue chip sorts the list by most overdue', async () => {
    renderTab();
    await screen.findByText('Outlet 1');
    fireEvent.press(screen.getByTestId('sort-owed'));
    await waitFor(() => expect(lastRestaurantsParams().sort).toBe('owed'));
    fireEvent.press(screen.getByTestId('pending-OVERDUE_RESTAURANTS'));
    await waitFor(() => expect(lastRestaurantsParams().sort).toBe('overdue'));
    expect(screen.getByTestId('sort-overdue').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('at-limit chip brings the biggest lines forward', async () => {
    receivablesM.mockResolvedValue(base({ pendingActions: [{ kind: 'LINE_AT_LIMIT', count: 2 }] }));
    renderTab();
    fireEvent.press(await screen.findByTestId('pending-LINE_AT_LIMIT'));
    await waitFor(() => expect(lastRestaurantsParams().sort).toBe('owed'));
    expect(screen.getByText('2 lines at their limit')).toBeTruthy();
  });

  it('requests chip stays on the screen and does not open anything', async () => {
    receivablesM.mockResolvedValue(base({
      counts: { ...base().counts, requestsPending: 1 }, pendingActions: [{ kind: 'REQUESTS_PENDING', count: 1 }],
    }));
    agreementsM.mockResolvedValue([request(31)]);
    renderTab();
    fireEvent.press(await screen.findByTestId('pending-REQUESTS_PENDING'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Asker 31')).toBeTruthy();
  });
});

describe('Receivables home: the restaurant list', () => {
  it('asks the server for most overdue, all lines, first page', async () => {
    renderTab();
    await screen.findByText('Outlet 1');
    expect(restaurantsM).toHaveBeenCalledWith('tok', 5, { sort: 'overdue', status: null, q: '', page: 0, size: 20 });
  });

  it('sends the sort the chip names', async () => {
    renderTab();
    await screen.findByText('Outlet 1');
    fireEvent.press(screen.getByTestId('sort-owed'));
    await waitFor(() => expect(lastRestaurantsParams().sort).toBe('owed'));
    fireEvent.press(screen.getByTestId('sort-nextDue'));
    await waitFor(() => expect(lastRestaurantsParams().sort).toBe('nextDue'));
    fireEvent.press(screen.getByTestId('sort-overdue'));
    await waitFor(() => expect(lastRestaurantsParams().sort).toBe('overdue'));
  });

  it('sends the status filter', async () => {
    renderTab();
    await screen.findByText('Outlet 1');
    fireEvent.press(screen.getByTestId('status-SUSPENDED'));
    await waitFor(() => expect(lastRestaurantsParams().status).toBe('SUSPENDED'));
    fireEvent.press(screen.getByTestId('status-ACTIVE'));
    await waitFor(() => expect(lastRestaurantsParams().status).toBe('ACTIVE'));
    fireEvent.press(screen.getByTestId('status-ALL'));
    await waitFor(() => expect(lastRestaurantsParams().status).toBeNull());
  });

  it('sends the search text once typing settles, and restarts at page 0', async () => {
    renderTab();
    await screen.findByText('Outlet 1');
    fireEvent.changeText(screen.getByTestId('receivables-search'), '  dosa ');
    await waitFor(() => expect(lastRestaurantsParams().q).toBe('dosa'));
    expect(lastRestaurantsParams().page).toBe(0);
  });

  it('shows a row per restaurant: names, owed, overdue chip, next due, claims dot, utilisation', async () => {
    renderTab();
    const first = await screen.findByTestId('restaurant-row-1');
    expect(within(first).getByText('Outlet 1')).toBeTruthy();
    expect(within(first).getByText('Restaurant 1')).toBeTruthy();
    expect(within(first).getByText('₹12,000.00')).toBeTruthy();
    expect(within(first).getByText('₹6,500.00 overdue')).toBeTruthy();
    expect(within(first).getByText('Due ₹6,500.00 on 4th Oct 2026')).toBeTruthy();
    expect(within(first).getByTestId('claims-dot-1')).toBeTruthy();
    expect(within(first).getByTestId('utilisation-1').props.accessibilityValue).toMatchObject({ now: 50 });
    expect(within(first).getByText('50% of limit used')).toBeTruthy();
    const second = screen.getByTestId('restaurant-row-2');
    expect(within(second).queryByTestId('claims-dot-2')).toBeNull();
    expect(within(second).queryByText(/overdue/)).toBeNull();
  });

  it('marks a suspended line and handles a null utilisation', async () => {
    restaurantsM.mockResolvedValue(page([row(3, { status: 'SUSPENDED', utilization: null, limit: 0 })]));
    renderTab();
    const r = await screen.findByTestId('restaurant-row-3');
    expect(within(r).getByText('suspended')).toBeTruthy();
    expect(within(r).queryByTestId('utilisation-3')).toBeNull();
  });

  it('opens the restaurant detail', async () => {
    renderTab();
    fireEvent.press(await screen.findByTestId('restaurant-row-2'));
    expect(mockPush).toHaveBeenCalledWith('/supplier/credit/2');
  });

  it('keeps a long name to two lines and a huge owed amount on one', async () => {
    restaurantsM.mockResolvedValue(page([row(4, {
      outletName: 'A very long outlet name that goes on and on beyond any reasonable width for a phone',
      owed: 999999999.99,
    })]));
    renderTab();
    const r = await screen.findByTestId('restaurant-row-4');
    expect(within(r).getByText(/A very long outlet name/).props.numberOfLines).toBe(2);
    expect(within(r).getByText('₹99,99,99,999.99').props.numberOfLines).toBe(1);
  });

  it('appends the next page when asked and stops when there is none', async () => {
    restaurantsM
      .mockResolvedValueOnce(page([row(1), row(2)], { hasNext: true, total: 3 }))
      .mockResolvedValueOnce(page([row(3)], { page: 1, hasNext: false, total: 3 }));
    renderTab();
    await screen.findByText('Outlet 1');
    fireEvent.press(screen.getByTestId('show-more'));
    expect(await screen.findByText('Outlet 3')).toBeTruthy();
    expect(screen.getByText('Outlet 1')).toBeTruthy();
    expect(lastRestaurantsParams().page).toBe(1);
    expect(screen.queryByTestId('show-more')).toBeNull();
  });

  it('says nothing matched, rather than "no credit", for a search with no results', async () => {
    renderTab();
    await screen.findByText('Outlet 1');
    restaurantsM.mockResolvedValue(page([]));
    fireEvent.changeText(screen.getByTestId('receivables-search'), 'zzz');
    expect(await screen.findByText('No restaurant matches')).toBeTruthy();
    expect(screen.queryByText('No restaurant has credit with you yet')).toBeNull();
  });
});

describe('Receivables home: new requests still work', () => {
  const withRequests = () => {
    receivablesM.mockResolvedValue(base({
      counts: { ...base().counts, requestsPending: 2 }, pendingActions: [{ kind: 'REQUESTS_PENDING', count: 2 }],
    }));
    agreementsM.mockResolvedValue([request(31), request(32), { ...request(33), status: 'ACTIVE' }]);
  };

  it('lists the requests on top when some wait, and only those', async () => {
    withRequests();
    renderTab();
    expect(await screen.findByText('Asker 31')).toBeTruthy();
    expect(screen.getByText('Asker 32')).toBeTruthy();
    expect(screen.queryByText('Asker 33')).toBeNull();
    expect(screen.getByText(/^New requests/)).toBeTruthy();
  });

  it('is absent when the server counts none', async () => {
    agreementsM.mockResolvedValue([request(31)]);
    renderTab();
    await screen.findByTestId('receivables-hero');
    expect(screen.queryByText(/^New requests/)).toBeNull();
    expect(screen.queryByText('Approve as asked')).toBeNull();
  });

  it('approves exactly what was asked, with no changes', async () => {
    withRequests();
    approveM.mockResolvedValue({});
    const { invalidate } = renderTab();
    await screen.findByText('Asker 31');
    fireEvent.press(screen.getAllByText('Approve as asked')[0] as never);
    await waitFor(() => expect(approveM).toHaveBeenCalledWith('tok', 31, {}));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['store', 5, 'credit', 'receivables'] }));
    expect(mockToast).toHaveBeenCalledWith('Credit approved', 'success');
  });

  it('reports a refusal and opens Review on the request', async () => {
    withRequests();
    approveM.mockRejectedValue(new ApiError({ code: 'X', message: 'Not allowed', status: 409 }));
    renderTab();
    await screen.findByText('Asker 31');
    fireEvent.press(screen.getAllByText('Approve as asked')[0] as never);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Not allowed', 'error'));
    fireEvent.press(screen.getAllByText('Review')[1] as never);
    expect(mockPush).toHaveBeenCalledWith('/supplier/credit/request/32');
  });
});

describe('Receivables home: request cards', () => {
  const dated = (id: number, createdAt: string | null, over: Record<string, unknown> = {}) => ({
    ...request(id), latestRequest: { purpose: 'Veg', requestedLimit: '50000.0000', requestedPeriodDays: 30, createdAt }, ...over,
  });
  const pending = () => base({
    counts: { ...base().counts, requestsPending: 2 }, pendingActions: [{ kind: 'REQUESTS_PENDING', count: 2 }],
  });

  it('puts the oldest request first and says how long it has waited, from the server timestamp', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    jest.setSystemTime(new Date('2026-10-06T10:00:00Z'));
    receivablesM.mockResolvedValue(pending());
    agreementsM.mockResolvedValue([
      dated(41, '2026-10-05T10:00:00Z'), dated(42, '2026-10-01T10:00:00Z'), dated(43, null),
    ]);
    renderTab();
    await screen.findByText('Asker 41');
    const names = screen.getAllByText(/^Asker \d+/).map((n) => n.props.children);
    expect(names).toEqual(['Asker 42', 'Asker 41', 'Asker 43']);
    expect(screen.getByText('Waiting 5 days')).toBeTruthy();
    expect(screen.getByText('Waiting 1 day')).toBeTruthy();
    jest.useRealTimers();
  });

  it('words an offer waiting for the restaurant, with no actions on it', async () => {
    receivablesM.mockResolvedValue(pending());
    agreementsM.mockResolvedValue([
      request(31),
      { ...request(32), status: 'APPROVED', offerExpiresOn: '2026-10-20', offerMadeAt: '2026-10-06T00:00:00Z' },
    ]);
    renderTab();
    expect(await screen.findByText('Offer sent, waiting for the restaurant (valid until 20th Oct 2026)')).toBeTruthy();
    expect(screen.getAllByText('Approve as asked')).toHaveLength(1);
    expect(screen.getAllByText('Review')).toHaveLength(1);
  });

  it('says an offer expired, with no actions', async () => {
    receivablesM.mockResolvedValue(pending());
    agreementsM.mockResolvedValue([request(31), { ...request(32), status: 'EXPIRED' }]);
    renderTab();
    expect(await screen.findByText('Offer expired')).toBeTruthy();
    expect(screen.getAllByText('Approve as asked')).toHaveLength(1);
  });
});

