import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreditStatementScreen from '@/app/restaurant/credit/statement';
import { ApiError } from '@/lib/api/errors';
import { apiRequest } from '@/lib/api/client';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/restaurant/credit/statement',
  useLocalSearchParams: () => ({ agreementId: '3' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
jest.mock('@/lib/api/client', () => ({ apiRequest: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const api = apiRequest as jest.Mock;

function row(over: Record<string, unknown>) {
  return {
    at: '2026-10-05T10:00:00Z', type: 'UTILIZE', label: 'Order on credit', amount: '1200.0000',
    owedAfter: '1200.0000', supplierOrderId: null, orderNumber: null, creditInvoiceId: null,
    invoiceNumber: null, source: null, method: null, reference: null, walletEntryId: null, ...over,
  };
}

const STATEMENT = {
  agreementId: 3, from: '2026-07-05', to: '2026-10-03', openingOwed: '300.0000', closingOwed: '900.0000',
  lines: [
    row({ at: '2026-11-01T01:00:00Z', label: 'Paid from wallet', type: 'REPAYMENT', amount: '-500.0000',
      owedAfter: '900.0000', source: 'WALLET', walletEntryId: 192, invoiceNumber: 'INV-9' }),
    row({ at: '2026-10-31T18:00:00Z', label: 'Order #55', amount: '1200.0000', owedAfter: '1400.0000',
      supplierOrderId: 55, invoiceNumber: 'INV-9' }),
    row({ at: '2026-10-02T10:00:00Z', label: 'Adjustment', type: 'ADJUSTMENT', amount: '200.0000',
      owedAfter: '200.0000' }),
  ],
};

function respond(statement: unknown) {
  api.mockImplementation((path: string) => {
    if (path.includes('/statement')) {
      return statement instanceof Error ? Promise.reject(statement) : Promise.resolve(statement);
    }
    return Promise.resolve({ id: 3, supplierName: 'Acme Foods' });
  });
}
const statementCalls = () => api.mock.calls.filter(([p]) => String(p).includes('/statement'));

// Cached queries keep a garbage-collection timer alive; clearing them lets jest exit by itself.
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}><CreditStatementScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => { jest.clearAllMocks(); respond(STATEMENT); });

describe('Credit statement screen', () => {
  it('loads with no range and shows the range the server chose', async () => {
    renderScreen();
    expect(await screen.findByText('5 Jul to 3 Oct')).toBeTruthy();
    expect(statementCalls()[0][0]).toBe('/api/v1/credit/agreements/3/statement');
    expect(await screen.findByText('Acme Foods')).toBeTruthy();
  });

  it('shows the server balances', async () => {
    renderScreen();
    expect(await screen.findByText('Owed at start')).toBeTruthy();
    expect(screen.getByTestId('statement-opening').props.children).toBe('₹300.00');
    expect(screen.getByTestId('statement-closing').props.children).toBe('₹900.00');
    expect(screen.getByText('Owed now')).toBeTruthy();
  });

  it('groups by India month, newest first', async () => {
    renderScreen();
    await screen.findByTestId('statement-list');
    // 18:00Z on 31 Oct is 23:30 IST that day; 01:00Z on 1 Nov is 06:30 IST.
    const labels = screen.getAllByTestId(/^month-/).map((n) => n.props.testID);
    expect(labels).toEqual(['month-November 2026', 'month-October 2026']);
    expect(screen.getAllByTestId('statement-row')).toHaveLength(3);
  });

  it('writes repayments with a minus sign and the word, and orders with a plus', async () => {
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(screen.getByText('−₹500.00')).toBeTruthy();
    expect(screen.getByText('+₹1,200.00')).toBeTruthy();
    expect(screen.getByText(/Repayment/)).toBeTruthy();
    expect(screen.getByText('INV-9 · Repayment · From wallet')).toBeTruthy();
    expect(screen.getByText('Owed ₹900.00 after')).toBeTruthy();
  });

  it('opens the wallet entry for a repayment and the order for an order line', async () => {
    renderScreen();
    await screen.findByTestId('statement-list');
    const rows = screen.getAllByTestId('statement-row');
    fireEvent.press(rows[0]);
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/wallet/transaction/192');
    fireEvent.press(rows[1]);
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/orders/55');
    mockPush.mockClear();
    fireEvent.press(rows[2]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('says so when there is no activity', async () => {
    respond({ ...STATEMENT, lines: [] });
    renderScreen();
    expect(await screen.findByText('No credit activity in this period.')).toBeTruthy();
  });

  it('shows the friendly message on a 400 and offers a retry', async () => {
    respond(new ApiError({ code: 'VALIDATION_ERROR', message: 'range too big', status: 400 }));
    renderScreen();
    expect(await screen.findByText('Choose a range of up to a year')).toBeTruthy();
    expect(screen.queryByText('range too big')).toBeNull();
  });

  it('shows a generic error with retry on other failures', async () => {
    respond(new ApiError({ code: 'X', message: 'boom', status: 500 }));
    renderScreen();
    expect(await screen.findByText('Could not load your statement.')).toBeTruthy();
    respond(STATEMENT);
    fireEvent.press(screen.getByText('Try Again'));
    expect(await screen.findByText('5 Jul to 3 Oct')).toBeTruthy();
  });

  it('shows a skeleton while loading', () => {
    api.mockImplementation(() => new Promise(() => undefined));
    renderScreen();
    expect(screen.queryByText('Owed now')).toBeNull();
    expect(screen.queryByTestId('statement-list')).toBeNull();
  });

  it('refetches with from and to when a range is chosen', async () => {
    renderScreen();
    await screen.findByText('5 Jul to 3 Oct');
    fireEvent.press(screen.getByTestId('statement-filter'));
    fireEvent.changeText(screen.getByTestId('custom-from'), '2026-09-01');
    fireEvent.changeText(screen.getByTestId('custom-to'), '2026-09-30');
    fireEvent.press(screen.getByTestId('custom-apply'));
    await waitFor(() => expect(statementCalls()).toHaveLength(2));
    expect(statementCalls()[1][0]).toBe(
      '/api/v1/credit/agreements/3/statement?from=2026-09-01&to=2026-09-30');
  });
});
