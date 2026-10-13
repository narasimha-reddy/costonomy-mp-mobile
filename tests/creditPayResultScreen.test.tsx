import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PayResultScreen from '@/app/restaurant/credit/pay/[attemptId]';
import { fetchCreditPayment } from '@/services/creditPay';
import type { AttemptInvoice, AttemptSupplier, CreditPayAttempt } from '@/models/creditPay';
import { renderedText } from './fixtures/renderedText';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ attemptId: '9' }),
  usePathname: () => '/restaurant/credit/pay/9',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar' } }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock('@/services/creditPay', () => ({
  ...jest.requireActual('@/services/creditPay'),
  fetchCreditPayment: jest.fn(),
}));

const statusM = fetchCreditPayment as jest.Mock;

const line = (invoiceId: number, agreementId: number, supplierName: string, o: Partial<AttemptInvoice> = {}): AttemptInvoice => ({
  invoiceId, invoiceNumber: `INV-${invoiceId}`, agreementId, supplierStoreId: 50 + agreementId, supplierName,
  amount: '700.0000', outcome: 'PAID', skipReason: null, ...o,
});
const group = (agreementId: number, supplierName: string, invoiceCount: number, amount: string, o: Partial<AttemptSupplier> = {}): AttemptSupplier => ({
  agreementId, supplierStoreId: 50 + agreementId, supplierName, invoiceCount, amount, paidAmount: amount,
  repaymentId: 300 + agreementId, agreement: null, ...o,
});

const attempt = (o: Partial<CreditPayAttempt> = {}): CreditPayAttempt => ({
  attemptId: 9, outletId: 7, status: 'PAID', method: 'UPI', paidWith: 'UPI', paymentDetail: null, invoiceCount: 3,
  amount: '2100.5000', feeAmount: '0.0000', totalCharged: '2100.5000', currency: 'INR',
  razorpayOrderId: 'order_X', razorpayPaymentId: 'pay_ABC123', keyId: 'rzp_test_k', reopened: false,
  refundAmount: '0.0000', refundState: 'NONE', createdAt: '2026-10-09T04:55:00Z', paidAt: '2026-10-09T05:00:00Z',
  expiresAt: null, walletBalanceAfter: null,
  suppliers: [group(1, 'Acme Foods', 2, '1500.0000'), group(2, 'Zed Foods', 1, '600.5000')],
  invoices: [line(11, 1, 'Acme Foods'), line(12, 1, 'Acme Foods'), line(21, 2, 'Zed Foods')],
  ...o,
});

const PENDING = attempt({ status: 'CREATED', paidAt: null, razorpayPaymentId: null });

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
let client: QueryClient;
function renderScreen() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><PayResultScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const text = () => renderedText(screen.toJSON() as never);

beforeEach(() => {
  jest.clearAllMocks();
  statusM.mockResolvedValue(attempt());
});

describe('paid', () => {
  it('reads the attempt for this outlet and shows the success title and body', async () => {
    renderScreen();
    expect(await screen.findByTestId('pay-result-paid')).toBeTruthy();
    expect(statusM.mock.calls[0]?.slice(0, 2)).toEqual(['tok', 7]);
    // The route param is a string; the server's id is the same number either way.
    expect(Number(statusM.mock.calls[0]?.[2])).toBe(9);
    expect(text()).toContain('Paid. Invoices settled.');
    expect(text()).toContain('₹2,100.50 paid for 3 invoices.');
  });

  it('the receipt lists each supplier with the server\'s amount, and the invoice numbers', async () => {
    renderScreen();
    await screen.findByTestId('pay-receipt');
    const t = renderedText(screen.getByTestId('pay-receipt').children as never);
    expect(t).toContain('Acme Foods');
    expect(t).toContain('₹1,500.00');
    expect(t).toContain('Zed Foods');
    expect(t).toContain('₹600.50');
    for (const n of ['INV-11', 'INV-12', 'INV-21']) expect(t).toContain(n);
  });

  it('the receipt footer names the method, the time in IST and the payment id', async () => {
    renderScreen();
    await screen.findByTestId('pay-receipt');
    const t = text();
    expect(t).toContain('Paid by UPI');
    // 05:00 UTC is 10:30 in India.
    expect(t).toMatch(/10:30/);
    expect(t).toContain('Transaction ID');
    expect(t).toContain('pay_ABC123');
  });

  it('a wallet payment says Wallet and has no payment id line', async () => {
    statusM.mockResolvedValue(attempt({ method: 'WALLET', paidWith: 'WALLET', razorpayPaymentId: null, razorpayOrderId: null, walletBalanceAfter: '900.0000' }));
    renderScreen();
    await screen.findByTestId('pay-receipt');
    expect(text()).toContain('Paid by Wallet');
    expect(text()).not.toContain('Transaction ID');
  });

  it('a card payment says Card', async () => {
    statusM.mockResolvedValue(attempt({ method: 'CARD', paidWith: 'CARD' }));
    renderScreen();
    await screen.findByTestId('pay-receipt');
    expect(text()).toContain('Paid by Card');
  });

  it('shows no refund banner when nothing is going back', async () => {
    renderScreen();
    await screen.findByTestId('pay-result-paid');
    expect(screen.queryByTestId('pay-refund-banner')).toBeNull();
  });

  it('Done goes back to credit', async () => {
    renderScreen();
    await screen.findByTestId('pay-result-done');
    expect(text()).toContain('Done');
    fireEvent.press(screen.getByTestId('pay-result-done'));
    expect(JSON.stringify([...mockReplace.mock.calls, ...mockPush.mock.calls])).toContain('/restaurant/credit');
    expect(JSON.stringify([...mockReplace.mock.calls, ...mockPush.mock.calls])).not.toContain('/restaurant/credit/pay');
  });
});

