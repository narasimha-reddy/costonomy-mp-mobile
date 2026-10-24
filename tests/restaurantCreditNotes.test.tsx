import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditInvoiceScreen from '@/app/restaurant/credit/invoice/[id]';
import { CreditInvoiceRow } from '@/components/credit/CreditInvoiceRow';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: '55' }),
  usePathname: () => '/restaurant/credit/invoice/55',
}));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, restaurantId: 1 } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
let mockInvoice: { data?: unknown; isPending: boolean; error: unknown } = { isPending: false, error: null };
jest.mock('@/hooks/useCreditInvoice', () => ({
  useCreditInvoice: () => ({ ...mockInvoice, isFetching: false, isRefetching: false, refresh: jest.fn() }),
  useWalletRepayEnabled: () => true,
}));
jest.mock('@/components/credit/PayFromWalletSheet', () => ({ PayFromWalletSheet: () => null }));
jest.mock('@/hooks/useWithdrawClaim', () => ({ useWithdrawClaim: () => ({ withdraw: jest.fn(), pending: false }) }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mount = () => render(<SafeAreaProvider initialMetrics={metrics}><CreditInvoiceScreen /></SafeAreaProvider>);
const note = (id: number, over: Record<string, unknown> = {}) => ({
  id, creditNoteNumber: `CN-261006-00000${id}`, invoiceId: 55, invoiceNumber: 'INV-55', agreementId: 3,
  amount: '300.0000', reasonCode: 'SHORT_SUPPLY', kind: 'MANUAL', note: null, disputeId: null, createdBy: 9,
  createdAt: '2026-10-06T10:00:00Z', ...over,
});
const base = {
  id: 55, invoiceNumber: 'INV-55', agreementId: 3, supplierOrderId: 900, status: 'PARTIALLY_PAID',
  amount: '1000.0000', paidAmount: '200.0000', creditedAmount: '0.0000', outstanding: '800.0000',
  dueDate: '2026-10-20', overdueAfter: '2026-10-25', issuedAt: '2026-10-01', settledAt: null,
  dueState: 'DUE_LATER', daysToDue: 14, orderNumber: 'ORD-9', supplierName: 'Acme Foods', storeName: 'S',
  payments: [] as unknown[], creditNotes: [] as unknown[],
};
const show = (over: Record<string, unknown> = {}) => {
  mockInvoice = { data: { ...base, ...over }, isPending: false, error: null };
  return mount();
};
afterEach(cleanup);

describe('restaurant invoice with a credit note', () => {
  it('reads Invoice amount, Paid, Credit note, Still owed', () => {
    show({ creditedAmount: '300.0000', outstanding: '500.0000', creditNotes: [note(1)] });
    expect(screen.getByTestId('invoice-amount')).toHaveTextContent(/₹1,000\.00/);
    expect(screen.getByTestId('invoice-paid')).toHaveTextContent(/₹200\.00/);
    expect(screen.getByTestId('invoice-credited')).toHaveTextContent(/Credit note/);
    expect(screen.getByTestId('invoice-credited')).toHaveTextContent(/−₹300\.00/);
    expect(screen.getByTestId('invoice-outstanding')).toHaveTextContent(/₹500\.00/);
  });

  it('has no Credit note row without one', () => {
    show();
    expect(screen.queryByTestId('invoice-credited')).toBeNull();
  });

  it('says "Settled by credit note" when fully credited with nothing paid', () => {
    show({
      status: 'PAID', dueState: 'PAID', daysToDue: null, paidAmount: '0.0000', creditedAmount: '1000.0000',
      outstanding: '0.0000', settledAt: '2026-10-06T10:00:00Z', creditNotes: [note(1, { amount: '1000.0000' })],
    });
    expect(screen.getByTestId('invoice-chip')).toHaveTextContent(/Settled by credit note/);
    expect(screen.getByTestId('invoice-status')).toHaveTextContent(/Status: Settled by credit note/);
    expect(screen.queryByText('Status: Paid')).toBeNull();
    expect(screen.queryByText('Pay ₹0.00')).toBeNull();
  });

  it('keeps "Paid" when it was paid in money', () => {
    show({ status: 'PAID', dueState: 'PAID', daysToDue: null, paidAmount: '1000.0000', outstanding: '0.0000' });
    expect(screen.getByTestId('invoice-chip')).toHaveTextContent(/Paid$/);
    expect(screen.getByTestId('invoice-status')).toHaveTextContent(/Status: Paid/);
  });

  it('lists its credit notes with number, reason in plain words and date', () => {
    show({ creditedAmount: '300.0000', creditNotes: [note(1)] });
    fireEvent.press(screen.getByTestId('credit-notes-toggle'));
    expect(screen.getByText('CN-261006-000001')).toBeTruthy();
    expect(screen.getByText('Short supply')).toBeTruthy();
    expect(screen.getByText(/6th Oct/)).toBeTruthy();
  });

  it('words an automatic cancel note as issued automatically', () => {
    show({
      creditedAmount: '800.0000', creditNotes: [note(2, { kind: 'SYSTEM_CANCEL', reasonCode: 'CANCELLED', createdBy: null })],
    });
    fireEvent.press(screen.getByTestId('credit-notes-toggle'));
    expect(screen.getByText('Order cancelled: credit note issued automatically')).toBeTruthy();
  });

  it('shows no credit notes section when there are none, and survives an older server without the field', () => {
    show({ creditNotes: undefined, creditedAmount: undefined });
    expect(screen.queryByTestId('credit-notes-toggle')).toBeNull();
    expect(screen.queryByTestId('invoice-credited')).toBeNull();
  });
});

describe('invoice row in lists', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 55, invoiceNumber: 'INV-55', creditAgreementId: 3, supplierOrderId: 9, status: 'PARTIALLY_PAID',
    amount: '1000.0000', paidAmount: '200.0000', creditedAmount: '0.0000', outstanding: '800.0000',
    dueDate: '2026-10-20', overdueAfter: null, issuedAt: null, settledAt: null, dueState: 'DUE_LATER', daysToDue: 14, ...over,
  } as never);

  it('adds a Credit note line when credited', () => {
    render(<CreditInvoiceRow invoice={row({ creditedAmount: '300.0000', outstanding: '500.0000' })} onPress={jest.fn()} />);
    expect(screen.getByText('Credit note −₹300.00')).toBeTruthy();
    expect(screen.getByTestId('credit-invoice-55').props.accessibilityLabel).toMatch(/Credit note −₹300\.00/);
  });

  it('has none when nothing was credited', () => {
    render(<CreditInvoiceRow invoice={row()} />);
    expect(screen.queryByText(/Credit note/)).toBeNull();
  });

  it('shows the settled-by-credit-note chip for a fully credited invoice', () => {
    render(<CreditInvoiceRow invoice={row({
      status: 'PAID', dueState: 'PAID', paidAmount: '0.0000', creditedAmount: '1000.0000', outstanding: '0.0000', daysToDue: null,
    })} />);
    expect(screen.getByTestId('credit-invoice-chip-55')).toHaveTextContent(/Settled by credit note/);
  });
});
