import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierStatementScreen from '@/app/supplier/credit/statement';
import SupplierStatementFiltersScreen from '@/app/supplier/credit/statement-filters';
import { ApiError } from '@/lib/api/errors';
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
const statementCalls = () => api.mock.calls.filter(([p]) => String(p).includes('/statement'));

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

describe('Supplier statement screen', () => {
  it('asks the shared statement endpoint with no range and shows the restaurant and the server range', async () => {
    renderScreen();
    expect(await screen.findByText('5 Jul to 3 Oct')).toBeTruthy();
    expect(statementCalls()[0][0]).toBe('/api/v1/credit/agreements/3/statement');
    expect(await screen.findByText('Spice Co')).toBeTruthy();
  });

  it('shows the opening and closing balances exactly as the server sent them', async () => {
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(screen.getByTestId('statement-opening').props.children).toBe('₹300.00');
    expect(screen.getByTestId('statement-closing').props.children).toBe('₹900.00');
    expect(screen.getByText('They owed at start')).toBeTruthy();
  });

  it('renders each line with its signed amount and what was owed after it', async () => {
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(screen.getAllByTestId('statement-row')).toHaveLength(3);
    expect(screen.getByText('−₹500.00')).toBeTruthy();
    expect(screen.getByText('+₹1,200.00')).toBeTruthy();
    expect(screen.getByText('Owed ₹900.00 after')).toBeTruthy();
  });

  it('does not open the restaurant\'s routes from a line', async () => {
    renderScreen();
    await screen.findByTestId('statement-list');
    for (const r of screen.getAllByTestId('statement-row')) fireEvent.press(r);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sends from and to for months or a preset, nothing for the default', async () => {
    mockParams = { agreementId: '3', months: '2026-09' };
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(statementCalls()[0][0]).toBe('/api/v1/credit/agreements/3/statement?from=2026-09-01&to=2026-09-30');
  });

  it('the filter button opens the supplier Filters screen with the current filters and the agreement', async () => {
    mockParams = { agreementId: '3', period: 'd30', paidBy: 'UPI' };
    renderScreen();
    await screen.findByTestId('statement-list');
    fireEvent.press(screen.getByTestId('open-filters'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/supplier/credit/statement-filters',
      params: { agreementId: '3', period: 'd30', paidBy: 'UPI' },
    });
  });

  it('Type narrows the loaded lines, says the balances cover the whole period, and never recomputes them', async () => {
    mockParams = { agreementId: '3', types: 'REPAYMENTS' };
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(screen.getAllByTestId('statement-row')).toHaveLength(1);
    expect(screen.getByText('Opening and closing balances cover the whole period')).toBeTruthy();
    expect(screen.getByTestId('statement-opening').props.children).toBe('₹300.00');
    expect(screen.getByTestId('statement-closing').props.children).toBe('₹900.00');
  });

  it('is empty with a plain message when there was no activity', async () => {
    respond({ ...STATEMENT, lines: [] });
    renderScreen();
    expect(await screen.findByText('No credit activity in this period.')).toBeTruthy();
  });

  it('shows an error with a retry, which refetches', async () => {
    respond(new ApiError({ code: 'X', message: 'boom', status: 500 }));
    renderScreen();
    expect(await screen.findByTestId('statement-error')).toBeTruthy();
    respond(STATEMENT);
    fireEvent.press(screen.getByText('Try Again'));
    expect(await screen.findByTestId('statement-list')).toBeTruthy();
  });

  it('shows the friendly page for a line that is not theirs, without retry', async () => {
    respond(new ApiError({ code: 'NOT_FOUND', message: 'nope', status: 404 }));
    renderScreen();
    expect(await screen.findByText('This credit line is not available to you')).toBeTruthy();
    expect(screen.queryByText('Try Again')).toBeNull();
  });

  it('shows the offline banner', async () => {
    mockOffline = true;
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('refetches on pull to refresh', async () => {
    renderScreen();
    const list = await screen.findByTestId('statement-list');
    const before = statementCalls().length;
    await act(async () => { list.props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(statementCalls().length).toBeGreaterThan(before));
  });
});

describe('Supplier statement Filters screen', () => {
  const renderFilters = () =>
    render(<SafeAreaProvider initialMetrics={METRICS}><SupplierStatementFiltersScreen /></SafeAreaProvider>);

  it('has Period, Type and Paid by', () => {
    renderFilters();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByTestId('choice-d90').props.accessibilityState.checked).toBe(true);
  });

  it('applies back to the supplier statement with the agreement id and the chosen filters', () => {
    renderFilters();
    fireEvent.press(screen.getByTestId('choice-d30'));
    fireEvent.press(screen.getByTestId('apply-filters'));
    const call = mockNavigate.mock.calls[0][0];
    expect(call.pathname).toBe('/supplier/credit/statement');
    expect(call.params).toMatchObject({ agreementId: '3', period: 'd30' });
  });
});
