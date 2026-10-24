import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditInvoiceScreen from '@/app/restaurant/credit/invoice/[id]';
import { CreditClaimsSection } from '@/components/credit/CreditClaimsSection';
import { waitingClaimsTotal } from '@/lib/credit/claims';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: '55' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/restaurant/credit/invoice/55',
}));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outletId: 7, outlet: { id: 7, restaurantId: 1 } }),
}));
let mockMayRepay = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => mockMayRepay }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
let mockInvoice: { data?: unknown; isPending: boolean; error: unknown } = { isPending: false, error: null };
const mockUseInvoice = jest.fn();
jest.mock('@/hooks/useCreditInvoice', () => ({
  useCreditInvoice: (id: number) => {
    mockUseInvoice(id);
    return { ...mockInvoice, isFetching: false, isRefetching: false, refresh: jest.fn() };
  },
  useWalletRepayEnabled: () => true,
}));
jest.mock('@/hooks/useWithdrawClaim', () => ({
  useWithdrawClaim: () => ({ withdraw: jest.fn(), pending: false }),
}));
const mockSheet = jest.fn();
jest.mock('@/components/credit/PayFromWalletSheet', () => ({
  PayFromWalletSheet: (p: Record<string, unknown>) => { mockSheet(p); return null; },
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
const claim = (id: number, status: string, o: Record<string, unknown> = {}) => ({
  id, invoiceId: 55, invoiceNumber: 'INV-55', agreementId: 3, outletId: 7, outletName: null, restaurantName: null,
  amount: '400.0000', method: 'UPI', reference: 'U1', paidOn: '2026-09-02', note: null, status,
  decisionNote: null, confirmedAmount: null, creditPaymentId: null, createdAt: '2026-09-02T10:00:00Z',
  decidedAt: null, ...o,
});
function show(over: Record<string, unknown> = {}) {
  mockInvoice = { data: { ...base, ...over }, isPending: false, error: null };
  return mount();
}

afterEach(() => { cleanup(); mockMayRepay = true; mockParams = { id: '55' }; });
beforeEach(() => { jest.clearAllMocks(); });

describe('B12 / P04: CREDIT_REPAY on the invoice screen', () => {
  it('without it: no Pay, no I paid outside the app, no pay sheet', () => {
    mockMayRepay = false;
    show();
    expect(screen.queryByTestId('invoice-pay')).toBeNull();
    expect(screen.queryByTestId('invoice-i-paid')).toBeNull();
    expect(mockSheet).not.toHaveBeenCalled();
    // The invoice itself is still shown.
    expect(screen.getByTestId('invoice-outstanding')).toBeTruthy();
  });

  it('with it: both are offered', () => {
    show();
    expect(screen.getByTestId('invoice-pay')).toBeTruthy();
    expect(screen.getByTestId('invoice-i-paid')).toBeTruthy();
  });
});

describe('S38 / B10: a SUPERSEDED report', () => {
  const superseded = claim(7, 'SUPERSEDED', { decisionNote: 'The invoice was settled before it was confirmed.' });

  it('shows Not needed: invoice already settled, neutral, with no Withdraw and no Report again', () => {
    const styleOf = (status: string) => {
      const view = show({ claims: [claim(7, status, { decisionNote: 'x' })] });
      const style = JSON.stringify(screen.getByTestId('claim-status-7').props.style);
      view.unmount();
      return style;
    };
    const supersededStyle = styleOf('SUPERSEDED');
    // Neutral: styled exactly like a withdrawn report, not like a waiting (warning) one.
    expect(supersededStyle).toBe(styleOf('WITHDRAWN'));
    expect(supersededStyle).not.toBe(styleOf('SUBMITTED'));
    show({ claims: [superseded] });
    expect(screen.getByTestId('claim-status-7')).toHaveTextContent(/Not needed: invoice already settled/);
    expect(screen.queryByText(/Waiting for/)).toBeNull();
    expect(screen.queryByTestId('claim-withdraw-7')).toBeNull();
    expect(screen.queryByTestId('claim-again-7')).toBeNull();
  });

  it('is never counted as waiting', () => {
    expect(waitingClaimsTotal([
      { status: 'SUPERSEDED', amount: '400.0000' }, { status: 'SUBMITTED', amount: '100' },
    ])).toBe(100);
    show({ claims: [superseded] });
    expect(mockSheet).not.toHaveBeenCalledWith(expect.objectContaining({
      invoice: expect.objectContaining({ waitingAmount: 400 }),
    }));
  });

  it('sits beside a waiting report without changing its Withdraw', () => {
    show({ claims: [claim(8, 'SUBMITTED'), superseded] });
    expect(screen.getByTestId('claim-status-8')).toHaveTextContent(/Waiting for Acme Foods/);
    expect(screen.getByTestId('claim-withdraw-8')).toBeTruthy();
    expect(screen.queryByTestId('claim-withdraw-7')).toBeNull();
  });

  it('an unknown future status renders neutral instead of crashing', () => {
    render(
      <CreditClaimsSection
        claims={[claim(9, 'SOMETHING_NEW') as never]}
        supplierName="Acme" busy={false} offline={false}
        onWithdraw={async () => true} onReportAgain={() => {}}
      />,
    );
    expect(screen.getByTestId('claim-9')).toBeTruthy();
    expect(screen.queryByTestId('claim-withdraw-9')).toBeNull();
  });
});

describe('U14 / D09 / U12 on the invoice screen', () => {
  it('a bad id shows the not-found page and loads nothing real', () => {
    mockParams = { id: 'abc' };
    mockInvoice = { isPending: true, error: null };
    mount();
    expect(screen.getByTestId('invoice-not-found')).toBeTruthy();
    expect(mockUseInvoice).toHaveBeenCalledWith(Number.NaN);
  });

  it('D09: null supplier name, no order, null dates: still renders with fallbacks', () => {
    show({
      supplierName: null, orderNumber: null, supplierOrderId: null, dueDate: null, overdueAfter: null,
      issuedAt: null, dueState: undefined, daysToDue: undefined, reportableAmount: undefined,
    });
    expect(screen.getByTestId('invoice-outstanding')).toBeTruthy();
    expect(screen.queryByTestId('invoice-due')).toBeNull();
    expect(screen.queryByTestId('invoice-late-after')).toBeNull();
    expect(screen.getByTestId('invoice-i-paid')).toBeTruthy();
    fireEvent.press(screen.getByTestId('invoice-pay'));
  });

  it('U12: two quick presses on I paid push the claim form once', () => {
    show();
    const button = screen.getByTestId('invoice-i-paid');
    fireEvent.press(button);
    fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('U12: two quick presses on the order link push once', () => {
    show();
    const link = screen.getByTestId('invoice-order-link');
    fireEvent.press(link);
    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('D07: a long supplier name is a one-line header', () => {
    show({ supplierName: `🍅 ${'Long Supplier '.repeat(10)}` });
    expect(screen.getByText(/🍅 Long Supplier/).props.numberOfLines).toBe(1);
  });
});
