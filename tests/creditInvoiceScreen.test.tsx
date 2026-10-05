import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

  it('hides Pay when wallet repay is disabled', () => {
    mockRepay = false;
    show();
    expect(screen.queryByTestId('invoice-pay')).toBeNull();
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
