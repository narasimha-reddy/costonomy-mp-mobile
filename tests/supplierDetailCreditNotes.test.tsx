import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierCreditAgreementScreen from '@/app/supplier/credit/[id]';
import { resetAttemptKeys } from '@/lib/credit/attemptKeys';
import {
  fetchAgreement, fetchAgreementClaims, fetchAgreementPayments, fetchCreditNotes, fetchInvoices, writeOffLine,
} from '@/services/credit';

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
  usePathname: () => '/supplier/credit/3',
  useLocalSearchParams: () => ({ id: '3' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
let mockGranted: string[] = ['CREDIT_MODIFY'];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForStore: (p: string) => mockGranted.includes(p) }),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchAgreement: jest.fn(),
  fetchInvoices: jest.fn(),
  fetchAgreementClaims: jest.fn(),
  fetchAgreementPayments: jest.fn(),
  fetchCreditNotes: jest.fn(),
  writeOffLine: jest.fn(),
}));

const agreementM = fetchAgreement as jest.Mock;
const notesM = fetchCreditNotes as jest.Mock;
const lineM = writeOffLine as jest.Mock;

const agreement = (over: Record<string, unknown> = {}) => ({
  id: 3, outletId: 7, outletName: 'Indiranagar', restaurantName: 'Spice Co', outletLocality: 'Indiranagar',
  status: 'ACTIVE', approvedLimit: '50000.0000', reserved: '0.0000', utilized: '12000.0000', available: '38000.0000',
  due: '12000.0000', overdue: '0.0000', creditPeriodDays: 30, gracePeriodDays: 3, termsVersion: 2, latestRequest: null, ...over,
});
const cn = (id: number, over: Record<string, unknown> = {}) => ({
  id, creditNoteNumber: `CN-261006-00000${id}`, invoiceId: 11, invoiceNumber: 'INV-11', agreementId: 3,
  amount: '2100.0000', reasonCode: 'PRICE', kind: 'MANUAL', note: null, disputeId: null, createdBy: 9,
  createdAt: '2026-10-06T10:00:00Z', ...over,
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockGranted = ['CREDIT_MODIFY']; resetAttemptKeys(); });
beforeEach(() => {
  jest.clearAllMocks();
  agreementM.mockResolvedValue(agreement());
  (fetchInvoices as jest.Mock).mockResolvedValue([]);
  (fetchAgreementClaims as jest.Mock).mockResolvedValue([]);
  (fetchAgreementPayments as jest.Mock).mockResolvedValue({ items: [], page: 0, size: 20, total: 0, hasNext: false });
  notesM.mockResolvedValue({ items: [cn(1), cn(2, { kind: 'WRITE_OFF', reasonCode: 'OTHER', note: 'Closed down' })], page: 0, size: 20, total: 2, hasNext: false });
  lineM.mockResolvedValue({
    writtenOff: '12000.0000', items: [], lineStatus: 'SUSPENDED', lineSuspended: true,
    agreement: { due: '0.0000', overdue: '0.0000', available: '1.0000', status: 'SUSPENDED' },
  });
});
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><SupplierCreditAgreementScreen /></QueryClientProvider>);
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));

describe('supplier restaurant detail: write off everything owed', () => {
  it('is not in the More menu for people without CREDIT_WRITE_OFF', async () => {
    mockGranted = ['CREDIT_MODIFY', 'CREDIT_COLLECT'];
    renderScreen();
    await screen.findByTestId('line-actions');
    press('action-more');
    expect(screen.queryByTestId('more-write-off')).toBeNull();
  });

  it('is in More for CREDIT_WRITE_OFF, opens the sheet with the line due and writes off the line', async () => {
    mockGranted = ['CREDIT_WRITE_OFF'];
    renderScreen();
    await screen.findByTestId('line-actions');
    press('action-more');
    press('more-write-off');
    expect(await screen.findByTestId('wo-sheet')).toBeTruthy();
    expect(screen.getByText('Write off everything owed')).toBeTruthy();
    expect(screen.getByTestId('wo-amount').props.value).toBe('12000');
  });

  it('is not offered when the line owes nothing', async () => {
    mockGranted = ['CREDIT_WRITE_OFF'];
    agreementM.mockResolvedValue(agreement({ due: '0.0000', utilized: '0.0000' }));
    renderScreen();
    await screen.findByTestId('line-actions');
    expect(screen.queryByTestId('action-more')).toBeNull();
  });
});

describe('supplier restaurant detail: credit notes', () => {
  it('is a collapsed section that loads the line\'s notes when opened', async () => {
    renderScreen();
    await screen.findByTestId('credit-notes-toggle');
    expect(notesM).not.toHaveBeenCalled();
    press('credit-notes-toggle');
    expect(await screen.findByText('CN-261006-000001')).toBeTruthy();
    expect(screen.getByText('Price difference')).toBeTruthy();
    expect(screen.getByText('Written off')).toBeTruthy();
    expect(notesM).toHaveBeenCalledWith('tok', 3, expect.objectContaining({ page: 0 }));
  });

  it('says so when there are none', async () => {
    notesM.mockResolvedValue({ items: [], page: 0, size: 20, total: 0, hasNext: false });
    renderScreen();
    await screen.findByTestId('credit-notes-toggle');
    press('credit-notes-toggle');
    expect(await screen.findByText('No credit notes yet.')).toBeTruthy();
  });

  it('offers a retry when loading fails', async () => {
    notesM.mockRejectedValue(new Error('x'));
    renderScreen();
    await screen.findByTestId('credit-notes-toggle');
    press('credit-notes-toggle');
    expect(await screen.findByText("Couldn't load the credit notes.")).toBeTruthy();
  });
});
