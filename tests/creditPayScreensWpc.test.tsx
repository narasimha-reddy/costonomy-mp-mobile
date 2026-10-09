import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import CreditPayScreen from '@/app/restaurant/credit/pay/index';
import CreditPayResultScreen from '@/app/restaurant/credit/pay/[attemptId]';
import { fetchCreditPayment, fetchPayableInvoices, quoteCreditPayment } from '@/services/creditPay';
import type { CreditPayAttempt, PayableInvoices } from '@/models/creditPay';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar' } }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
jest.mock('@/services/creditPay', () => ({
  ...jest.requireActual('@/services/creditPay'),
  fetchPayableInvoices: jest.fn(),
  quoteCreditPayment: jest.fn(),
  createCreditPayment: jest.fn(),
  verifyCreditPayment: jest.fn(),
  fetchCreditPayment: jest.fn(),
}));

const inv = (invoiceId: number, outstanding: string, dueState = 'DUE_LATER') => ({
  invoiceId, invoiceNumber: `INV-${invoiceId}`, supplierOrderId: null, status: 'OPEN', amount: outstanding, paidAmount: '0',
  creditedAmount: '0', outstanding, dueDate: '2026-10-20', overdueAfter: null, dueState, daysToDue: 5, openClaimsAmount: '0',
});
const DATA: PayableInvoices = {
  outletId: 7, onlinePayEnabled: true, walletPayEnabled: true, methods: ['UPI', 'CARD', 'WALLET'], feePercent: '0',
  minOnlineAmount: '1.00', maxInvoices: 2,
  suppliers: [
    { agreementId: 11, supplierStoreId: 3, supplierName: 'Spice Garden', storeName: null, agreementStatus: 'ACTIVE', payable: true,
      notPayableReason: null, due: '12480', overdue: '6500', invoices: [inv(101, '6500.00', 'OVERDUE'), inv(102, '5980.00')] },
    { agreementId: 12, supplierStoreId: 4, supplierName: 'Closed Co', storeName: null, agreementStatus: 'ACTIVE', payable: false,
      notPayableReason: 'Pay this supplier directly.', due: '10', overdue: '0', invoices: [inv(301, '10.00')] },
  ],
};
const QUOTE = {
  invoiceCount: 2, supplierCount: 1, amount: '12480.00', walletBalance: '9000.00',
  methods: [
    { method: 'UPI', available: true, unavailableReason: null, feeAmount: '0', totalCharged: '12480.00', shortBy: null },
    { method: 'CARD', available: true, unavailableReason: null, feeAmount: '0', totalCharged: '12480.00', shortBy: null },
    { method: 'WALLET', available: false, unavailableReason: 'WALLET_SHORT', feeAmount: '0', totalCharged: '12480.00', shortBy: '3480.00' },
  ],
};
const attempt = (o: Partial<CreditPayAttempt>): CreditPayAttempt => ({
  attemptId: 42, outletId: 7, status: 'PAID', method: 'UPI', paidWith: 'UPI', paymentDetail: null, invoiceCount: 2, amount: '12480.00',
  feeAmount: '0', totalCharged: '12480.00', currency: 'INR', razorpayOrderId: 'order_X', razorpayPaymentId: 'pay_ABC', keyId: null,
  reopened: false, refundAmount: '0', refundState: 'NONE', createdAt: '2026-10-09T10:00:00Z', paidAt: '2026-10-09T10:01:00Z',
  expiresAt: null, walletBalanceAfter: null, invoices: [
    { invoiceId: 101, invoiceNumber: 'INV-101', agreementId: 11, supplierStoreId: 3, supplierName: 'Spice Garden', amount: '6500.00', outcome: 'PAID', skipReason: null },
  ],
  suppliers: [{ agreementId: 11, supplierStoreId: 3, supplierName: 'Spice Garden', invoiceCount: 2, amount: '12480.00', paidAmount: '12480.00', repaymentId: 90, agreement: null }],
  ...o,
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  (fetchPayableInvoices as jest.Mock).mockResolvedValue(DATA);
  (quoteCreditPayment as jest.Mock).mockResolvedValue(QUOTE);
});

