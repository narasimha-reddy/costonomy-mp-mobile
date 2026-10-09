import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PayPickerScreen from '@/app/restaurant/credit/pay/index';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { CheckoutDismissed, CheckoutFailed } from '@/lib/payments/types';
import { openRazorpayCheckout } from '@/lib/payments/razorpayCheckout';
import {
  createCreditPayment, fetchCreditPayment, fetchPayableInvoices, quoteCreditPayment, verifyCreditPayment,
} from '@/services/creditPay';
import type {
  CreditPayAttempt, CreditPayQuote, MethodQuote, PayableInvoice, PayableInvoices, PayableSupplier,
} from '@/models/creditPay';
import { renderedText } from './fixtures/renderedText';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => ({}),
    usePathname: () => '/restaurant/credit/pay',
    Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) =>
      <Pressable {...rest} onPress={() => mockPush(href)}>{children}</Pressable>,
  };
});
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar' } }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('@/services/creditPay', () => ({
  ...jest.requireActual('@/services/creditPay'),
  fetchPayableInvoices: jest.fn(),
  quoteCreditPayment: jest.fn(),
  createCreditPayment: jest.fn(),
  verifyCreditPayment: jest.fn(),
  fetchCreditPayment: jest.fn(),
}));
jest.mock('@/lib/payments/razorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }));

const payableM = fetchPayableInvoices as jest.Mock;
const quoteM = quoteCreditPayment as jest.Mock;
const createM = createCreditPayment as jest.Mock;
const verifyM = verifyCreditPayment as jest.Mock;
const statusM = fetchCreditPayment as jest.Mock;
const checkoutM = openRazorpayCheckout as jest.Mock;

const inv = (invoiceId: number, outstanding: string): PayableInvoice => ({
  invoiceId, invoiceNumber: `INV-${invoiceId}`, supplierOrderId: 100 + invoiceId, status: 'ISSUED',
  amount: '99999.0000', paidAmount: '1.0000', creditedAmount: '0.0000', outstanding,
  dueDate: '2026-10-20', overdueAfter: null, dueState: 'DUE_LATER', daysToDue: 11, openClaimsAmount: '0.0000',
});
const supplier: PayableSupplier = {
  agreementId: 1, supplierStoreId: 51, supplierName: 'Acme Foods', storeName: null, agreementStatus: 'ACTIVE',
  payable: true, notPayableReason: null, due: '0.0000', overdue: '0.0000',
  invoices: [inv(11, '1500.0000'), inv(12, '250.5000')],
};
const DATA: PayableInvoices = {
  outletId: 7, onlinePayEnabled: true, walletPayEnabled: true, methods: ['UPI', 'CARD', 'WALLET'],
  feePercent: '0.0000', minOnlineAmount: '1.0000', maxInvoices: 50, suppliers: [supplier],
};
const ITEMS = [{ invoiceId: 11, outstanding: '1500.0000' }, { invoiceId: 12, outstanding: '250.5000' }];

const ok = (method: 'UPI' | 'CARD' | 'WALLET', fee = '0.0000'): MethodQuote => ({
  method, available: true, unavailableReason: null, feeAmount: fee, totalCharged: '1751.0000', shortBy: null,
});
const quote = (methods: MethodQuote[], o: Partial<CreditPayQuote> = {}): CreditPayQuote => ({
  invoiceCount: 2, supplierCount: 1, amount: '1751.0000', walletBalance: '5000.0000', methods, ...o,
});
const attempt = (o: Partial<CreditPayAttempt> = {}): CreditPayAttempt => ({
  attemptId: 9, outletId: 7, status: 'CREATED', method: 'UPI', paidWith: null, paymentDetail: null, invoiceCount: 2,
  amount: '1751.0000', feeAmount: '0.0000', totalCharged: '1751.0000', currency: 'INR',
  razorpayOrderId: 'order_X', razorpayPaymentId: null, keyId: 'rzp_test_k', reopened: false,
  refundAmount: '0.0000', refundState: 'NONE', createdAt: '2026-10-09T05:00:00Z', paidAt: null, expiresAt: null,
  walletBalanceAfter: null, suppliers: [], invoices: [], ...o,
});
const PAID = attempt({ status: 'PAID', razorpayPaymentId: 'pay_1' });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const apiError = (status: number, code: string, details?: Record<string, unknown>, message = 'server says') =>
  new ApiError({ code, message, status, details });

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
let client: QueryClient;
function renderScreen() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><PayPickerScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const text = () => renderedText(screen.toJSON() as never);

/** Ticks both of Acme's invoices, asks for the quote and waits for the sheet. */
async function openSheet(q: CreditPayQuote = quote([ok('UPI'), ok('CARD'), ok('WALLET')])) {
  quoteM.mockResolvedValue(q);
  renderScreen();
  await screen.findByTestId('pay-invoice-11');
  press('pay-supplier-all-1');
  press('pay-bar-button');
  await screen.findByTestId('pay-method-sheet');
}
const continueButton = () => screen.getByTestId('pay-method-continue');

beforeEach(() => {
  jest.clearAllMocks();
  payableM.mockResolvedValue(DATA);
  createM.mockResolvedValue(attempt());
  verifyM.mockResolvedValue(PAID);
  statusM.mockResolvedValue(attempt());
  checkoutM.mockResolvedValue({ providerPaymentId: 'pay_1', providerSignature: 'sig_1' });
});

describe('the options', () => {
  it('offers the methods the quote offers, in words', async () => {
    await openSheet();
    expect(screen.getByTestId('pay-method-UPI')).toBeTruthy();
    expect(screen.getByTestId('pay-method-CARD')).toBeTruthy();
    expect(screen.getByTestId('pay-method-WALLET')).toBeTruthy();
    const t = text();
    expect(t).toContain('Pay with any UPI app');
    expect(t).toContain('Debit or credit card');
    expect(t).toContain('Balance ₹5,000.00');
  });

  it('shows the server\'s total as the title, not the app\'s sum (₹1,750.50)', async () => {
    await openSheet();
    const sheet = renderedText(screen.getByTestId('pay-method-sheet').children as never);
    expect(sheet).toContain('Pay ₹1,751.00');
    // The bar behind the sheet shows the app's display sum; the sheet must not.
    expect(sheet).not.toContain('1,750.50');
  });

  it('leaves out a method the quote does not list', async () => {
    await openSheet(quote([ok('UPI'), ok('CARD')], { walletBalance: null }));
    expect(screen.queryByTestId('pay-method-WALLET')).toBeNull();
  });

  it('wallet short: says by how much, from the server, and links to Add money', async () => {
    await openSheet(quote([
      ok('UPI'), ok('CARD'),
      { method: 'WALLET', available: false, unavailableReason: 'WALLET_SHORT', feeAmount: '0.0000', totalCharged: '1751.0000', shortBy: '120.5000' },
    ], { walletBalance: '1630.5000' }));
    expect(screen.getByTestId('pay-method-wallet-short')).toHaveTextContent('Wallet is ₹120.50 short');
    press('pay-method-add-money');
    expect(JSON.stringify(mockPush.mock.calls)).toContain('/restaurant/wallet/add-money');
  });

  it('wallet short cannot be chosen: Continue does nothing for it', async () => {
    await openSheet(quote([
      ok('UPI'),
      { method: 'WALLET', available: false, unavailableReason: 'WALLET_SHORT', feeAmount: '0.0000', totalCharged: '1751.0000', shortBy: '120.5000' },
    ]));
    press('pay-method-WALLET');
    press('pay-method-continue');
    // Whatever Continue does (it may fall back to UPI), it never creates a wallet payment.
    expect(createM.mock.calls.map((c) => c[3])).not.toContain('WALLET');
  });

  it('wallet on hold: says so and offers no Add money', async () => {
    await openSheet(quote([
      ok('UPI'),
      { method: 'WALLET', available: false, unavailableReason: 'WALLET_ON_HOLD', feeAmount: '0.0000', totalCharged: '1751.0000', shortBy: null },
    ]));
    expect(text()).toContain('Your wallet is on hold. Please contact support.');
    expect(screen.queryByTestId('pay-method-add-money')).toBeNull();
  });

  it('below the online minimum: UPI and Card say to use the wallet, and cannot be chosen', async () => {
    const small = (method: 'UPI' | 'CARD'): MethodQuote => ({
      method, available: false, unavailableReason: 'BELOW_MINIMUM', feeAmount: '0.0000', totalCharged: '0.5000', shortBy: null,
    });
    await openSheet(quote([small('UPI'), small('CARD'), ok('WALLET')], { amount: '0.5000' }));
    expect(text()).toContain('Online payments start at ₹1. Pay this from your wallet.');
    press('pay-method-UPI');
    press('pay-method-continue');
    // Whatever Continue does (it may fall back to the wallet), it never opens UPI or card.
    expect(createM.mock.calls.map((c) => c[3])).not.toContain('UPI');
    expect(createM.mock.calls.map((c) => c[3])).not.toContain('CARD');
    expect(checkoutM).not.toHaveBeenCalled();
  });
});

describe('the fee line', () => {
  it('is absent when the server charges no fee', async () => {
    await openSheet();
    press('pay-method-UPI');
    expect(text()).not.toMatch(/payment fee/);
  });

  it('shows the server\'s fee when there is one', async () => {
    await openSheet(quote([ok('UPI', '35.0000'), ok('CARD', '35.0000'), ok('WALLET')], { amount: '1751.0000' }));
    press('pay-method-UPI');
    expect(text()).toContain('Includes a ₹35.00 payment fee');
  });
});

describe('Continue', () => {
  it('UPI: creates with the items, method and a key, opens checkout for UPI, verifies, and opens the result', async () => {
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(createM).toHaveBeenCalledTimes(1);
    const [token, outletId, items, method, key] = createM.mock.calls[0] as unknown[];
    expect([token, outletId, items, method]).toEqual(['tok', 7, ITEMS, 'UPI']);
    expect(typeof key).toBe('string');
    expect((key as string).length).toBeGreaterThan(8);

    expect(checkoutM).toHaveBeenCalledWith(expect.objectContaining({
      key: 'rzp_test_k', providerOrderId: 'order_X', method: 'upi',
    }));
    expect(verifyM).toHaveBeenCalledWith('tok', 7, 9, { paymentId: 'pay_1', signature: 'sig_1' });
    expect(mockReplace).toHaveBeenCalledWith('/restaurant/credit/pay/9');
  });

  it('Card opens checkout for card', async () => {
    createM.mockResolvedValue(attempt({ method: 'CARD' }));
    await openSheet();
    press('pay-method-CARD');
    press('pay-method-continue');
    await waitFor(() => expect(checkoutM).toHaveBeenCalled());
    expect(createM.mock.calls[0]?.[3]).toBe('CARD');
    expect(checkoutM).toHaveBeenCalledWith(expect.objectContaining({ method: 'card' }));
  });

  it('Wallet creates with WALLET, opens no checkout and no verify, then the result', async () => {
    createM.mockResolvedValue(attempt({ status: 'PAID', method: 'WALLET', walletBalanceAfter: '3249.0000' }));
    await openSheet();
    press('pay-method-WALLET');
    press('pay-method-continue');

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/credit/pay/9'));
    expect(createM.mock.calls[0]?.[3]).toBe('WALLET');
    expect(checkoutM).not.toHaveBeenCalled();
    expect(verifyM).not.toHaveBeenCalled();
  });

  it('after it is paid, every credit view and the wallet are refreshed', async () => {
    await openSheet();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['outlet', 7, 'credit']),
      JSON.stringify(['credit-agreement']),
      JSON.stringify(['credit-invoice']),
      JSON.stringify(['outlet', 7, 'wallet']),
    ]));
  });

  it('a double tap makes one payment, not two', async () => {
    const pending = deferred<CreditPayAttempt>();
    createM.mockReturnValue(pending.promise);
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    press('pay-method-continue');
    press('pay-method-continue');

    await waitFor(() => expect(createM).toHaveBeenCalled());
    expect(createM).toHaveBeenCalledTimes(1);
    expect(continueButton().props.accessibilityState?.disabled).toBe(true);
    expect(text()).toContain('Opening payment…');

    await act(async () => { pending.resolve(attempt()); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(createM).toHaveBeenCalledTimes(1);
    expect(checkoutM).toHaveBeenCalledTimes(1);
    expect(verifyM).toHaveBeenCalledTimes(1);
  });

  it('shows "Confirming…" while the server is asked, and still one verify', async () => {
    const pending = deferred<CreditPayAttempt>();
    verifyM.mockReturnValue(pending.promise);
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(verifyM).toHaveBeenCalled());
    expect(text()).toContain('Confirming…');
    press('pay-method-continue');
    await act(async () => { pending.resolve(PAID); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(createM).toHaveBeenCalledTimes(1);
    expect(verifyM).toHaveBeenCalledTimes(1);
  });
});

describe('the idempotency key', () => {
  it('an unknown outcome (500) is retried under the same key, so it cannot pay twice', async () => {
    createM.mockRejectedValueOnce(apiError(500, 'INTERNAL')).mockResolvedValue(attempt());
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(createM).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(continueButton().props.accessibilityState?.disabled).not.toBe(true));
    press('pay-method-continue');
    await waitFor(() => expect(createM).toHaveBeenCalledTimes(2));
    expect(createM.mock.calls[1]?.[4]).toBe(createM.mock.calls[0]?.[4]);
  });

  it('a dropped connection on create is retried under the same key', async () => {
    createM.mockRejectedValueOnce(new NetworkError('offline')).mockResolvedValue(attempt());
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(createM).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(continueButton().props.accessibilityState?.disabled).not.toBe(true));
    press('pay-method-continue');
    await waitFor(() => expect(createM).toHaveBeenCalledTimes(2));
    expect(createM.mock.calls[1]?.[4]).toBe(createM.mock.calls[0]?.[4]);
  });

  it('a refusal (422) is known, so the next try gets a new key', async () => {
    createM.mockRejectedValueOnce(apiError(422, 'SUPPLIER_UNAVAILABLE', undefined, 'Pay Acme directly. Online payment isn\'t available for them.'))
      .mockResolvedValue(attempt());
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(createM).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(continueButton().props.accessibilityState?.disabled).not.toBe(true));
    press('pay-method-continue');
    await waitFor(() => expect(createM).toHaveBeenCalledTimes(2));
    expect(createM.mock.calls[1]?.[4]).not.toBe(createM.mock.calls[0]?.[4]);
  });
});

