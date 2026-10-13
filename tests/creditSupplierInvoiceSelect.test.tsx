import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditAgreementScreen from '@/app/restaurant/credit/[id]';
import { fetchAgreement, fetchCreditSummary, fetchInvoices } from '@/services/credit';
import { fetchPayableInvoices } from '@/services/creditPay';
import type { PayableInvoice, PayableInvoices, PayableSupplier } from '@/models/creditPay';

/**
 * One supplier's credit page: each open invoice has a checkbox (all ticked to start), a select-all,
 * and the Pay bar carries the ticked invoices into Pay dues scoped to this supplier.
 */

// These suites exercise the manual-settlement flows (Record, claims, Recorded by you): run them with the switch on.
jest.mock('@/lib/credit/manualSettlement', () => ({ MANUAL_SETTLEMENT_ENABLED: true }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/restaurant/credit/3',
  useLocalSearchParams: () => ({ id: '3' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar', restaurantId: 1 } }),
}));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchCreditSummary: jest.fn(),
  fetchAgreement: jest.fn(),
  fetchInvoices: jest.fn(),
}));
jest.mock('@/services/creditPay', () => ({
  ...jest.requireActual('@/services/creditPay'),
  fetchPayableInvoices: jest.fn(),
}));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn().mockResolvedValue({ balance: '5000.0000' }) }));
jest.mock('@/components/credit/PayFromWalletSheet', () => ({ PayFromWalletSheet: () => null }));

const summaryM = fetchCreditSummary as jest.Mock;
const agreementM = fetchAgreement as jest.Mock;
const invoicesM = fetchInvoices as jest.Mock;
const payableM = fetchPayableInvoices as jest.Mock;

const agreement = {
  id: 3, status: 'ACTIVE', supplierName: 'Deccan Wholesale', storeName: 'Whitefield',
  approvedLimit: '50000', reserved: '0', utilized: '2500', available: '47500',
  due: '2500.0000', overdue: '0', creditPeriodDays: 30, gracePeriodDays: 5, reportableAmount: 2500,
  maxSingleOrderCredit: null, termsVersion: null, suspensionReason: null, canFund: true, latestRequest: null,
};
const listed = (id: number, outstanding: string, o: Record<string, unknown> = {}) => ({
  id, invoiceNumber: `INV-${id}`, creditAgreementId: 3, supplierOrderId: 900 + id, status: 'ISSUED',
  amount: '5000.0000', paidAmount: '0.0000', outstanding, dueDate: '2026-10-20', overdueAfter: null,
  issuedAt: '2026-09-20', settledAt: null, dueState: 'DUE_LATER', daysToDue: 10, orderNumber: `ORD-${id}`, ...o,
});
const paidInvoice = listed(40, '0.0000', { status: 'PAID', dueState: 'PAID', daysToDue: null, settledAt: '2026-10-01' });