describe('paid with some invoices changed first', () => {
  const partial = () => attempt({
    invoiceCount: 3,
    amount: '2100.5000', totalCharged: '2100.5000',
    refundAmount: '600.5000', refundState: 'PENDING',
    suppliers: [group(1, 'Acme Foods', 2, '1500.0000'), group(2, 'Zed Foods', 1, '600.5000', { paidAmount: '0.0000' })],
    invoices: [
      line(11, 1, 'Acme Foods'), line(12, 1, 'Acme Foods'),
      line(21, 2, 'Zed Foods', { outcome: 'SKIPPED', skipReason: 'AMOUNT_CHANGED' }),
    ],
  });

  it('says how much is going back and to what, and that nothing was paid twice', async () => {
    statusM.mockResolvedValue(partial());
    renderScreen();
    const banner = await screen.findByTestId('pay-refund-banner');
    const t = renderedText(banner.children as never);
    expect(t).toMatch(/₹600\.50 is going back to your (UPI|upi)\./);
    expect(t).toMatch(/1 invoice changed before your payment arrived, so we didn.t pay them twice\./);
  });

  it('is still the paid screen, with the banner above', async () => {
    statusM.mockResolvedValue(partial());
    renderScreen();
    expect(await screen.findByTestId('pay-result-paid')).toBeTruthy();
    expect(screen.getByTestId('pay-refund-banner')).toBeTruthy();
  });

  it('once the refund is done, says it was returned', async () => {
    statusM.mockResolvedValue({ ...partial(), refundState: 'COMPLETED' });
    renderScreen();
    await screen.findByTestId('pay-result-paid');
    expect(text()).toMatch(/₹600\.50 has been returned to your (UPI|upi)\./);
    expect(text()).not.toMatch(/is going back/);
  });
});

describe('refunded', () => {
  const refunded = () => attempt({
    status: 'REFUNDED', paidAt: '2026-10-09T05:00:00Z', refundAmount: '2100.5000', refundState: 'PENDING',
    invoices: [
      line(11, 1, 'Acme Foods', { outcome: 'SKIPPED', skipReason: 'SETTLED' }),
      line(12, 1, 'Acme Foods', { outcome: 'SKIPPED', skipReason: 'SETTLED' }),
      line(21, 2, 'Zed Foods', { outcome: 'SKIPPED', skipReason: 'WRITTEN_OFF' }),
    ],
  });

  it('says the money is coming back, how much, and that nothing was paid', async () => {
    statusM.mockResolvedValue(refunded());
    renderScreen();
    expect(await screen.findByTestId('pay-result-refunded')).toBeTruthy();
    expect(text()).toContain('Your money is on its way back');
    expect(text()).toMatch(/These invoices changed before your payment arrived, so nothing was paid\./);
    expect(text()).toMatch(/₹2,100\.50 is going back to your (UPI|upi)\./);
  });

  it('is not the paid screen', async () => {
    statusM.mockResolvedValue(refunded());
    renderScreen();
    await screen.findByTestId('pay-result-refunded');
    expect(screen.queryByTestId('pay-result-paid')).toBeNull();
    expect(text()).not.toContain('Paid. Invoices settled.');
  });
});

