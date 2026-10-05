import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import CreditAgreementScreen from '@/app/restaurant/credit/[id]';
import {
  acceptAgreement, fetchAgreement, fetchCreditSummary, fetchInvoices,
} from '@/services/credit';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/restaurant/credit/3',
  useLocalSearchParams: () => ({ id: '3' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
const mockSheet = jest.fn();
jest.mock('@/components/credit/PayFromWalletSheet', () => ({
  PayFromWalletSheet: (props: Record<string, unknown>) => { mockSheet(props); return null; },
}));
jest.mock('@/services/credit', () => ({
  acceptAgreement: jest.fn(),
  fetchAgreement: jest.fn(),
  fetchCreditSummary: jest.fn(),
  fetchInvoices: jest.fn(),
}));

const txt = (t: string) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const agreementM = fetchAgreement as jest.Mock;
const summaryM = fetchCreditSummary as jest.Mock;
const invoicesM = fetchInvoices as jest.Mock;
const acceptM = acceptAgreement as jest.Mock;

const agreement = (o: Record<string, unknown> = {}) => ({
  id: 3, status: 'ACTIVE', supplierName: 'Acme Foods', storeName: 'Acme Main',
  approvedLimit: '50000', reserved: '0', utilized: '9200', available: '40800',
  due: '9200', overdue: '0', creditPeriodDays: 30, gracePeriodDays: 5,
  maxSingleOrderCredit: null, termsVersion: null, suspensionReason: null,
  canFund: true, latestRequest: null, ...o,
});
const inv = (id: number, o: Record<string, unknown> = {}) => ({
  id, invoiceNumber: `INV-${id}`, creditAgreementId: 3, supplierOrderId: 100 + id, status: 'ISSUED',
  amount: '9200', paidAmount: '2700', outstanding: '6500', dueDate: '2026-10-20', dueState: 'DUE_LATER',
  daysToDue: 15, settledAt: null, ...o,
});

// Cached queries keep a garbage-collection timer alive; clearing them lets jest exit by itself.
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <CreditAgreementScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
  agreementM.mockResolvedValue(agreement());
  summaryM.mockResolvedValue({ walletRepayEnabled: true });
  invoicesM.mockResolvedValue([]);
});

describe('summary', () => {
  it('shows owed, and overdue with an icon and words', async () => {
    agreementM.mockResolvedValue(agreement({ due: '9200', overdue: '2500' }));
    renderScreen();
    expect(await screen.findByTestId('credit-owed')).toHaveTextContent(txt('₹9,200.00'));
    expect(screen.getByTestId('credit-overdue')).toHaveTextContent(txt('icon:alert-circle'));
    expect(screen.getByTestId('credit-overdue')).toHaveTextContent(txt('₹2,500.00 overdue'));
  });

  it('hides the overdue line when nothing is overdue', async () => {
    renderScreen();
    await screen.findByTestId('credit-owed');
    expect(screen.queryByTestId('credit-overdue')).toBeNull();
  });

  it('words the terms with and without grace', async () => {
    renderScreen();
    expect(await screen.findByTestId('credit-terms-line')).toHaveTextContent(txt('30 days + 5 days grace'));
  });

  it('omits grace when it is zero', async () => {
    agreementM.mockResolvedValue(agreement({ gracePeriodDays: 0 }));
    renderScreen();
    expect(await screen.findByTestId('credit-terms-line')).toHaveTextContent(/^30 days$/);
  });
});

describe('suspension', () => {
  it('says paused and offers the fix when suspended for overdue', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'SUSPENDED', suspensionReason: 'Overdue balance of ₹2,500' }));
    renderScreen();
    const banner = await screen.findByTestId('credit-suspended-banner');
    expect(banner).toHaveTextContent(txt('Paused: Overdue balance of ₹2,500'));
    expect(banner).toHaveTextContent(txt("Paying what's overdue can restore it."));
  });

  it('attributes a supplier suspension and does not promise a fix', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'SUSPENDED', suspensionReason: 'Dispute pending' }));
    renderScreen();
    const banner = await screen.findByTestId('credit-suspended-banner');
    expect(banner).toHaveTextContent(txt('Suspended by supplier: Dispute pending'));
    expect(banner).not.toHaveTextContent(txt('can restore it'));
  });
});

