import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierStatementScreen from '@/app/supplier/credit/statement';
import { CreditStatementRow } from '@/components/credit/CreditStatementRow';
import { CsvExportError, exportStatementCsv } from '@/services/creditExport';
import { apiRequest } from '@/lib/api/client';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string> = { agreementId: '3' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), setParams: mockSetParams, navigate: mockNavigate }),
  usePathname: () => '/supplier/credit/statement',
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1 }, stores: [], select: jest.fn() }),
}));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
jest.mock('@/lib/api/client', () => ({ apiRequest: jest.fn() }));
jest.mock('@/services/creditExport', () => ({
  ...jest.requireActual('@/services/creditExport'),
  exportStatementCsv: jest.fn(),
}));
const exportM = exportStatementCsv as jest.Mock;

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const api = apiRequest as jest.Mock;

const row = (over: Record<string, unknown>) => ({
  at: '2026-10-05T10:00:00Z', type: 'UTILIZE', label: 'Order on credit', amount: '1200.0000',
  owedAfter: '1200.0000', supplierOrderId: null, orderNumber: null, creditInvoiceId: null,
  invoiceNumber: null, source: null, method: null, reference: null, walletEntryId: null, ...over,
});
const STATEMENT = {
  agreementId: 3, from: '2026-07-05', to: '2026-10-03', openingOwed: '300.0000', closingOwed: '900.0000',
  lines: [
    row({ at: '2026-10-05T01:00:00Z', label: 'Paid from wallet', type: 'REPAYMENT', amount: '-500.0000',
      owedAfter: '900.0000', source: 'WALLET', walletEntryId: 192, invoiceNumber: 'INV-9' }),
    row({ at: '2026-10-03T18:00:00Z', label: 'Order #55', amount: '1200.0000', owedAfter: '1400.0000',
      supplierOrderId: 55, invoiceNumber: 'INV-9' }),
    row({ at: '2026-10-02T10:00:00Z', label: 'Adjustment', type: 'ADJUSTMENT', amount: '200.0000', owedAfter: '200.0000' }),
  ],
};
function respond(statement: unknown) {
  api.mockImplementation((path: string) => {
    if (path.includes('/statement')) {
      return statement instanceof Error ? Promise.reject(statement) : Promise.resolve(statement);
    }
    return Promise.resolve({ id: 3, restaurantName: 'Spice Co', outletName: 'Indiranagar' });
  });
}

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockOffline = false; });
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}><SupplierStatementScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}
beforeEach(() => { jest.clearAllMocks(); mockParams = { agreementId: '3' }; respond(STATEMENT); });


const reversed = row({
  at: '2026-10-04T10:00:00Z', type: 'PAYMENT_REVERSED', label: 'Payment reversed', amount: '1500.0000',
  owedAfter: '2400.0000', creditInvoiceId: 4, invoiceNumber: 'INV-4',
});

describe('Statement: reversed payments', () => {
  it('shows a PAYMENT_REVERSED line on the supplier statement, labelled and with a positive amount', async () => {
    respond({ ...STATEMENT, lines: [reversed, ...STATEMENT.lines] });
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(screen.getByText('Payment reversed')).toBeTruthy();
    expect(screen.getByText('+₹1,500.00')).toBeTruthy();
    expect(screen.getByText('INV-4 · Payment cancelled, owed again')).toBeTruthy();
  });

  it('shows it on the restaurant statement too (the shared row)', () => {
    render(<CreditStatementRow line={reversed as never} />);
    expect(screen.getByText('Payment reversed')).toBeTruthy();
    expect(screen.getByText('+₹1,500.00')).toBeTruthy();
    expect(screen.getByText('INV-4 · Payment cancelled, owed again')).toBeTruthy();
  });
});

describe('Statement: export', () => {
  beforeEach(() => { exportM.mockReset(); exportM.mockResolvedValue({ filename: 's.csv', body: '' }); });

  it('exports the period shown, with the token and line', async () => {
    mockParams = { agreementId: '3', period: 'd30' };
    renderScreen();
    await screen.findByTestId('statement-list');
    await act(async () => { fireEvent.press(screen.getByLabelText('Export CSV')); });
    expect(exportM).toHaveBeenCalledTimes(1);
    expect(exportM).toHaveBeenCalledWith('tok', 3, expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
  });

  it('a double tap exports once', async () => {
    let finish!: (v: unknown) => void;
    exportM.mockReturnValue(new Promise((res) => { finish = res; }));
    renderScreen();
    await screen.findByTestId('statement-list');
    await act(async () => { fireEvent.press(screen.getByLabelText('Export CSV')); fireEvent.press(screen.getByLabelText('Export CSV')); });
    expect(exportM).toHaveBeenCalledTimes(1);
    await act(async () => { finish({}); });
  });

  it('says it in plain words when there are too many rows', async () => {
    exportM.mockRejectedValue(new CsvExportError('too_large'));
    renderScreen();
    await screen.findByTestId('statement-list');
    await act(async () => { fireEvent.press(screen.getByLabelText('Export CSV')); });
    expect(screen.getByTestId('statement-export-error')).toBeTruthy();
    expect(screen.getByText('Too many rows. Pick a shorter period.')).toBeTruthy();
  });

  it('says it failed when something unexpected breaks', async () => {
    exportM.mockRejectedValue(new Error('boom'));
    renderScreen();
    await screen.findByTestId('statement-list');
    await act(async () => { fireEvent.press(screen.getByLabelText('Export CSV')); });
    expect(screen.getByText("Couldn't make the file. Please try again.")).toBeTruthy();
  });

  it('offline: does not call the server, says so', async () => {
    mockOffline = true;
    renderScreen();
    await screen.findByTestId('statement-list');
    await act(async () => { fireEvent.press(screen.getByLabelText('Export CSV')); });
    expect(exportM).not.toHaveBeenCalled();
    expect(screen.getByText('You are offline. Connect and try again.')).toBeTruthy();
  });

  it('a later success clears the old error', async () => {
    exportM.mockRejectedValueOnce(new CsvExportError('failed')).mockResolvedValue({});
    renderScreen();
    await screen.findByTestId('statement-list');
    await act(async () => { fireEvent.press(screen.getByLabelText('Export CSV')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Export CSV')); });
    expect(screen.queryByTestId('statement-export-error')).toBeNull();
  });
});
