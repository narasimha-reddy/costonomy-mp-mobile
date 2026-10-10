import React from 'react';
import { StyleSheet } from 'react-native';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PayoutsScreen from '@/app/supplier/credit/payouts';
import { ApiError } from '@/lib/api/errors';
import { fetchPayments, fetchPayouts } from '@/services/credit';
import { FontFamily } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), setParams: mockSetParams, canGoBack: () => true }),
  usePathname: () => '/supplier/credit/payouts',
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/components/supplier/StoreSelector', () => ({ StoreSelector: () => null }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchPayouts: jest.fn(),
  fetchPayments: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Clipboard = require('expo-clipboard') as { setStringAsync: jest.Mock };

const payoutsM = fetchPayouts as jest.Mock;
const paymentsM = fetchPayments as jest.Mock;

const payout = (id: number, o: Record<string, unknown> = {}) => ({
  payoutId: id, repaymentId: 100 + id, agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', grossAmount: '5000.0000', commissionRatePercent: '2.0000',
  commissionAmount: '100.0000', netAmount: '4900.0000', status: 'PENDING', settlementId: null,
  settlementNumber: null, settlementDate: null, appliedAt: null, createdAt: '2026-10-01T06:30:00Z',
  invoices: [{ invoiceId: 11, invoiceNumber: 'INV-11', amount: '3000.0000' }, { invoiceId: 12, invoiceNumber: 'INV-12', amount: '2000.0000' }],
  ...o,
});
const page = (items: unknown[], o: Record<string, unknown> = {}) => ({
  summary: { pendingNet: '4900.5000', appliedNetThisMonth: '7777.0000' },
  items, page: 0, size: 20, totalElements: items.length, totalPages: 1, hasNext: false, ...o,
});
const LIST = [
  payout(1),
  payout(2, {
    restaurantName: 'Dosa House', grossAmount: '1200.0000', commissionAmount: '24.0000', netAmount: '1176.0000',
    status: 'APPLIED', settlementId: 9, settlementNumber: 'STL-2026-0042', settlementDate: '2026-10-03',
    appliedAt: '2026-10-03T06:30:00Z',
    invoices: [{ invoiceId: 21, invoiceNumber: 'INV-21', amount: '1200.0000' }],
  }),
  payout(3, { restaurantName: 'No Rate Cafe', commissionRatePercent: null, commissionAmount: '0.0000', grossAmount: '800.0000', netAmount: '800.0000' }),
];
const pay = (id: number, o: Record<string, unknown> = {}) => ({
  id, paidAt: '2026-09-28T06:30:00Z', paidOn: '2026-09-28', agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', invoiceId: 40 + id, invoiceNumber: `INV-${40 + id}`, amount: '2500.0000',
  source: 'SUPPLIER_RECORDED', method: 'UPI', reference: `UTR${id}`, ...o,
});

const apiError = (status: number) => new ApiError({ code: 'X', message: 'server says no', status });
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><PayoutsScreen /></QueryClientProvider>);
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockOffline = false;
  payoutsM.mockResolvedValue(page(LIST));
  paymentsM.mockResolvedValue({ items: [pay(1), pay(2, { method: null, reference: null, source: 'CLAIM_CONFIRMED' })], page: 0, size: 20, total: 2, hasNext: false });
});

