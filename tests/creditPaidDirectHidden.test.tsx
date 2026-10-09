import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditAgreementScreen from '@/app/restaurant/credit/[id]';
import CreditInvoiceScreen from '@/app/restaurant/credit/invoice/[id]';
import { CreditStickyPayBar } from '@/components/credit/CreditStickyPayBar';
import { fetchAgreement, fetchCreditSummary, fetchInvoices } from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
let mockPath = '/restaurant/credit/3';
let mockParams: Record<string, string> = { id: '3' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => mockPath,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, restaurantId: 1 } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
const mockSheet = jest.fn();
jest.mock('@/components/credit/PayFromWalletSheet', () => ({
  PayFromWalletSheet: (props: Record<string, unknown>) => { mockSheet(props); return null; },
}));
let mockInvoice: { data?: unknown; isPending: boolean; error: unknown } = { isPending: false, error: null };
let mockWalletRepay = true;
let mockOnlinePay = false;
jest.mock('@/hooks/useCreditInvoice', () => ({
  useCreditInvoice: () => ({ ...mockInvoice, isFetching: false, isRefetching: false, refresh: jest.fn() }),
  useWalletRepayEnabled: () => mockWalletRepay,
}));
jest.mock('@/hooks/useOnlinePayOn', () => ({ useOnlinePayOn: () => mockOnlinePay }));
jest.mock('@/hooks/useWithdrawClaim', () => ({ useWithdrawClaim: () => ({ withdraw: jest.fn(), pending: false }) }));
jest.mock('@/services/credit', () => ({
  acceptAgreement: jest.fn(), fetchAgreement: jest.fn(), fetchCreditSummary: jest.fn(), fetchInvoices: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

const agreement = {
  id: 3, status: 'ACTIVE', supplierName: 'Acme Foods', storeName: 'Acme Main',
  approvedLimit: '50000', reserved: '0', utilized: '9200', available: '40800',
  due: '9200', overdue: '0', creditPeriodDays: 30, gracePeriodDays: 5, canFund: true, latestRequest: null,
};
const invoice = {
  id: 55, invoiceNumber: 'INV-55', agreementId: 3, supplierOrderId: 900, status: 'OVERDUE',
  amount: '1000.0000', paidAmount: '0.0000', outstanding: '1000.0000',
  dueDate: '2026-09-01', overdueAfter: '2026-09-05', issuedAt: '2026-08-01', settledAt: null,
  dueState: 'OVERDUE', daysToDue: -30, orderNumber: 'ORD-9', supplierName: 'Acme Foods', storeName: 'S',
  payments: [] as unknown[],
};

function mountDetail() {
  mockPath = '/restaurant/credit/3';
  mockParams = { id: '3' };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><CreditAgreementScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}
function mountInvoice() {
  mockPath = '/restaurant/credit/invoice/55';
  mockParams = { id: '55' };
  mockInvoice = { data: invoice, isPending: false, error: null };
  return render(<SafeAreaProvider initialMetrics={metrics}><CreditInvoiceScreen /></SafeAreaProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWalletRepay = true;
  mockOnlinePay = false;
  (fetchAgreement as jest.Mock).mockResolvedValue(agreement);
  (fetchInvoices as jest.Mock).mockResolvedValue([]);
});

describe('agreement screen', () => {
  it('online on: no Paid direct, Pay opens the pay picker for this supplier', async () => {
    (fetchCreditSummary as jest.Mock).mockResolvedValue({ walletRepayEnabled: false, onlinePayEnabled: true });
    mountDetail();
    const pay = await screen.findByTestId('credit-pay-bar-button');
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
    fireEvent.press(pay);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/credit/pay', params: { agreementId: '3' } });
  });

  it('online on and wallet on: still no Paid direct, and the wallet sheet is not what Pay opens', async () => {
    (fetchCreditSummary as jest.Mock).mockResolvedValue({ walletRepayEnabled: true, onlinePayEnabled: true });
    mountDetail();
    fireEvent.press(await screen.findByTestId('credit-pay-bar-button'));
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/credit/pay', params: { agreementId: '3' } });
    expect(mockSheet.mock.calls.every(([p]) => p.visible === false)).toBe(true);
  });

  it.each([
    ['false', { walletRepayEnabled: true, onlinePayEnabled: false }],
    ['absent (older server)', { walletRepayEnabled: true }],
  ])('online %s: today\'s behaviour, both buttons and the wallet sheet', async (_n, summary) => {
    (fetchCreditSummary as jest.Mock).mockResolvedValue(summary);
    mountDetail();
    const pay = await screen.findByTestId('credit-pay-bar-button');
    expect(screen.getByTestId('credit-i-paid-bar-button')).toBeTruthy();
    fireEvent.press(pay);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSheet.mock.calls.some(([p]) => p.visible === true)).toBe(true);
  });
});

describe('invoice screen', () => {
  it('online on: no Paid direct, Pay opens the picker with this invoice', () => {
    mockOnlinePay = true;
    mockWalletRepay = false;
    mountInvoice();
    expect(screen.queryByTestId('invoice-i-paid')).toBeNull();
    fireEvent.press(screen.getByTestId('invoice-pay'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/credit/pay', params: { invoiceIds: '55' } });
  });

  it('online off: Paid direct and the wallet Pay as today', () => {
    mountInvoice();
    expect(screen.getByTestId('invoice-i-paid')).toBeTruthy();
    fireEvent.press(screen.getByTestId('invoice-pay'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('sticky pay bar', () => {
  it('shows Paid direct only while a claim handler is given', () => {
    const { rerender } = render(<SafeAreaProvider initialMetrics={metrics}><CreditStickyPayBar due="100" onPress={jest.fn()} onClaim={jest.fn()} /></SafeAreaProvider>);
    expect(screen.getByTestId('credit-i-paid-bar-button')).toBeTruthy();
    rerender(<SafeAreaProvider initialMetrics={metrics}><CreditStickyPayBar due="100" onPress={jest.fn()} /></SafeAreaProvider>);
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
    expect(screen.getByTestId('credit-pay-bar-button')).toBeTruthy();
  });

  it('online: never shows Paid direct even if a claim handler is passed', () => {
    render(<SafeAreaProvider initialMetrics={metrics}><CreditStickyPayBar due="100" online onPress={jest.fn()} onClaim={jest.fn()} /></SafeAreaProvider>);
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
  });
});
