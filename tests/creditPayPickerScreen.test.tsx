import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PayPickerScreen from '@/app/restaurant/credit/pay/index';
import { ApiError } from '@/lib/api/errors';
import { fetchPayableInvoices, quoteCreditPayment } from '@/services/creditPay';
import type { CreditPayQuote, PayableInvoice, PayableInvoices, PayableSupplier } from '@/models/creditPay';
import { renderedText } from './fixtures/renderedText';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/restaurant/credit/pay',
    Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) =>
      <Pressable {...rest} onPress={() => mockPush(href)}>{children}</Pressable>,
  };
});
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar' } }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
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

const inv = (invoiceId: number, outstanding: string, o: Partial<PayableInvoice> = {}): PayableInvoice => ({
  invoiceId, invoiceNumber: `INV-${invoiceId}`, supplierOrderId: 100 + invoiceId, status: 'ISSUED',
  amount: '99999.0000', paidAmount: '1.0000', creditedAmount: '0.0000', outstanding,
  dueDate: '2026-10-20', overdueAfter: null, dueState: 'DUE_LATER', daysToDue: 11, openClaimsAmount: '0.0000', ...o,
});
const sup = (agreementId: number, name: string, invoices: PayableInvoice[], o: Partial<PayableSupplier> = {}): PayableSupplier => ({
  agreementId, supplierStoreId: 50 + agreementId, supplierName: name, storeName: null,
  agreementStatus: 'ACTIVE', payable: true, notPayableReason: null, due: '0.0000', overdue: '0.0000', invoices, ...o,
});
const payable = (suppliers: PayableSupplier[], o: Partial<PayableInvoices> = {}): PayableInvoices => ({
  outletId: 7, onlinePayEnabled: true, walletPayEnabled: true, methods: ['UPI', 'CARD', 'WALLET'],
  feePercent: '0.0000', minOnlineAmount: '1.0000', maxInvoices: 50, suppliers, ...o,
});

// Server order: Zed first (it holds the overdue invoice), then Acme, then one that cannot be paid.
const DATA = payable([
  sup(2, 'Zed Foods', [inv(21, '600.5000', { dueState: 'OVERDUE', daysToDue: -3 }), inv(22, '100.2500')]),
  sup(1, 'Acme Foods', [inv(11, '1500.0000'), inv(12, '250.5000')]),
  sup(3, 'Cash Only Co', [inv(31, '40.0000')], { payable: false, notPayableReason: 'Pay this supplier directly.' }),
]);

/** Deliberately not the sum of what was ticked: the sheet must show the server's figure. */
const QUOTE: CreditPayQuote = {
  invoiceCount: 2, supplierCount: 1, amount: '1751.0000', walletBalance: '5000.0000',
  methods: [
    { method: 'UPI', available: true, unavailableReason: null, feeAmount: '0.0000', totalCharged: '1751.0000', shortBy: null },
    { method: 'CARD', available: true, unavailableReason: null, feeAmount: '0.0000', totalCharged: '1751.0000', shortBy: null },
    { method: 'WALLET', available: true, unavailableReason: null, feeAmount: '0.0000', totalCharged: '1751.0000', shortBy: null },
  ],
};

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><PayPickerScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const barButton = () => screen.getByTestId('pay-bar-button');
const barDisabled = () => barButton().props.accessibilityState?.disabled === true;
const invoiceIds = () => screen.getAllByTestId(/^pay-invoice-\d+$/).map((n) => n.props.testID);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockOffline = false;
  payableM.mockResolvedValue(DATA);
  quoteM.mockResolvedValue(QUOTE);
});