const pinv = (invoiceId: number, outstanding: string): PayableInvoice => ({
  invoiceId, invoiceNumber: `INV-${invoiceId}`, supplierOrderId: 900 + invoiceId, status: 'ISSUED',
  amount: '5000.0000', paidAmount: '0.0000', creditedAmount: '0.0000', outstanding,
  dueDate: '2026-10-20', overdueAfter: null, dueState: 'DUE_LATER', daysToDue: 10, openClaimsAmount: '0.0000',
});
const psup = (agreementId: number, invoices: PayableInvoice[], o: Partial<PayableSupplier> = {}): PayableSupplier => ({
  agreementId, supplierStoreId: 50 + agreementId, supplierName: `S${agreementId}`, storeName: null,
  agreementStatus: 'ACTIVE', payable: true, notPayableReason: null, due: '0.0000', overdue: '0.0000', invoices, ...o,
});
const payable = (suppliers: PayableSupplier[]): PayableInvoices => ({
  outletId: 7, onlinePayEnabled: true, walletPayEnabled: true, methods: ['UPI', 'CARD', 'WALLET'],
  feePercent: '0.0000', minOnlineAmount: '1.0000', maxInvoices: 50, suppliers,
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><CreditAgreementScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const pushed = () => mockPush.mock.calls.map((c) => c[0]);
const check = (id: number) => screen.getByTestId(`credit-invoice-check-${id}`);
const checked = (id: number) => check(id).props.accessibilityState?.checked;
const payButton = () => screen.getByTestId('credit-pay-bar-button');
const payDisabled = () => payButton().props.accessibilityState?.disabled === true;

beforeEach(() => {
  jest.clearAllMocks();
  summaryM.mockResolvedValue({ walletRepayEnabled: true, onlinePayEnabled: true });
  agreementM.mockResolvedValue(agreement);
  invoicesM.mockResolvedValue([listed(31, '1000.0000'), listed(32, '1250.5000', { dueState: 'OVERDUE', daysToDue: -2 }), listed(33, '249.5000'), paidInvoice]);
  payableM.mockResolvedValue(payable([
    psup(9, [pinv(91, '77.0000')]),
    psup(3, [pinv(31, '1000.0000'), pinv(32, '1250.5000'), pinv(33, '249.5000')]),
  ]));
});

async function ready() {
  mount();
  await screen.findByTestId('credit-invoice-check-31');
  await waitFor(() => expect(payButton()).toHaveTextContent(/3 invoices/));
}

describe('checkboxes on open invoices', () => {
  it('every open invoice has a checkbox, all ticked to start, with the same words as the pay screen', async () => {
    await ready();
    for (const id of [31, 32, 33]) expect(checked(id)).toBe(true);
    expect(check(31).props.accessibilityRole).toBe('checkbox');
    expect(check(31).props.accessibilityLabel).toMatch(/Invoice INV-31, ₹1,000\.00.*selected/);
    expect(screen.getAllByText('icon:checkbox').length).toBeGreaterThanOrEqual(3);
  });

  it('the bar shows the ticked count and total, which at the start equals everything owed', async () => {
    await ready();
    expect(payButton()).toHaveTextContent('Pay ₹2,500.00 · 3 invoices');
    expect(payDisabled()).toBe(false);
  });

  it('unticking one updates the count and total; ticking it back restores them', async () => {
    await ready();
    fireEvent.press(check(32));
    expect(checked(32)).toBe(false);
    expect(payButton()).toHaveTextContent('Pay ₹1,249.50 · 2 invoices');
    fireEvent.press(check(32));
    expect(payButton()).toHaveTextContent('Pay ₹2,500.00 · 3 invoices');
  });

  it('a single invoice reads "1 invoice"', async () => {
    await ready();
    fireEvent.press(check(31));
    fireEvent.press(check(32));
    expect(payButton()).toHaveTextContent('Pay ₹249.50 · 1 invoice');
  });

  it('select all clears everything, then ticks everything; Pay is off with none', async () => {
    await ready();
    fireEvent.press(screen.getByTestId('credit-select-all'));
    for (const id of [31, 32, 33]) expect(checked(id)).toBe(false);
    expect(payDisabled()).toBe(true);
    fireEvent.press(payButton());
    expect(pushed()).toEqual([]);
    fireEvent.press(screen.getByTestId('credit-select-all'));
    for (const id of [31, 32, 33]) expect(checked(id)).toBe(true);
    expect(payButton()).toHaveTextContent('Pay ₹2,500.00 · 3 invoices');
  });

  it('select all completes a part-ticked list rather than clearing it', async () => {
    await ready();
    fireEvent.press(check(31));
    fireEvent.press(screen.getByTestId('credit-select-all'));
    for (const id of [31, 32, 33]) expect(checked(id)).toBe(true);
  });

  it('the Paid tab has no checkboxes and no select all', async () => {
    await ready();
    fireEvent.press(screen.getByTestId('credit-tab-paid'));
    expect(await screen.findByTestId('credit-invoice-40')).toBeTruthy();
    expect(screen.queryByTestId('credit-invoice-check-40')).toBeNull();
    expect(screen.queryByTestId('credit-select-all')).toBeNull();
  });

  it('tapping the checkbox does not open the invoice, tapping the row does', async () => {
    await ready();
    fireEvent.press(check(31));
    expect(pushed()).toEqual([]);
    fireEvent.press(screen.getByTestId('credit-invoice-31'));
    expect(pushed()).toEqual(['/restaurant/credit/invoice/31']);
  });
});

describe('Pay carries the selection into Pay dues for this supplier', () => {
  it('sends the scope and exactly the ticked ids', async () => {
    await ready();
    fireEvent.press(check(32));
    fireEvent.press(payButton());
    expect(pushed()).toEqual(['/restaurant/credit/pay?scopeAgreementId=3&invoiceIds=31,33']);
  });

  it('all ticked sends all of this supplier\'s open invoices and none of another supplier\'s', async () => {
    await ready();
    fireEvent.press(payButton());
    expect(pushed()).toEqual(['/restaurant/credit/pay?scopeAgreementId=3&invoiceIds=31,32,33']);
  });
});

describe('what cannot be paid is not selectable', () => {
  it('a supplier that is not payable online shows no checkboxes and no selection bar', async () => {
    payableM.mockResolvedValue(payable([
      psup(3, [pinv(31, '1000.0000'), pinv(32, '1250.5000'), pinv(33, '249.5000')], { payable: false, notPayableReason: 'Pay directly.' }),
    ]));
    mount();
    await screen.findByTestId('credit-invoice-31');
    await waitFor(() => expect(payableM).toHaveBeenCalled());
    expect(screen.queryByTestId('credit-invoice-check-31')).toBeNull();
    expect(screen.queryByTestId('credit-select-all')).toBeNull();
  });

  it('an open invoice the pay list does not offer gets no checkbox and is never sent', async () => {
    payableM.mockResolvedValue(payable([psup(3, [pinv(31, '1000.0000'), pinv(33, '249.5000')])]));
    mount();
    await screen.findByTestId('credit-invoice-check-31');
    await waitFor(() => expect(payButton()).toHaveTextContent(/2 invoices/));
    expect(screen.queryByTestId('credit-invoice-check-32')).toBeNull();
    expect(screen.getByTestId('credit-invoice-32')).toBeTruthy();
    fireEvent.press(payButton());
    expect(pushed()).toEqual(['/restaurant/credit/pay?scopeAgreementId=3&invoiceIds=31,33']);
  });
});

describe('unchanged behaviour', () => {
  it('while the pay list is unavailable, Pay still opens Pay dues scoped to this supplier', async () => {
    payableM.mockRejectedValue(new Error('down'));
    mount();
    const pay = await screen.findByTestId('credit-pay-bar-button');
    await waitFor(() => expect(payableM).toHaveBeenCalled());
    expect(screen.queryByTestId('credit-invoice-check-31')).toBeNull();
    fireEvent.press(pay);
    expect(pushed()).toEqual(['/restaurant/credit/pay?scopeAgreementId=3']);
  });

  it('online pay off: no checkboxes, no pay-list request, Paid direct stays', async () => {
    summaryM.mockResolvedValue({ walletRepayEnabled: true, onlinePayEnabled: false });
    mount();
    await screen.findByTestId('credit-invoice-31');
    await screen.findByTestId('credit-i-paid-bar-button');
    expect(screen.queryByTestId('credit-invoice-check-31')).toBeNull();
    expect(payableM).not.toHaveBeenCalled();
    expect(payButton()).toHaveTextContent('Pay ₹2,500.00');
  });

  it('online pay on: Paid direct is never offered', async () => {
    await ready();
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
  });
});