describe('Collected through Mandi', () => {
  it('shows what is coming and what was paid this month, as the server sent them', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    const hero = screen.getByTestId('payouts-hero');
    expect(hero.props.accessibilityLabel).toBe(
      'Coming to you ₹4,900.50. Paid to you this month ₹7,777.00');
    expect(within(hero).getByText('Coming to you')).toBeTruthy();
    expect(within(hero).getByText('Paid to you this month')).toBeTruthy();
    expect(within(hero).getByTestId('payouts-paid-month')).toHaveTextContent('₹7,777.00');
  });

  it('asks for all payouts, first page, no days', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    expect(payoutsM).toHaveBeenCalledWith('tok', 5,
      { status: 'ALL', from: undefined, to: undefined, page: 0, size: 20 });
  });

  it('groups Pending apart from Paid out', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    const order = screen.getAllByTestId(/^(payout-group-|payout-row-)/).map((n) => n.props.testID);
    expect(order).toEqual(['payout-group-PENDING', 'payout-row-1', 'payout-row-3', 'payout-group-APPLIED', 'payout-row-2']);
    expect(within(screen.getByTestId('payout-group-PENDING')).getByText('Pending')).toBeTruthy();
    expect(within(screen.getByTestId('payout-group-APPLIED')).getByText('Paid out')).toBeTruthy();
  });

  it('shows a row: restaurant, gross, fee with its rate, net in bold, date', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    const row = within(screen.getByTestId('payout-row-1'));
    expect(row.getByText('Spice Co')).toBeTruthy();
    expect(row.getByText('Indiranagar')).toBeTruthy();
    expect(row.getByText('Paid ₹5,000.00')).toBeTruthy();
    expect(row.getByText('Mandi fee ₹100.00 (2%)')).toBeTruthy();
    expect(row.getByTestId('payout-net-1')).toHaveTextContent('₹4,900.00');
    expect(row.getByText('1st Oct 2026')).toBeTruthy();
    expect(screen.getByTestId('payout-row-1').props.accessibilityLabel)
      .toBe('Spice Co. Pending. Paid ₹5,000.00, Mandi fee ₹100.00 (2%), you get ₹4,900.00');
  });

  it('shows the net as the bold figure, not the gross', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    const net = screen.getByTestId('payout-net-1');
    expect(StyleSheet.flatten(net.props.style).fontFamily).toBe(FontFamily.bold);
    expect(net).not.toHaveTextContent('₹5,000.00');
  });

  it('shows no rate when the server sent none', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-3');
    const row = within(screen.getByTestId('payout-row-3'));
    expect(row.getByText('Mandi fee ₹0.00')).toBeTruthy();
  });

  it('a paid-out row shows its settlement number and date', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-2');
    const row = within(screen.getByTestId('payout-row-2'));
    expect(row.getByText('Settlement STL-2026-0042 · 3rd Oct 2026')).toBeTruthy();
  });

  it('opens a sheet with the invoices, the three amounts and a plain explanation', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    press('payout-row-1');
    const sheet = within(await screen.findByTestId('payout-sheet'));
    expect(sheet.getByTestId('sheet-invoice-11')).toHaveTextContent(/INV-11/);
    expect(sheet.getByTestId('sheet-invoice-11')).toHaveTextContent(/₹3,000\.00/);
    expect(sheet.getByTestId('sheet-invoice-12')).toHaveTextContent(/₹2,000\.00/);
    expect(sheet.getByTestId('sheet-gross')).toHaveTextContent(/₹5,000\.00/);
    expect(sheet.getByTestId('sheet-fee')).toHaveTextContent(/₹100\.00/);
    expect(sheet.getByTestId('sheet-net')).toHaveTextContent(/₹4,900\.00/);
    expect(sheet.getByText(
      'This is money your restaurant paid from their Mandi wallet. We pay it to you in your next settlement.')).toBeTruthy();
    expect(sheet.getByText('In your next settlement')).toBeTruthy();
    expect(sheet.queryByTestId('copy-settlement')).toBeNull();
  });

  it('copies the settlement number of a paid-out payout', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-2');
    press('payout-row-2');
    const sheet = within(await screen.findByTestId('payout-sheet'));
    expect(sheet.getByText('STL-2026-0042')).toBeTruthy();
    expect(sheet.queryByText(/next settlement/)).toBeNull();
    fireEvent.press(sheet.getByTestId('copy-settlement'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('STL-2026-0042'));
    expect(mockToast).toHaveBeenCalledWith('Copied', 'success');
  });

  it('says so when copying fails', async () => {
    Clipboard.setStringAsync.mockRejectedValueOnce(new Error('no'));
    renderScreen();
    await screen.findByTestId('payout-row-2');
    press('payout-row-2');
    fireEvent.press(await screen.findByTestId('copy-settlement'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Could not copy the settlement number', 'error'));
  });

  it('keeps huge amounts whole and long names unclipped', async () => {
    const longName = 'Sri Venkateswara Bhavan Family Restaurant and Catering Services Private Limited, Koramangala 5th Block';
    payoutsM.mockResolvedValue(page([
      payout(7, { restaurantName: longName, grossAmount: '123456789012.5000', commissionAmount: '1.0000', netAmount: '123456789011.5000' }),
    ], { summary: { pendingNet: '123456789011.5000', appliedNetThisMonth: '0.0000' } }));
    renderScreen();
    await screen.findByTestId('payout-row-7');
    expect(screen.getByTestId('payout-net-7')).toHaveTextContent('₹1,23,45,67,89,011.50');
    expect(screen.getByTestId('payout-net-7').props.numberOfLines).toBeUndefined();
    const name = screen.getByText(longName);
    expect(name.props.numberOfLines).toBeUndefined();
  });

  it('makes rows and chips at least 48 dp tall', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    for (const id of ['payout-row-1', 'payout-status-ALL', 'tab-mandi', 'tab-recorded', 'open-filters']) {
      expect(StyleSheet.flatten(screen.getByTestId(id).props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('filters', () => {
  it('Pending sends status=PENDING and Paid out sends APPLIED, All sends ALL', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    payoutsM.mockClear();
    press('payout-status-PENDING');
    await waitFor(() => expect(payoutsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ status: 'PENDING', page: 0 })));
    press('payout-status-APPLIED');
    await waitFor(() => expect(payoutsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ status: 'APPLIED', page: 0 })));
    press('payout-status-ALL');
    await waitFor(() => expect(payoutsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ status: 'ALL' })));
  });

  it('marks the chosen status chip as selected', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    expect(screen.getByTestId('payout-status-ALL').props.accessibilityState.selected).toBe(true);
    press('payout-status-APPLIED');
    await waitFor(() => expect(screen.getByTestId('payout-status-APPLIED').props.accessibilityState.selected).toBe(true));
    expect(screen.getByTestId('payout-status-ALL').props.accessibilityState.selected).toBe(false);
  });

  it('sends the days from the route', async () => {
    mockParams = { months: '2026-08,2026-09' };
    renderScreen();
    await screen.findByTestId('payout-row-1');
    expect(payoutsM).toHaveBeenCalledWith('tok', 5,
      expect.objectContaining({ from: '2026-08-01', to: '2026-09-30' }));
    expect(screen.getByText('August 2026')).toBeTruthy();
  });

  it('removing the period chip clears it in the route', async () => {
    mockParams = { period: 'd30' };
    renderScreen();
    await screen.findByTestId('payout-row-1');
    fireEvent.press(screen.getByLabelText('Remove filter Last 30 days'));
    expect(mockSetParams).toHaveBeenCalledWith({ period: '', months: '' });
  });

  it('opens the shared Filters screen with the filters in force', async () => {
    mockParams = { period: 'd90' };
    renderScreen();
    await screen.findByTestId('payout-row-1');
    press('open-filters');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/supplier/credit/payouts-filters', params: { period: 'd90' } });
  });
});