describe('the list', () => {
  it('loads this outlet\'s payable invoices with the session token', async () => {
    renderScreen();
    await screen.findByTestId('credit-pay-picker');
    await waitFor(() => expect(payableM).toHaveBeenCalledWith('tok', 7));
  });

  it('shows suppliers and invoices in the order the server sent, not re-sorted', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-21');
    expect(screen.getAllByTestId(/^pay-supplier-\d+$/).map((n) => n.props.testID))
      .toEqual(['pay-supplier-2', 'pay-supplier-1', 'pay-supplier-3']);
    expect(invoiceIds()).toEqual(['pay-invoice-21', 'pay-invoice-22', 'pay-invoice-11', 'pay-invoice-12', 'pay-invoice-31']);
    expect(screen.getByText('Zed Foods')).toBeTruthy();
    expect(screen.getByText('Acme Foods')).toBeTruthy();
  });

  it('shows each invoice\'s number, due chip and the server\'s outstanding (not its amount)', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-21');
    const text = renderedText(screen.toJSON() as never);
    expect(text).toContain('INV-21');
    expect(text).toContain('Overdue');
    expect(text).toContain('₹600.50');
    expect(text).toContain('₹1,500.00');
    expect(text).not.toContain('99,999');
  });

  it('says what the bar is for before anything is chosen, and keeps Pay off', async () => {
    renderScreen();
    await screen.findByTestId('pay-bar');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent('Choose invoices to pay');
    expect(barDisabled()).toBe(true);
  });

  it('reads "Paying online isn\'t available yet." when the server says the flag is off', async () => {
    payableM.mockRejectedValue(new ApiError({ code: 'FORBIDDEN', message: 'Forbidden', status: 403 }));
    renderScreen();
    expect(await screen.findByText(/Paying online isn.t available yet\./)).toBeTruthy();
    expect(screen.queryByTestId('pay-bar-button')).toBeNull();
  });
});

describe('selecting', () => {
  it('ticks and unticks an invoice, and the bar follows with the server\'s outstanding, not the amount', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/1 invoice\b/);
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹1,500\.00/);
    expect(barDisabled()).toBe(false);

    press('pay-invoice-12');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices/);
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹1,750\.50/);

    press('pay-invoice-11');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/1 invoice\b/);
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹250\.50/);
    press('pay-invoice-12');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent('Choose invoices to pay');
    expect(barDisabled()).toBe(true);
  });

  it('adds across suppliers', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    press('pay-invoice-21');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices/);
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹2,100\.50/);
  });

  it('a supplier\'s Select all ticks all its invoices, then clears them', async () => {
    renderScreen();
    await screen.findByTestId('pay-supplier-all-1');
    expect(screen.getByTestId('pay-supplier-all-1').props.accessibilityLabel).toBe('Select all invoices from Acme Foods');
    press('pay-supplier-all-1');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices/);
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹1,750\.50/);
    press('pay-supplier-all-1');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent('Choose invoices to pay');
  });

  it('Select all completes a half-ticked supplier rather than clearing it', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    press('pay-supplier-all-1');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices/);
  });

  it('a supplier that cannot be paid shows the server\'s reason and its rows do nothing', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-31');
    expect(screen.getByText('Pay this supplier directly.')).toBeTruthy();
    expect(screen.getByTestId('pay-invoice-31').props.accessibilityState?.disabled).toBe(true);
    press('pay-invoice-31');
    press('pay-supplier-all-3');
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent('Choose invoices to pay');
    expect(barDisabled()).toBe(true);
  });

  it('opens with a supplier\'s invoices ticked from the agreementId param', async () => {
    mockParams = { agreementId: '1' };
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    await waitFor(() => expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices/));
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹1,750\.50/);
  });

  it('opens with the named invoices ticked from the invoiceIds param', async () => {
    mockParams = { invoiceIds: '22,11' };
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    await waitFor(() => expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices/));
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹1,600\.25/);
  });
});

