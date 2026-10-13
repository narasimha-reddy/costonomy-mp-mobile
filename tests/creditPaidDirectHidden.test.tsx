import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditOverviewScreen from '@/app/restaurant/credit/index';
import CreditAgreementScreen from '@/app/restaurant/credit/[id]';
import CreditInvoiceScreen from '@/app/restaurant/credit/invoice/[id]';
import { fetchAgreement, fetchCreditSummary, fetchInvoices } from '@/services/credit';

/**
 * When the server says online payment is on, a restaurant pays through Mandi and
 * the manual "Paid direct" claim buttons are gone (the server still accepts old
 * apps' claims). When it is off or unknown, every screen is exactly as before.
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
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/restaurant/credit',
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar', restaurantId: 1 } }),
}));
let mockMayRepay = true;
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForOutlet: () => mockMayRepay }),
}));
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
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn().mockResolvedValue({ balance: '5000.0000' }) }));
const mockSheetProps = jest.fn();
jest.mock('@/components/credit/PayFromWalletSheet', () => ({
  PayFromWalletSheet: (p: Record<string, unknown>) => { mockSheetProps(p); return null; },
}));
let mockInvoice: { data?: unknown; isPending: boolean; error: unknown } = { isPending: false, error: null };
jest.mock('@/hooks/useCreditInvoice', () => ({
  ...jest.requireActual('@/hooks/useCreditInvoice'),
  useCreditInvoice: () => ({ ...mockInvoice, isFetching: false, isRefetching: false, refresh: jest.fn() }),
}));
jest.mock('@/hooks/useWithdrawClaim', () => ({
  useWithdrawClaim: () => ({ withdraw: jest.fn(), pending: false }),
}));

const summaryM = fetchCreditSummary as jest.Mock;
const agreementM = fetchAgreement as jest.Mock;
const invoicesM = fetchInvoices as jest.Mock;

const agreementRow = (o: Record<string, unknown>) => ({
  id: 1, supplierName: 'Acme', storeName: null, status: 'ACTIVE', approvedLimit: '50000', reserved: '0',
  utilized: '0', available: '30000', due: '0', overdue: '0', nextDueDate: null, nextDueAmount: null,
  suspensionReason: null, canFund: true, latestRequest: null, ...o,
});
const summary = (o: Record<string, unknown> = {}) => ({
  outletId: 7, approvedLimit: '50000', reserved: '0', utilized: '20000', available: '30000',
  due: '1700', overdue: '500', walletRepayEnabled: true, reportableAmount: 1700,
  agreements: [
    agreementRow({ id: 1, supplierName: 'Zed Foods', due: '600', nextDueDate: '2026-09-24', nextDueAmount: '600' }),
    agreementRow({ id: 2, supplierName: 'Acme', due: '1100', overdue: '500', nextDueDate: '2026-10-30', nextDueAmount: '1100' }),
  ],
  ...o,
});
const agreement = {
  id: 3, status: 'ACTIVE', supplierName: 'Acme Foods', storeName: 'Acme Main',
  approvedLimit: '50000', reserved: '0', utilized: '9200', available: '40800',
  due: '9200', overdue: '0', creditPeriodDays: 30, gracePeriodDays: 5, reportableAmount: 9200,
  maxSingleOrderCredit: null, termsVersion: null, suspensionReason: null, canFund: true, latestRequest: null,
};
const invoice = {
  id: 55, invoiceNumber: 'INV-55', agreementId: 3, supplierOrderId: 900, status: 'OVERDUE',
  amount: '1000.0000', paidAmount: '0.0000', outstanding: '1000.0000', reportableAmount: 1000,
  dueDate: '2026-09-01', overdueAfter: '2026-09-05', issuedAt: '2026-08-01', settledAt: null,
  dueState: 'OVERDUE', daysToDue: -30, orderNumber: 'ORD-9', supplierName: 'Acme Foods', storeName: 'S',
  payments: [] as unknown[],
};

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
function mount(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const pushed = () => mockPush.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockMayRepay = true;
  mockInvoice = { data: invoice, isPending: false, error: null };
  agreementM.mockResolvedValue(agreement);
  invoicesM.mockResolvedValue([]);
});

describe('overview', () => {
  it('online pay on: no Paid direct, no wallet Pay; "Pay dues" opens the picker', async () => {
    summaryM.mockResolvedValue(summary({ onlinePayEnabled: true }));
    mount(<CreditOverviewScreen />);
    const payDues = await screen.findByTestId('pay-dues');
    expect(screen.queryByTestId('i-paid')).toBeNull();
    expect(screen.queryByTestId('pay-from-wallet')).toBeNull();
    expect(screen.getByText('Pay dues')).toBeTruthy();

    fireEvent.press(payDues);
    expect(pushed()).toContain('/restaurant/credit/pay');
    expect(pushed()).not.toContainEqual(expect.objectContaining({ pathname: '/restaurant/credit/claim' }));
    expect(mockSheetProps).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
    expect(screen.queryByText('Pay overdue to')).toBeNull();
  });

  it('online pay on does not need the wallet-repay flag', async () => {
    summaryM.mockResolvedValue(summary({ onlinePayEnabled: true, walletRepayEnabled: false }));
    mount(<CreditOverviewScreen />);
    expect(await screen.findByTestId('pay-dues')).toBeTruthy();
    expect(screen.queryByTestId('i-paid')).toBeNull();
  });

  it('online pay on: no "Pay dues" and no Paid direct for someone who may not repay', async () => {
    mockMayRepay = false;
    summaryM.mockResolvedValue(summary({ onlinePayEnabled: true }));
    mount(<CreditOverviewScreen />);
    await screen.findByTestId('get-credit');
    expect(screen.queryByTestId('pay-dues')).toBeNull();
    expect(screen.queryByTestId('i-paid')).toBeNull();
  });

  it('online pay on: no "Pay dues" when nothing is owed', async () => {
    summaryM.mockResolvedValue(summary({
      onlinePayEnabled: true, due: '0', overdue: '0',
      agreements: [agreementRow({ id: 1, supplierName: 'Quiet' })],
    }));
    mount(<CreditOverviewScreen />);
    await screen.findByTestId('get-credit');
    expect(screen.queryByTestId('pay-dues')).toBeNull();
  });

  it.each([
    ['false', { onlinePayEnabled: false }],
    ['absent (an older server)', {}],
    ['not exactly true', { onlinePayEnabled: 'true' }],
  ])('online pay %s: exactly today\'s buttons', async (_name, over) => {
    summaryM.mockResolvedValue(summary(over));
    mount(<CreditOverviewScreen />);
    await screen.findByTestId('i-paid');
    expect(screen.getByTestId('pay-from-wallet')).toBeTruthy();
    expect(screen.queryByTestId('pay-dues')).toBeNull();

    fireEvent.press(screen.getByTestId('pay-from-wallet'));
    expect(screen.getByText('Pay overdue to')).toBeTruthy();
  });
});

describe('supplier credit screen', () => {
  beforeEach(() => { mockParams = { id: '3' }; });

  it('online pay on: no Paid direct; Pay is there even without wallet repay and opens the picker for this supplier', async () => {
    summaryM.mockResolvedValue({ walletRepayEnabled: false, onlinePayEnabled: true });
    mount(<CreditAgreementScreen />);
    const pay = await screen.findByTestId('credit-pay-bar-button');
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();

    fireEvent.press(pay);
    expect(pushed()).toContain('/restaurant/credit/pay?scopeAgreementId=3');
    expect(mockSheetProps).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
  });

  it('online pay on and no right to repay: neither button', async () => {
    mockMayRepay = false;
    summaryM.mockResolvedValue({ walletRepayEnabled: true, onlinePayEnabled: true });
    mount(<CreditAgreementScreen />);
    await screen.findByTestId('credit-owed');
    await waitFor(() => expect(summaryM).toHaveBeenCalled());
    expect(screen.queryByTestId('credit-pay-bar-button')).toBeNull();
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
  });

  it.each([
    ['false', { walletRepayEnabled: true, onlinePayEnabled: false }],
    ['absent', { walletRepayEnabled: true }],
  ])('online pay %s: both buttons, and Pay still opens the wallet sheet', async (_name, flags) => {
    summaryM.mockResolvedValue(flags);
    mount(<CreditAgreementScreen />);
    fireEvent.press(await screen.findByTestId('credit-pay-bar-button'));
    expect(screen.getByTestId('credit-i-paid-bar-button')).toBeTruthy();
    expect(mockSheetProps).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true, agreementId: 3 }));
    expect(JSON.stringify(pushed())).not.toContain('/restaurant/credit/pay');
  });
});

describe('invoice screen', () => {
  beforeEach(() => { mockParams = { id: '55' }; });

  it('online pay on: no Paid direct; Pay opens the picker with this invoice ticked', async () => {
    summaryM.mockResolvedValue({ walletRepayEnabled: false, onlinePayEnabled: true });
    mount(<CreditInvoiceScreen />);
    const pay = await screen.findByTestId('invoice-pay');
    expect(screen.queryByTestId('invoice-i-paid')).toBeNull();
    expect(screen.queryByText('Paid direct')).toBeNull();

    fireEvent.press(pay);
    expect(pushed()).toContain('/restaurant/credit/pay?invoiceIds=55');
    expect(mockSheetProps).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));
  });

  it.each([
    ['false', { walletRepayEnabled: true, onlinePayEnabled: false }],
    ['absent', { walletRepayEnabled: true }],
  ])('online pay %s: both buttons, and Pay still opens the wallet sheet', async (_name, flags) => {
    summaryM.mockResolvedValue(flags);
    mount(<CreditInvoiceScreen />);
    fireEvent.press(await screen.findByTestId('invoice-pay'));
    expect(screen.getByTestId('invoice-i-paid')).toBeTruthy();
    expect(mockSheetProps).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
    expect(JSON.stringify(pushed())).not.toContain('/restaurant/credit/pay');
  });
});