describe('invoices', () => {
  const list = [
    inv(1, { dueState: 'DUE_LATER', dueDate: '2026-12-01', daysToDue: 40 }),
    inv(2, { dueState: 'OVERDUE', dueDate: '2026-09-10', daysToDue: -25 }),
    inv(3, { dueState: 'PAID', outstanding: '0', paidAmount: '9200', settledAt: '2026-09-01' }),
    inv(4, { dueState: 'DUE_TODAY', dueDate: '2026-10-05', daysToDue: 0 }),
    inv(5, { dueState: 'WRITTEN_OFF', outstanding: '0', settledAt: '2026-08-01' }),
  ];

  it('defaults to Open, most urgent first, with chips and owed text', async () => {
    invoicesM.mockResolvedValue(list);
    renderScreen();
    await screen.findByTestId('credit-invoice-2');
    const ids = screen.getAllByTestId(/^credit-invoice-\d+$/).map((n) => n.props.testID);
    expect(ids).toEqual(['credit-invoice-2', 'credit-invoice-4', 'credit-invoice-1']);
    expect(screen.getByTestId('credit-invoice-chip-2')).toHaveTextContent(txt('Overdue'));
    expect(screen.getByTestId('credit-invoice-chip-4')).toHaveTextContent(txt('Due today'));
    expect(screen.getByTestId('credit-invoice-chip-1')).toHaveTextContent(txt('Due in 40 days'));
    expect(screen.getByTestId('credit-invoice-2')).toHaveTextContent(txt('₹6,500.00 of ₹9,200.00 owed'));
    expect(screen.getByTestId('credit-invoice-2')).toHaveTextContent(txt('Order #102'));
  });

  it('shows paid and written-off under Paid', async () => {
    invoicesM.mockResolvedValue(list);
    renderScreen();
    await screen.findByTestId('credit-invoice-2');
    fireEvent.press(screen.getByTestId('credit-tab-paid'));
    expect(screen.getAllByTestId(/^credit-invoice-\d+$/).map((n) => n.props.testID))
      .toEqual(['credit-invoice-3', 'credit-invoice-5']);
    expect(screen.getByTestId('credit-invoice-chip-3')).toHaveTextContent(txt('Paid'));
    expect(screen.getByTestId('credit-invoice-chip-5')).toHaveTextContent(txt('Written off'));
  });

  it('words the remaining chips', async () => {
    invoicesM.mockResolvedValue([
      inv(1, { dueState: 'IN_GRACE' }),
      inv(2, { dueState: 'DUE_SOON', daysToDue: 1 }),
    ]);
    renderScreen();
    await screen.findByTestId('credit-invoice-1');
    expect(screen.getByTestId('credit-invoice-chip-1')).toHaveTextContent(txt('Past due'));
    expect(screen.getByTestId('credit-invoice-chip-2')).toHaveTextContent(txt('Due tomorrow'));
  });

  it('shows no chip for an unknown state', async () => {
    invoicesM.mockResolvedValue([inv(1, { dueState: undefined })]);
    renderScreen();
    await screen.findByTestId('credit-invoice-1');
    expect(screen.queryByTestId('credit-invoice-chip-1')).toBeNull();
  });

  it('navigates to the invoice', async () => {
    invoicesM.mockResolvedValue([inv(9)]);
    renderScreen();
    fireEvent.press(await screen.findByTestId('credit-invoice-9'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/credit/invoice/9');
  });

  it('has plain empty states', async () => {
    renderScreen();
    expect(await screen.findByText('No open invoices')).toBeTruthy();
    fireEvent.press(screen.getByTestId('credit-tab-paid'));
    expect(screen.getByText('No paid invoices yet')).toBeTruthy();
  });

  it('shows 50 then more on request', async () => {
    invoicesM.mockResolvedValue(Array.from({ length: 60 }, (_, i) => inv(i + 1)));
    renderScreen();
    await screen.findByTestId('credit-show-more');
    expect(screen.getAllByTestId(/^credit-invoice-\d+$/)).toHaveLength(50);
    fireEvent.press(screen.getByTestId('credit-show-more'));
    expect(screen.getAllByTestId(/^credit-invoice-\d+$/)).toHaveLength(60);
    expect(screen.queryByTestId('credit-show-more')).toBeNull();
  });
});

describe('sticky pay bar', () => {
  it('opens the sheet with this agreement', async () => {
    agreementM.mockResolvedValue(agreement({ due: '9200', overdue: '2500' }));
    renderScreen();
    const button = await screen.findByTestId('credit-pay-bar-button');
    expect(button).toHaveTextContent(txt('Pay ₹9,200.00'));
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(Colors.primary);
    expect(StyleSheet.flatten(button.props.style).backgroundColor).not.toBe(Colors.credit);
    fireEvent.press(button);
    expect(mockSheet).toHaveBeenLastCalledWith(expect.objectContaining({
      visible: true, agreementId: 3, supplierName: 'Acme Foods', due: '9200', overdue: '2500',
    }));
  });

  it('drops Pay but keeps I paid when wallet repay is disabled', async () => {
    summaryM.mockResolvedValue({ walletRepayEnabled: false });
    renderScreen();
    await screen.findByTestId('credit-owed');
    await waitFor(() => expect(summaryM).toHaveBeenCalled());
    expect(screen.queryByTestId('credit-pay-bar-button')).toBeNull();
    expect(screen.getByTestId('credit-i-paid-bar-button')).toBeTruthy();
  });

  it('drops Pay but keeps I paid when the flag is absent', async () => {
    summaryM.mockResolvedValue({});
    renderScreen();
    await screen.findByTestId('credit-owed');
    await waitFor(() => expect(summaryM).toHaveBeenCalled());
    expect(screen.queryByTestId('credit-pay-bar-button')).toBeNull();
    expect(screen.getByTestId('credit-i-paid-bar-button')).toBeTruthy();
  });

  it('hides I paid when this supplier has nothing reportable, and keeps Pay', async () => {
    agreementM.mockResolvedValue(agreement({ reportableAmount: 0 }));
    summaryM.mockResolvedValue({ walletRepayEnabled: true });
    renderScreen();
    await screen.findByTestId('credit-pay-bar-button');
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
  });

  it('shows I paid when this supplier has something reportable', async () => {
    agreementM.mockResolvedValue(agreement({ reportableAmount: 100 }));
    summaryM.mockResolvedValue({ walletRepayEnabled: true });
    renderScreen();
    expect(await screen.findByTestId('credit-i-paid-bar-button')).toBeTruthy();
  });

  it('is hidden when nothing is owed', async () => {
    agreementM.mockResolvedValue(agreement({ due: '0' }));
    renderScreen();
    await screen.findByTestId('credit-owed');
    expect(screen.queryByTestId('credit-pay-bar-button')).toBeNull();
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
  });

  it('shows Pay and I paid together, I paid as the outline button, and opens the claim form', async () => {
    renderScreen();
    await screen.findByTestId('credit-pay-bar-button');
    const claim = screen.getByTestId('credit-i-paid-bar-button');
    expect(claim).toHaveTextContent(txt('I paid'));
    expect(StyleSheet.flatten(claim.props.style).backgroundColor).toBe(Colors.surface);
    expect(StyleSheet.flatten(claim.props.style).backgroundColor).not.toBe(Colors.credit);
    fireEvent.press(claim);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/credit/claim', params: { agreementId: '3' },
    });
  });

  it('is hidden while the agreement is not usable yet', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'REJECTED', canFund: false, latestRequest: { status: 'REJECTED' } }));
    renderScreen();
    await screen.findByText('They turned this down');
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
  });

  it('is disabled offline', async () => {
    mockOffline = true;
    renderScreen();
    const button = await screen.findByTestId('credit-pay-bar-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });
});

describe('payment reported', () => {
  it('says a report is waiting for the supplier when there is one', async () => {
    agreementM.mockResolvedValue(agreement({ openClaimsAmount: '1500.0000' }));
    renderScreen();
    expect(await screen.findByTestId('credit-reported'))
      .toHaveTextContent('Payment reported: ₹1,500.00 · waiting for supplier');
  });

  it.each([['0.0000'], [undefined]])('says nothing when the open amount is %p', async (value) => {
    agreementM.mockResolvedValue(agreement({ openClaimsAmount: value }));
    renderScreen();
    await screen.findByTestId('credit-owed');
    expect(screen.queryByTestId('credit-reported')).toBeNull();
  });
});

describe('statement link', () => {
  it('replaces the Activity list with one Statement row and a note', async () => {
    renderScreen();
    await screen.findByTestId('credit-owed');
    expect(screen.queryByText('Activity')).toBeNull();
    expect(screen.queryByText(/No activity yet/)).toBeNull();
    expect(screen.getByText('Statement')).toBeTruthy();
    expect(screen.getByText('Every order and repayment, with what you owed after each.')).toBeTruthy();
    expect(screen.getByText('icon:chevron-forward')).toBeTruthy();
  });

  it('opens the statement for this agreement', async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId('credit-statement-row'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/credit/statement', params: { agreementId: '3' },
    });
  });

  it('is not offered on a request nobody has answered', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'REQUESTED', canFund: false, due: '0', latestRequest: { requestedLimit: '1', requestedPeriodDays: 7, status: 'REQUESTED' },
    }));
    renderScreen();
    await screen.findByText('You asked for');
    expect(screen.queryByTestId('credit-statement-row')).toBeNull();
  });
});

