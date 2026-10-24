import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierInvoiceScreen from '@/app/supplier/credit/invoice/[id]';
import { resetAttemptKeys } from '@/lib/credit/attemptKeys';
import { fetchCreditInvoice, issueCreditNote, writeOffInvoice } from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/supplier/credit/invoice/11',
  useLocalSearchParams: () => ({ id: '11' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/lib/server-clock', () => ({ serverNow: () => Date.parse('2026-10-06T06:00:00Z') }));
let mockGranted: string[] = ['CREDIT_COLLECT'];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForStore: (p: string) => mockGranted.includes(p) }),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchCreditInvoice: jest.fn(),
  issueCreditNote: jest.fn(),
  writeOffInvoice: jest.fn(),
}));

const invoiceM = fetchCreditInvoice as jest.Mock;
const issueM = issueCreditNote as jest.Mock;
const writeOffM = writeOffInvoice as jest.Mock;

const note = (id: number, over: Record<string, unknown> = {}) => ({
  id, creditNoteNumber: `CN-261006-00000${id}`, invoiceId: 11, invoiceNumber: 'INV-11', agreementId: 3,
  amount: '2100.0000', reasonCode: 'QUALITY', kind: 'MANUAL', note: null, disputeId: null, createdBy: 9,
  createdAt: '2026-10-06T10:00:00Z', ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  id: 11, invoiceNumber: 'INV-11', agreementId: 3, supplierOrderId: 90, status: 'PARTIALLY_PAID',
  amount: '9000.0000', paidAmount: '2500.0000', creditedAmount: '0.0000', outstanding: '6500.0000',
  dueDate: '2026-10-10', overdueAfter: '2026-10-13', issuedAt: '2026-09-10T00:00:00Z', settledAt: null,
  dueState: 'DUE_SOON', daysToDue: 4, orderNumber: 'ORD-90', supplierName: 'Fresh Farms', storeName: 'Main',
  payments: [], claims: [], extensions: [], creditNotes: [], ...over,
});
const fullyCredited = () => detail({
  status: 'PAID', dueState: 'PAID', daysToDue: null, paidAmount: '0.0000', creditedAmount: '9000.0000',
  outstanding: '0.0000', settledAt: '2026-10-06T10:00:00Z', creditNotes: [note(1, { amount: '9000.0000' })],
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockGranted = ['CREDIT_COLLECT']; resetAttemptKeys(); });
beforeEach(() => {
  jest.clearAllMocks();
  invoiceM.mockResolvedValue(detail());
  issueM.mockResolvedValue({
    ...note(1), invoice: { status: 'PARTIALLY_PAID', amount: '9000.0000', paidAmount: '2500.0000', creditedAmount: '2100.0000', outstanding: '4400.0000' },
    agreement: { due: '4400.0000', overdue: '0.0000', available: '1.0000', status: 'ACTIVE' },
  });
  writeOffM.mockResolvedValue({
    writtenOff: '6500.0000', items: [], lineStatus: 'SUSPENDED', lineSuspended: true,
    agreement: { due: '0.0000', overdue: '0.0000', available: '1.0000', status: 'SUSPENDED' },
  });
});
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><SupplierInvoiceScreen /></QueryClientProvider>);
}
const ready = () => screen.findByTestId('invoice-outstanding');
const press = (id: string) => fireEvent.press(screen.getByTestId(id));

describe('supplier invoice: money rows with a credit note', () => {
  it('reads Invoice amount, Paid, Credit note, Still owed when something was credited', async () => {
    invoiceM.mockResolvedValue(detail({ creditedAmount: '2100.0000', outstanding: '4400.0000' }));
    renderScreen();
    await ready();
    expect(screen.getByTestId('invoice-amount')).toHaveTextContent(/₹9,000\.00/);
    expect(screen.getByTestId('invoice-paid')).toHaveTextContent(/₹2,500\.00/);
    expect(screen.getByTestId('invoice-credited')).toHaveTextContent(/Credit note/);
    expect(screen.getByTestId('invoice-credited')).toHaveTextContent(/−₹2,100\.00/);
    expect(screen.getByTestId('invoice-outstanding')).toHaveTextContent(/₹4,400\.00/);
  });

  it('has no Credit note row when nothing was credited', async () => {
    renderScreen();
    await ready();
    expect(screen.queryByTestId('invoice-credited')).toBeNull();
  });

  it('a fully credited invoice reads "Settled by credit note", not Paid', async () => {
    invoiceM.mockResolvedValue(fullyCredited());
    renderScreen();
    await ready();
    expect(screen.getByTestId('invoice-chip')).toHaveTextContent(/Settled by credit note/);
    expect(screen.getByTestId('invoice-status')).toHaveTextContent(/Status: Settled by credit note/);
    expect(screen.queryByText('Status: Paid')).toBeNull();
    expect(screen.getByTestId('invoice-credited')).toHaveTextContent(/−₹9,000\.00/);
  });
});