describe('scoped to one supplier (scopeAgreementId)', () => {
  it('shows only that supplier\'s group and invoices, none of the others', async () => {
    mockParams = { scopeAgreementId: '1' };
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    expect(screen.getAllByTestId(/^pay-supplier-\d+$/).map((n) => n.props.testID)).toEqual(['pay-supplier-1']);
    expect(invoiceIds()).toEqual(['pay-invoice-11', 'pay-invoice-12']);
    expect(screen.queryByText('Zed Foods')).toBeNull();
    expect(screen.queryByTestId('pay-invoice-21')).toBeNull();
    expect(screen.queryByTestId('pay-supplier-3')).toBeNull();
  });

  it('names the supplier in the header and preselects all of its invoices when no ids are given', async () => {
    mockParams = { scopeAgreementId: '1' };
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    // Once in the header subtitle, once on the group.
    expect(screen.getAllByText('Acme Foods')).toHaveLength(2);
    expect(screen.queryByText('Indiranagar')).toBeNull();
    expect(renderedText(screen.toJSON() as never)).toContain('Pay dues');
    await waitFor(() => expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices/));
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹1,750\.50/);
  });

  it('preselects exactly the invoiceIds it was given, and ignores ids of other suppliers', async () => {
    mockParams = { scopeAgreementId: '1', invoiceIds: '12,21' };
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    await waitFor(() => expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/1 invoice\b/));
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹250\.50/);
    expect(screen.getByTestId('pay-invoice-11').props.accessibilityState?.checked).toBe(false);
  });

  it('sends only that supplier\'s invoices to the quote', async () => {
    mockParams = { scopeAgreementId: '1' };
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    await waitFor(() => expect(barDisabled()).toBe(false));
    press('pay-bar-button');
    await waitFor(() => expect(quoteM).toHaveBeenCalled());
    expect(quoteM.mock.calls[0][2]).toEqual([
      { invoiceId: 11, outstanding: '1500.0000' }, { invoiceId: 12, outstanding: '250.5000' },
    ]);
  });

  it('an unknown or invalid scope never falls back to everyone', async () => {
    mockParams = { scopeAgreementId: '4242' };
    const first = renderScreen();
    expect(await screen.findByText('Nothing to pay')).toBeTruthy();
    expect(screen.queryByTestId('pay-supplier-1')).toBeNull();
    first.unmount();
    mockParams = { scopeAgreementId: 'abc' };
    renderScreen();
    expect(await screen.findByText('Nothing to pay')).toBeTruthy();
    expect(screen.queryByTestId('pay-supplier-1')).toBeNull();
    expect(screen.queryByTestId('pay-supplier-2')).toBeNull();
  });

  it('without the param every supplier is still listed (main Pay dues)', async () => {
    mockParams = {};
    renderScreen();
    await screen.findByTestId('pay-invoice-21');
    expect(screen.getAllByTestId(/^pay-supplier-\d+$/)).toHaveLength(3);
  });
});

describe('the limit', () => {
  it('past maxInvoices the note shows and Pay is off, and tapping it asks for nothing', async () => {
    payableM.mockResolvedValue({ ...DATA, maxInvoices: 2 });
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-21');
    press('pay-invoice-22');
    expect(screen.queryByTestId('pay-limit-note')).toBeNull();
    expect(barDisabled()).toBe(false);

    press('pay-invoice-11');
    expect(screen.getByTestId('pay-limit-note')).toHaveTextContent('Choose at most 2 invoices at a time.');
    expect(barDisabled()).toBe(true);
    press('pay-bar-button');
    expect(quoteM).not.toHaveBeenCalled();

    press('pay-invoice-11');
    expect(screen.queryByTestId('pay-limit-note')).toBeNull();
    expect(barDisabled()).toBe(false);
  });
});

describe('the double-pay warning', () => {
  const withClaim = payable([
    sup(1, 'Acme Foods', [inv(11, '1500.0000', { openClaimsAmount: '300.0000' }), inv(12, '250.5000')]),
  ]);

  it('shows only while a ticked invoice has a waiting "Paid direct" claim', async () => {
    payableM.mockResolvedValue(withClaim);
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    expect(screen.queryByTestId('pay-double-warning')).toBeNull();

    press('pay-invoice-12');
    expect(screen.queryByTestId('pay-double-warning')).toBeNull();

    press('pay-invoice-11');
    expect(screen.getByTestId('pay-double-warning')).toBeTruthy();

    press('pay-invoice-11');
    expect(screen.queryByTestId('pay-double-warning')).toBeNull();
  });

  it('a claim of ₹0 is no claim', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    expect(screen.queryByTestId('pay-double-warning')).toBeNull();
  });
});

