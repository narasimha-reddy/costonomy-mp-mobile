import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditInvoiceScreen from '@/app/restaurant/credit/invoice/[id]';
import { ApiError } from '@/lib/api/errors';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: '55' }),
  usePathname: () => '/restaurant/credit/invoice/55',
}));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, restaurantId: 1 } }) }));
let mockMayRepay = true;
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForOutlet: () => mockMayRepay }),
}));
afterEach(() => { mockMayRepay = true; });
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
let mockInvoice: { data?: unknown; isPending: boolean; error: unknown } = { isPending: false, error: null };
const mockRefresh = jest.fn();
let mockRepay = true;
jest.mock('@/hooks/useCreditInvoice', () => ({
  useCreditInvoice: () => ({ ...mockInvoice, isFetching: false, isRefetching: false, refresh: mockRefresh }),
  useWalletRepayEnabled: () => mockRepay,
}));
const mockWithdraw = jest.fn();
let mockWithdrawing = false;
jest.mock('@/hooks/useWithdrawClaim', () => ({
  useWithdrawClaim: () => ({ withdraw: mockWithdraw, pending: mockWithdrawing }),
}));
let sheetProps: Record<string, unknown> | null = null;
jest.mock('@/components/credit/PayFromWalletSheet', () => ({
  PayFromWalletSheet: (p: Record<string, unknown>) => {
    sheetProps = p;
    return null;
  },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><CreditInvoiceScreen /></SafeAreaProvider>);

const base = {
  id: 55, invoiceNumber: 'INV-55', agreementId: 3, supplierOrderId: 900, status: 'OVERDUE',
  amount: '1000.0000', paidAmount: '0.0000', outstanding: '1000.0000',
  dueDate: '2026-09-01', overdueAfter: '2026-09-05', issuedAt: '2026-08-01', settledAt: null,
  dueState: 'OVERDUE', daysToDue: -30, orderNumber: 'ORD-9', supplierName: 'Acme Foods', storeName: 'S',
  payments: [] as unknown[],
};
function show(over: Record<string, unknown> = {}) {
  mockInvoice = { data: { ...base, ...over }, isPending: false, error: null };
  return mount();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
  mockRepay = true;
  mockWithdrawing = false;
  mockWithdraw.mockResolvedValue(true);
  sheetProps = null;
});

describe('credit invoice detail', () => {
  it('shows an overdue invoice with words, amounts and the order link', () => {
    show();
    expect(screen.getByText('INV-55')).toBeTruthy();
    expect(screen.getByText('Acme Foods')).toBeTruthy();
    expect(screen.getByTestId('invoice-chip')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Late after')).toBeTruthy();
    expect(screen.getByText('Pay ₹1,000.00')).toBeTruthy();
    fireEvent.press(screen.getByTestId('invoice-order-link'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/orders/900');
    expect(screen.getByText('Order #ORD-9')).toBeTruthy();
  });

  it('falls back to the order id and has no link without one', () => {
    show({ orderNumber: null });
    expect(screen.getByText('Order #900')).toBeTruthy();
    show({ orderNumber: null, supplierOrderId: null });
    expect(screen.queryAllByTestId('invoice-order-link')).toHaveLength(0);
  });

  it('paid invoice: Settled line, no Pay, no Late after', () => {
    show({
      status: 'PAID', dueState: 'PAID', daysToDue: null, outstanding: '0.0000', paidAmount: '1000.0000',
      settledAt: '2026-09-10',
    });
    expect(screen.queryByTestId('invoice-pay')).toBeNull();
    expect(screen.getByText('Settled')).toBeTruthy();
    expect(screen.queryByText('Late after')).toBeNull();
  });

  it('part-paid invoice shows server numbers and Pay for the remainder', () => {
    show({
      status: 'PARTIALLY_PAID', dueState: 'DUE_SOON', daysToDue: 3,
      paidAmount: '400.0000', outstanding: '600.0000',
    });
    expect(screen.getByText('Due in 3 days')).toBeTruthy();
    expect(screen.getByText('₹400.00')).toBeTruthy();
    expect(screen.getByText('Pay ₹600.00')).toBeTruthy();
    expect(screen.getByText('Status: Part paid')).toBeTruthy();
  });

  it('renders each payment source and routes the wallet one', () => {
    show({
      payments: [
        { id: 1, amount: '100.0000', source: 'WALLET', method: null, reference: null, paidAt: '2026-09-02', walletEntryId: 192 },
        { id: 2, amount: '200.0000', source: 'SUPPLIER_RECORDED', method: 'BANK_TRANSFER', reference: 'UTR1', paidAt: '2026-09-03', walletEntryId: null },
        { id: 3, amount: '300.0000', source: 'CLAIM_CONFIRMED', method: 'UPI', reference: null, paidAt: '2026-09-04', walletEntryId: null },
      ],
    });
    expect(screen.getByText('From wallet')).toBeTruthy();
    expect(screen.getByText('Recorded by Acme Foods')).toBeTruthy();
    expect(screen.getByText('Bank transfer · ref UTR1')).toBeTruthy();
    expect(screen.getByText('You reported this · confirmed by Acme Foods')).toBeTruthy();
    expect(screen.getByText('UPI')).toBeTruthy();
    fireEvent.press(screen.getByTestId('payment-1'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/transaction/192');
    mockPush.mockClear();
    fireEvent.press(screen.getByTestId('payment-2'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a wallet payment shows only From wallet, the amount and the date: no method label, no internal reference', () => {
    show({
      payments: [
        { id: 1, amount: '100.0000', source: 'WALLET', method: 'WALLET', reference: 'credit-repayment-13', paidAt: '2026-09-02', walletEntryId: 192 },
      ],
    });
    expect(screen.getByText('From wallet')).toBeTruthy();
    expect(screen.queryByText(/WALLET/)).toBeNull();
    expect(screen.queryByText(/credit-repayment/)).toBeNull();
    expect(screen.queryByText(/ref /)).toBeNull();
    expect(screen.getByTestId('payment-1').props.accessibilityLabel).toBe('From wallet, 2nd Sep 2026, ₹100.00. Opens the wallet transaction');
    fireEvent.press(screen.getByTestId('payment-1'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/transaction/192');
  });

  it('says so when there are no payments', () => {
    show();
    expect(screen.getByText('No payments yet.')).toBeTruthy();
  });

  it('Pay opens the sheet in invoice mode with overdue only for OVERDUE', () => {
    show();
    fireEvent.press(screen.getByTestId('invoice-pay'));
    expect(sheetProps).toMatchObject({
      visible: true, agreementId: 3, supplierName: 'Acme Foods', due: '1000.0000', overdue: '1000.0000',
      invoice: { id: 55, invoiceNumber: 'INV-55', outstanding: '1000.0000' },
    });
  });

  it('passes overdue 0 when not overdue', () => {
    show({ status: 'ISSUED', dueState: 'DUE_LATER', daysToDue: 20 });
    fireEvent.press(screen.getByTestId('invoice-pay'));
    expect(sheetProps).toMatchObject({ overdue: 0 });
  });

  it('hides Pay when wallet repay is disabled, but I paid still works', () => {
    mockRepay = false;
    show();
    expect(screen.queryByTestId('invoice-pay')).toBeNull();
    fireEvent.press(screen.getByTestId('invoice-i-paid'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/credit/claim', params: { agreementId: '3', invoiceId: '55' },
    });
  });

  it('disables Pay offline', () => {
    mockOffline = true;
    show();
    expect(screen.getByTestId('invoice-pay').props.accessibilityState?.disabled).toBe(true);
  });

  it('the Pay button is orange, not purple', () => {
    show();
    const style = StyleSheet.flatten(screen.getByTestId('invoice-pay').props.style);
    expect(style.backgroundColor).toBe(Colors.primary);
  });

  it('shows I paid under Pay as the outline button, orange stays on Pay', () => {
    show();
    const pay = screen.getByTestId('invoice-pay');
    const claim = screen.getByTestId('invoice-i-paid');
    expect(screen.getByText('I paid outside the app')).toBeTruthy();
    expect(StyleSheet.flatten(claim.props.style).backgroundColor).toBe(Colors.surface);
    expect(StyleSheet.flatten(pay.props.style).backgroundColor).toBe(Colors.primary);
  });

  it.each([
    ['paid', { status: 'PAID', dueState: 'PAID', outstanding: '0.0000', paidAmount: '1000.0000', settledAt: '2026-09-10' }],
    ['written off', { status: 'WRITTEN_OFF', dueState: 'WRITTEN_OFF', outstanding: '0.0000' }],
    ['owing nothing', { outstanding: '0.0000' }],
  ])('hides I paid on a %s invoice', (_name, over) => {
    show(over);
    expect(screen.queryByTestId('invoice-i-paid')).toBeNull();
  });

  it('hides I paid at reportable 0 but keeps Pay; shows it when positive or absent', () => {
    show({ reportableAmount: 0 });
    expect(screen.queryByTestId('invoice-i-paid')).toBeNull();
    expect(screen.getByTestId('invoice-pay')).toBeTruthy();
    show({ reportableAmount: 40 });
    expect(screen.getAllByTestId('invoice-i-paid').length).toBeGreaterThan(0);
  });

  it('disables I paid offline', () => {
    mockOffline = true;
    show();
    expect(screen.getByTestId('invoice-i-paid').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows the friendly state for a 404', () => {
    mockInvoice = { isPending: false, error: new ApiError({ code: 'NOT_FOUND', message: 'x', status: 404 }) };
    mount();
    expect(screen.getByText("This invoice isn't available")).toBeTruthy();
    fireEvent.press(screen.getByText('Go back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows an error with retry', () => {
    mockInvoice = { isPending: false, error: new Error('boom') };
    mount();
    fireEvent.press(screen.getByText('Try Again'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows no content while loading', () => {
    mockInvoice = { isPending: true, error: null };
    mount();
    expect(screen.queryByTestId('invoice-pay')).toBeNull();
    expect(screen.queryByTestId('invoice-error')).toBeNull();
  });
});

describe('your reports', () => {
  const claim = (id: number, over: Record<string, unknown> = {}) => ({
    id, invoiceId: 55, invoiceNumber: 'INV-55', agreementId: 3, outletId: 7, outletName: 'O',
    restaurantName: 'R', amount: '400.0000', method: 'UPI', reference: 'UTR77', paidOn: '2026-09-20',
    note: null, status: 'SUBMITTED', decisionNote: null, confirmedAmount: null, creditPaymentId: null,
    createdAt: '2026-09-20T10:00:00Z', decidedAt: null, ...over,
  });

  it('has no section when there are no reports', () => {
    show({ claims: [] });
    expect(screen.queryByText('Your reports')).toBeNull();
    show();
    expect(screen.queryByText('Your reports')).toBeNull();
  });

  it('shows a waiting report with amount, method, reference and date', () => {
    show({ claims: [claim(1)] });
    expect(screen.getByText('Your reports')).toBeTruthy();
    expect(screen.getByTestId('claim-status-1')).toHaveTextContent(/Waiting for Acme Foods/);
    expect(screen.getByTestId('claim-1')).toHaveTextContent(/₹400\.00/);
    expect(screen.getByTestId('claim-1')).toHaveTextContent(/UPI · ref UTR77 · paid 20th Sep 2026/);
    expect(screen.getByTestId('claim-withdraw-1')).toBeTruthy();
    expect(screen.queryByTestId('claim-again-1')).toBeNull();
  });

  it('confirms before withdrawing, then withdraws', async () => {
    show({ claims: [claim(1)] });
    fireEvent.press(screen.getByTestId('claim-withdraw-1'));
    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(screen.getByText('Withdraw this report?')).toBeTruthy();
    fireEvent.press(screen.getByText('Withdraw report'));
    await waitFor(() => expect(mockWithdraw).toHaveBeenCalledWith(1));
  });

  it('keeping the report withdraws nothing', () => {
    show({ claims: [claim(1)] });
    fireEvent.press(screen.getByTestId('claim-withdraw-1'));
    fireEvent.press(screen.getByText('Keep it'));
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('disables Withdraw while a withdrawal is in flight', () => {
    mockWithdrawing = true;
    show({ claims: [claim(1)] });
    expect(screen.getByTestId('claim-withdraw-1').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows Confirmed, and the confirmed amount only when it differs', () => {
    show({ claims: [
      claim(1, { status: 'CONFIRMED', confirmedAmount: '400.0000' }),
      claim(2, { status: 'CONFIRMED', confirmedAmount: '350.0000' }),
    ] });
    expect(screen.getByTestId('claim-status-1')).toHaveTextContent(/Confirmed/);
    expect(screen.queryByTestId('claim-confirmed-1')).toBeNull();
    expect(screen.getByTestId('claim-confirmed-2')).toHaveTextContent('Acme Foods confirmed ₹350.00');
    expect(screen.queryByTestId('claim-withdraw-1')).toBeNull();
  });

  it('shows the supplier reason on a rejection and reports again for this invoice', () => {
    show({ claims: [claim(1, { status: 'REJECTED', decisionNote: 'UTR does not match' })] });
    expect(screen.getByTestId('claim-decision-1')).toHaveTextContent('Supplier said: UTR does not match');
    expect(screen.getByTestId('claim-status-1')).toHaveTextContent(/Not accepted/);
    fireEvent.press(screen.getByTestId('claim-again-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/credit/claim', params: { agreementId: '3', invoiceId: '55' },
    });
  });

  it('shows Withdrawn with no actions', () => {
    show({ claims: [claim(1, { status: 'WITHDRAWN' })] });
    expect(screen.getByTestId('claim-status-1')).toHaveTextContent(/Withdrawn/);
    expect(screen.queryByTestId('claim-withdraw-1')).toBeNull();
    expect(screen.queryByTestId('claim-again-1')).toBeNull();
  });
});