describe('endings that stay on the sheet', () => {
  it('create refused: shows the server\'s own sentence and opens no checkout', async () => {
    createM.mockRejectedValue(apiError(422, 'SUPPLIER_UNAVAILABLE', undefined, 'Pay Acme directly. Online payment isn\'t available for them.'));
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(text()).toContain('Pay Acme directly. Online payment isn\'t available for them.'));
    expect(checkoutM).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('the wallet turning out short at create: shows the short line with the server\'s shortBy', async () => {
    createM.mockRejectedValue(apiError(422, 'WALLET_INSUFFICIENT_BALANCE', { shortBy: '75.2500' }));
    await openSheet();
    press('pay-method-WALLET');
    press('pay-method-continue');
    await waitFor(() => expect(text()).toContain('Wallet is ₹75.25 short'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('the selection changing at create: toast, list refetched, sheet closed, no checkout', async () => {
    createM.mockRejectedValue(apiError(409, 'CREDIT_PAY_SELECTION_CHANGED', { changedInvoiceIds: [11] }));
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(String(mockToast.mock.calls[0]?.[0])).toMatch(/Some invoices changed\. We.ve updated the list\./);
    await waitFor(() => expect(payableM.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(checkoutM).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('pay-method-sheet')).toBeNull());
  });

  it('closing the checkout without paying is quiet: no error text, no result screen, Continue works again', async () => {
    checkoutM.mockRejectedValue(new CheckoutDismissed());
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(statusM).toHaveBeenCalledWith('tok', 7, 9));
    await waitFor(() => expect(continueButton().props.accessibilityState?.disabled).not.toBe(true));
    expect(verifyM).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(text()).not.toMatch(/fail|went wrong|error/i);
    expect(mockToast.mock.calls.filter((c) => c[1] === 'error')).toHaveLength(0);
  });

  it('closing the checkout when the server already has the money goes to the paid result', async () => {
    checkoutM.mockRejectedValue(new CheckoutDismissed());
    statusM.mockResolvedValue(PAID);
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/credit/pay/9'));
  });

  it('a declined payment says nothing was charged and offers Try again under a NEW key', async () => {
    verifyM.mockRejectedValue(apiError(422, 'PAYMENT_FAILED'));
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(text()).toMatch(/didn.t go through\. Nothing was charged\./));
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(createM).toHaveBeenCalledTimes(2));
    expect(createM.mock.calls[1]?.[4]).not.toBe(createM.mock.calls[0]?.[4]);
  });

  it('a checkout that fails before any payment reads as declined, not as a crash', async () => {
    checkoutM.mockRejectedValue(new CheckoutFailed('Card declined.'));
    await openSheet();
    press('pay-method-CARD');
    press('pay-method-continue');
    await waitFor(() => expect(text()).toMatch(/didn.t go through\. Nothing was charged\./));
    expect(verifyM).not.toHaveBeenCalled();
  });
});

describe('after a payment id came back', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a verify that hangs for 20 seconds is given up on, then the server is asked, and the result opens as pending', async () => {
    verifyM.mockReturnValue(new Promise(() => undefined));
    statusM.mockResolvedValue(attempt());
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await waitFor(() => expect(verifyM).toHaveBeenCalled());
    await act(async () => { await jest.advanceTimersByTimeAsync(19_000); });
    expect(statusM).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(1_000 + 2000 + 4000 + 6000 + 100); });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/credit/pay/9'));
    expect(statusM).toHaveBeenCalledTimes(3);
    expect(text()).not.toMatch(/didn.t go through|went wrong|failed/i);
  });

  it('a verify that errors never reads as failed: it waits, asks the server, and opens the result as pending', async () => {
    verifyM.mockRejectedValue(new NetworkError('offline'));
    statusM.mockResolvedValue(attempt());
    await openSheet();
    press('pay-method-UPI');
    press('pay-method-continue');
    await act(async () => { await jest.advanceTimersByTimeAsync(2000 + 4000 + 6000 + 100); });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/credit/pay/9'));
    expect(statusM).toHaveBeenCalledTimes(3);
    expect(text()).not.toMatch(/didn.t go through|went wrong|failed/i);
  });
});