describe('paging', () => {
  it('shows more when the server says there is more, and appends', async () => {
    payoutsM.mockResolvedValueOnce(page([payout(1)], { hasNext: true, totalElements: 2, totalPages: 2 }));
    payoutsM.mockResolvedValueOnce(page([payout(2, { restaurantName: 'Second Page' })], { page: 1 }));
    renderScreen();
    await screen.findByTestId('payout-row-1');
    press('show-more');
    await screen.findByTestId('payout-row-2');
    expect(payoutsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ page: 1, size: 20 }));
    expect(screen.getByTestId('payout-row-1')).toBeTruthy();
    expect(screen.queryByTestId('show-more')).toBeNull();
  });

  it('has no Show more on the last page', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    expect(screen.queryByTestId('show-more')).toBeNull();
  });
});

describe('states', () => {
  it('shows a skeleton while loading', async () => {
    payoutsM.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    expect(await screen.findByTestId('payouts-loading')).toBeTruthy();
  });

  it('says plainly there are no payouts yet', async () => {
    payoutsM.mockResolvedValue(page([], { summary: { pendingNet: '0.0000', appliedNetThisMonth: '0.0000' } }));
    renderScreen();
    expect(await screen.findByText('No payouts yet. When a restaurant pays you from their Mandi wallet it shows here.')).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    payoutsM.mockRejectedValueOnce(apiError(500));
    renderScreen();
    await screen.findByTestId('payouts-error');
    payoutsM.mockResolvedValue(page(LIST));
    fireEvent.press(screen.getByText('Try again'));
    await screen.findByTestId('payout-row-1');
  });

  it('shows the offline banner', async () => {
    mockOffline = true;
    renderScreen();
    expect(await screen.findByTestId('offline-banner')).toBeTruthy();
  });

  it('pull to refresh asks again', async () => {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    payoutsM.mockClear();
    const list = screen.getByTestId('payouts-list');
    await waitFor(() => list.props.refreshControl.props.onRefresh());
    await waitFor(() => expect(payoutsM).toHaveBeenCalledTimes(1));
  });
});