describe('Pay', () => {
  it('asks the server for a quote with the ids and the outstanding shown, in server order', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-12');
    press('pay-invoice-21');
    press('pay-invoice-11');
    press('pay-bar-button');

    await waitFor(() => expect(quoteM).toHaveBeenCalledTimes(1));
    expect(quoteM).toHaveBeenCalledWith('tok', 7, [
      { invoiceId: 21, outstanding: '600.5000' },
      { invoiceId: 11, outstanding: '1500.0000' },
      { invoiceId: 12, outstanding: '250.5000' },
    ]);
  });

  it('opens the method sheet with the server\'s total, not one the app added up', async () => {
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    press('pay-invoice-12');
    press('pay-bar-button');

    expect(await screen.findByTestId('pay-method-sheet')).toBeTruthy();
    // The app's own sum is ₹1,750.50; the quote said ₹1,751.00.
    expect(renderedText(screen.toJSON() as never)).toContain('Pay ₹1,751.00');
  });

  it('does not open the sheet before the quote arrives', async () => {
    quoteM.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    press('pay-bar-button');
    await waitFor(() => expect(quoteM).toHaveBeenCalled());
    expect(screen.queryByTestId('pay-method-sheet')).toBeNull();
  });

  it('a second tap on Pay while the quote is out does not ask twice', async () => {
    quoteM.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    press('pay-bar-button');
    press('pay-bar-button');
    await waitFor(() => expect(quoteM).toHaveBeenCalled());
    expect(quoteM).toHaveBeenCalledTimes(1);
  });

  it('when the selection changed (409): refetches, drops the changed ids, tells the person, opens no sheet', async () => {
    quoteM.mockRejectedValue(new ApiError({
      code: 'CREDIT_PAY_SELECTION_CHANGED', message: 'changed', status: 409, details: { changedInvoiceIds: [11] },
    }));
    const after = payable([
      sup(2, 'Zed Foods', [inv(21, '600.5000'), inv(22, '100.2500')]),
      sup(1, 'Acme Foods', [inv(12, '250.5000')]),
    ]);
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    press('pay-invoice-12');
    payableM.mockResolvedValue(after);
    press('pay-bar-button');

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(String(mockToast.mock.calls[0]?.[0])).toMatch(/Some invoices changed\. We.ve updated the list\./);
    await waitFor(() => expect(payableM).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('pay-invoice-11')).toBeNull());
    // The one that did not change stays ticked.
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/1 invoice\b/);
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹250\.50/);
    expect(screen.queryByTestId('pay-method-sheet')).toBeNull();
  });

  it('a changed invoice that is still listed is unticked too, so it is not sent again', async () => {
    quoteM.mockRejectedValue(new ApiError({
      code: 'CREDIT_PAY_SELECTION_CHANGED', message: 'changed', status: 409, details: { changedInvoiceIds: [11] },
    }));
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    press('pay-invoice-11');
    press('pay-invoice-12');
    press('pay-bar-button');
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/1 invoice\b/));
    expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/₹250\.50/);
  });
});

describe('offline', () => {
  it('shows the offline banner and keeps Pay off even with invoices ticked', async () => {
    mockOffline = true;
    mockParams = { agreementId: '1' };
    renderScreen();
    await screen.findByTestId('pay-invoice-11');
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('pay-bar-text')).toHaveTextContent(/2 invoices|Connect to pay/));
    expect(barDisabled()).toBe(true);
    press('pay-bar-button');
    expect(quoteM).not.toHaveBeenCalled();
    expect(renderedText(screen.toJSON() as never)).toMatch(/You.re offline\. Connect to pay\./);
  });
});