describe('ended', () => {
  it.each(['FAILED', 'EXPIRED'] as const)('%s: nothing was charged, and a way back', async (status) => {
    statusM.mockResolvedValue(attempt({ status, paidAt: null, razorpayPaymentId: null }));
    renderScreen();
    expect(await screen.findByTestId('pay-result-ended')).toBeTruthy();
    expect(text()).toMatch(/This payment wasn.t completed\. Nothing was charged\./);
    expect(screen.queryByTestId('pay-result-paid')).toBeNull();
    fireEvent.press(screen.getByText('Back to credit'));
    expect(JSON.stringify([...mockReplace.mock.calls, ...mockPush.mock.calls])).toContain('/restaurant/credit');
  });
});

describe('pending and polling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

  it('says it is confirming and not to pay again', async () => {
    statusM.mockResolvedValue(PENDING);
    renderScreen();
    expect(await screen.findByTestId('pay-result-pending')).toBeTruthy();
    expect(text()).toMatch(/We.re confirming your payment/);
    expect(text()).toContain('This can take a few minutes. Your invoices will be settled as soon as it clears.');
    expect(text()).toMatch(/Please don.t pay again\./);
    expect(screen.queryByTestId('pay-result-paid')).toBeNull();
  });

  it('asks again every 5 seconds and switches to paid when it lands', async () => {
    statusM.mockResolvedValue(PENDING);
    renderScreen();
    await screen.findByTestId('pay-result-pending');
    expect(statusM).toHaveBeenCalledTimes(1);

    await advance(5000);
    expect(statusM).toHaveBeenCalledTimes(2);
    await advance(5000);
    expect(statusM).toHaveBeenCalledTimes(3);

    statusM.mockResolvedValue(attempt());
    await advance(5000);
    expect(await screen.findByTestId('pay-result-paid')).toBeTruthy();
    expect(screen.queryByTestId('pay-result-pending')).toBeNull();
  });

  it('stops asking after two minutes, and says it will update when it clears', async () => {
    statusM.mockResolvedValue(PENDING);
    renderScreen();
    await screen.findByTestId('pay-result-pending');
    await advance(125_000);
    const calls = statusM.mock.calls.length;
    expect(calls).toBeGreaterThan(10);
    expect(calls).toBeLessThanOrEqual(27);

    await advance(60_000);
    expect(statusM).toHaveBeenCalledTimes(calls);
    expect(text()).toMatch(/We.ll update this when it clears\./);
    // Still honest: it has not been paid, so it does not say so.
    expect(screen.queryByTestId('pay-result-paid')).toBeNull();
  });

  it('a pending result that resolves refreshes credit, the invoices and the wallet', async () => {
    statusM.mockResolvedValue(PENDING);
    renderScreen();
    await screen.findByTestId('pay-result-pending');
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    statusM.mockResolvedValue(attempt());
    await advance(5000);
    await screen.findByTestId('pay-result-paid');
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['outlet', 7, 'credit']),
      JSON.stringify(['credit-agreement']),
      JSON.stringify(['credit-invoice']),
      JSON.stringify(['outlet', 7, 'wallet']),
    ]));
  });

  it('keeps asking while a refund is still going back, then stops', async () => {
    const going = attempt({ refundAmount: '600.5000', refundState: 'PENDING', invoices: [
      line(11, 1, 'Acme Foods'), line(12, 1, 'Acme Foods'), line(21, 2, 'Zed Foods', { outcome: 'SKIPPED', skipReason: 'AMOUNT_CHANGED' }),
    ] });
    statusM.mockResolvedValue(going);
    renderScreen();
    await screen.findByTestId('pay-refund-banner');
    await advance(5000);
    expect(statusM).toHaveBeenCalledTimes(2);

    statusM.mockResolvedValue({ ...going, refundState: 'COMPLETED' });
    await advance(5000);
    await waitFor(() => expect(text()).toMatch(/has been returned to your/));
    const calls = statusM.mock.calls.length;
    await advance(30_000);
    expect(statusM).toHaveBeenCalledTimes(calls);
  });

  it('a settled, nothing-pending attempt is read once and never polled', async () => {
    renderScreen();
    await screen.findByTestId('pay-result-paid');
    await advance(30_000);
    expect(statusM).toHaveBeenCalledTimes(1);
  });
});