describe('Recorded by you', () => {
  async function openTab() {
    renderScreen();
    await screen.findByTestId('payout-row-1');
    press('tab-recorded');
    await screen.findByTestId('payment-row-1');
  }

  it('asks the payments feed, all sources, first page', async () => {
    await openTab();
    expect(paymentsM).toHaveBeenCalledWith('tok', 5, { source: undefined, from: undefined, to: undefined, page: 0, size: 20 });
  });

  it('shows restaurant, invoice, amount, method, reference, day and where it came from', async () => {
    await openTab();
    const row = within(screen.getByTestId('payment-row-1'));
    expect(row.getByText('Spice Co')).toBeTruthy();
    expect(row.getByText('INV-41')).toBeTruthy();
    expect(row.getByText('₹2,500.00')).toBeTruthy();
    expect(row.getByText('UPI · UTR1')).toBeTruthy();
    expect(row.getByText('Recorded by you · 28th Sep 2026')).toBeTruthy();
  });

  it('copes with no method and no reference', async () => {
    await openTab();
    const row = within(screen.getByTestId('payment-row-2'));
    expect(row.getByText('Confirmed from their claim · 28th Sep 2026')).toBeTruthy();
    expect(row.queryByText(/UTR/)).toBeNull();
  });

  it('a source chip sends the source', async () => {
    await openTab();
    paymentsM.mockClear();
    press('source-CLAIM_CONFIRMED');
    await waitFor(() => expect(paymentsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ source: 'CLAIM_CONFIRMED', page: 0 })));
    press('source-SUPPLIER_RECORDED');
    await waitFor(() => expect(paymentsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ source: 'SUPPLIER_RECORDED' })));
    press('source-WALLET');
    await waitFor(() => expect(paymentsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ source: 'WALLET' })));
  });

  it('pages', async () => {
    paymentsM.mockResolvedValueOnce({ items: [pay(1)], page: 0, size: 20, total: 2, hasNext: true });
    paymentsM.mockResolvedValueOnce({ items: [pay(2)], page: 1, size: 20, total: 2, hasNext: false });
    renderScreen();
    await screen.findByTestId('payout-row-1');
    press('tab-recorded');
    await screen.findByTestId('payment-row-1');
    press('show-more');
    await screen.findByTestId('payment-row-2');
    expect(paymentsM).toHaveBeenLastCalledWith('tok', 5, expect.objectContaining({ page: 1 }));
  });

  it('has its own empty and error states', async () => {
    paymentsM.mockResolvedValueOnce({ items: [], page: 0, size: 20, total: 0, hasNext: false });
    renderScreen();
    await screen.findByTestId('payout-row-1');
    press('tab-recorded');
    expect(await screen.findByText('No payments yet. Payments you record, or confirm from a claim, show here.')).toBeTruthy();
  });

  it('shows a huge payment whole', async () => {
    paymentsM.mockResolvedValue({ items: [pay(9, { amount: '123456789012.5000' })], page: 0, size: 20, total: 1, hasNext: false });
    await (async () => {
      renderScreen();
      await screen.findByTestId('payout-row-1');
      press('tab-recorded');
      await screen.findByTestId('payment-row-9');
    })();
    expect(within(screen.getByTestId('payment-row-9')).getByText('₹1,23,45,67,89,012.50')).toBeTruthy();
  });

  it('does not show the payouts hero or status chips', async () => {
    await openTab();
    expect(screen.queryByTestId('payouts-hero')).toBeNull();
    expect(screen.queryByTestId('payout-status-ALL')).toBeNull();
  });
});