describe('supplier invoice: credit notes list', () => {
  it('is folded, counts the notes, and opens to numbers, plain reasons and dates', async () => {
    invoiceM.mockResolvedValue(detail({
      creditedAmount: '4200.0000',
      creditNotes: [note(1), note(2, { kind: 'SYSTEM_CANCEL', reasonCode: 'CANCELLED', createdBy: null })],
    }));
    renderScreen();
    await ready();
    expect(screen.getByTestId('credit-notes-toggle')).toHaveTextContent(/Credit notes \(2\)/);
    expect(screen.queryByText('CN-261006-000001')).toBeNull();
    press('credit-notes-toggle');
    expect(screen.getByText('CN-261006-000001')).toBeTruthy();
    expect(screen.getByText('Quality problem')).toBeTruthy();
    expect(screen.getByText('Order cancelled: credit note issued automatically')).toBeTruthy();
  });

  it('is absent when there are none', async () => {
    renderScreen();
    await ready();
    expect(screen.queryByTestId('credit-notes-toggle')).toBeNull();
  });
});

describe('supplier invoice: Issue credit note action', () => {
  it('shows for CREDIT_COLLECT on an open invoice', async () => {
    renderScreen();
    await ready();
    expect(screen.getByTestId('invoice-credit-note')).toBeTruthy();
  });

  it('shows for CREDIT_MODIFY too', async () => {
    mockGranted = ['CREDIT_MODIFY'];
    renderScreen();
    await ready();
    expect(screen.getByTestId('invoice-credit-note')).toBeTruthy();
  });

  it('is hidden without either permission', async () => {
    mockGranted = ['CREDIT_VIEW'];
    renderScreen();
    await ready();
    expect(screen.queryByTestId('invoice-credit-note')).toBeNull();
  });

  it.each(['PAID', 'WRITTEN_OFF'])('is hidden on a %s invoice', async (status) => {
    invoiceM.mockResolvedValue(detail({ status, dueState: status, outstanding: '0.0000' }));
    renderScreen();
    await ready();
    expect(screen.queryByTestId('invoice-credit-note')).toBeNull();
  });

  it('opens the sheet with the server outstanding and sends one note', async () => {
    renderScreen();
    await ready();
    press('invoice-credit-note');
    expect(await screen.findByTestId('cn-sheet')).toBeTruthy();
    expect(screen.getByTestId('cn-amount').props.value).toBe('6500');
    press('cn-reason-QUALITY');
    await act(async () => { press('cn-submit'); });
    expect(issueM).toHaveBeenCalledWith('tok', 11, { amount: '6500.00', reasonCode: 'QUALITY' }, expect.any(String));
    await waitFor(() => expect(invoiceM.mock.calls.length).toBeGreaterThan(1));
  });
});

describe('supplier invoice: Write off action', () => {
  it('is hidden for people without CREDIT_WRITE_OFF, even with collect and modify', async () => {
    mockGranted = ['CREDIT_COLLECT', 'CREDIT_MODIFY'];
    renderScreen();
    await ready();
    expect(screen.queryByTestId('invoice-write-off')).toBeNull();
  });

  it('shows for CREDIT_WRITE_OFF alone on an open invoice, and opens its sheet', async () => {
    mockGranted = ['CREDIT_WRITE_OFF'];
    renderScreen();
    await ready();
    press('invoice-write-off');
    expect(await screen.findByTestId('wo-sheet')).toBeTruthy();
    expect(screen.getByTestId('wo-amount').props.value).toBe('6500');
  });

  it.each(['PAID', 'WRITTEN_OFF'])('is hidden on a %s invoice', async (status) => {
    mockGranted = ['CREDIT_WRITE_OFF'];
    invoiceM.mockResolvedValue(detail({ status, dueState: status, outstanding: '0.0000' }));
    renderScreen();
    await ready();
    expect(screen.queryByTestId('invoice-write-off')).toBeNull();
  });
});