describe('negotiation states', () => {
  it('shows a pending request, no invoices or pay bar', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'REQUESTED', canFund: false, due: '0',
      latestRequest: { requestedLimit: '30000', requestedPeriodDays: 45, purpose: 'Stock', status: 'REQUESTED' },
    }));
    renderScreen();
    expect(await screen.findByText('You asked for')).toBeTruthy();
    expect(screen.queryByText('Invoices')).toBeNull();
    expect(screen.queryByTestId('credit-pay-bar-button')).toBeNull();
  });

  it('shows a rejection', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'REJECTED', canFund: false, latestRequest: { status: 'REJECTED', responseNote: 'Not now' },
    }));
    renderScreen();
    expect(await screen.findByText('They turned this down')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  it('accepts modified terms', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'APPROVED', canFund: false, due: '0', latestRequest: { status: 'MODIFIED', responseNote: null },
    }));
    acceptM.mockResolvedValue(agreement());
    renderScreen();
    fireEvent.press(await screen.findByText('Accept These Terms'));
    await waitFor(() => expect(acceptM).toHaveBeenCalledWith('tok', 3));
  });
});

describe('load states', () => {
  it('shows an error with retry', async () => {
    agreementM.mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    expect(await screen.findByText("Couldn't load this credit line.")).toBeTruthy();
    fireEvent.press(screen.getByText('Try Again'));
    await waitFor(() => expect(agreementM).toHaveBeenCalledTimes(2));
  });

  it('shows a skeleton while loading', () => {
    agreementM.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    expect(screen.queryByTestId('credit-owed')).toBeNull();
  });
});