function renderUi(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><MandiToastProvider>{ui}</MandiToastProvider></QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('pay picker', () => {
  it('lists suppliers as sent, selects, shows the bar, and opens the method sheet from a quote', async () => {
    renderUi(<CreditPayScreen />);
    expect(await screen.findByTestId('pay-supplier-11')).toBeTruthy();
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent('Choose invoices to pay');
    expect(screen.getByTestId('pay-bar-button').props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(screen.getByTestId('pay-supplier-all-11'));
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent('2 invoices · ₹12,480.00');

    fireEvent.press(screen.getByTestId('pay-bar-button'));
    expect(await screen.findByTestId('pay-method-sheet')).toBeTruthy();
    expect(quoteCreditPayment).toHaveBeenCalledWith('tok', 7, [
      { invoiceId: 101, outstanding: '6500.00' }, { invoiceId: 102, outstanding: '5980.00' },
    ]);
    expect(screen.getByTestId('pay-method-wallet-short')).toHaveTextContent('Wallet is ₹3,480.00 short');
    expect(screen.getByTestId('pay-method-add-money')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pay-method-add-money'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/add-money');
  });

  it('preselects by agreement and disables a supplier that cannot be paid here', async () => {
    mockParams = { agreementId: '11' };
    renderUi(<CreditPayScreen />);
    expect(await screen.findByTestId('pay-bar-text')).toHaveTextContent(/^2 invoices/);
    expect(screen.getByText('Pay this supplier directly.')).toBeTruthy();
    expect(screen.getByTestId('pay-invoice-301').props.accessibilityState.disabled).toBe(true);
  });

  it('shows the limit note and disables Pay over the limit', async () => {
    (fetchPayableInvoices as jest.Mock).mockResolvedValue({ ...DATA, maxInvoices: 1 });
    mockParams = { agreementId: '11' };
    renderUi(<CreditPayScreen />);
    expect(await screen.findByTestId('pay-limit-note')).toHaveTextContent('Choose at most 1 invoice at a time.');
    expect(screen.getByTestId('pay-bar-button').props.accessibilityState?.disabled).toBe(true);
  });
});

describe('pay result', () => {
  const show = (a: CreditPayAttempt) => {
    mockParams = { attemptId: '42' };
    (fetchCreditPayment as jest.Mock).mockResolvedValue(a);
    renderUi(<CreditPayResultScreen />);
  };

  it('PAID with a partial refund shows the banner and receipt, Done goes to credit', async () => {
    show(attempt({ refundAmount: '40.00', refundState: 'PENDING' }));
    expect(await screen.findByTestId('pay-result-paid')).toBeTruthy();
    expect(screen.getByTestId('pay-refund-banner')).toBeTruthy();
    expect(screen.getByTestId('pay-receipt')).toBeTruthy();
    expect(screen.getByText('Payment ID pay_ABC')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pay-result-done'));
    expect(mockReplace).toHaveBeenCalledWith('/restaurant/credit');
  });

  it('REFUNDED has its own state', async () => {
    show(attempt({ status: 'REFUNDED', refundAmount: '12480.00', refundState: 'PENDING' }));
    expect(await screen.findByTestId('pay-result-refunded')).toBeTruthy();
  });

  it('CREATED is pending', async () => {
    show(attempt({ status: 'CREATED', paidAt: null }));
    expect(await screen.findByTestId('pay-result-pending')).toBeTruthy();
  });

  it('EXPIRED is ended', async () => {
    show(attempt({ status: 'EXPIRED', paidAt: null }));
    expect(await screen.findByTestId('pay-result-ended')).toBeTruthy();
  });
});
