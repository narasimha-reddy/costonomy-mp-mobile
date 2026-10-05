import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
const mockSetParams = jest.fn();
let mockParams: Record<string, string> = { agreementId: '3' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), setParams: mockSetParams }),
  usePathname: () => '/restaurant/credit/statement',
  useLocalSearchParams: () => mockParams,
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
/** Types into the search box and lets the debounce settle, without waiting on the real clock. */
function typeSearch(text: string) {
  jest.useFakeTimers();
  try {
    fireEvent.changeText(screen.getByTestId('history-search-input'), text);
    act(() => { jest.advanceTimersByTime(300); });
  } finally {
    jest.useRealTimers();
  }
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

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { agreementId: '3' };
  respond(STATEMENT);
});

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

  it('no longer has the old period link or bottom sheet', async () => {
    renderScreen();
    await screen.findByTestId('statement-list');
    expect(screen.queryByText('Change period')).toBeNull();
    expect(screen.queryByTestId('statement-filter')).toBeNull();
    expect(screen.queryByTestId('custom-from')).toBeNull();
  });

  it('labels the summary as for this period', async () => {
    renderScreen();
    expect(await screen.findByText('for this period')).toBeTruthy();
    expect(screen.queryByTestId('statement-balances-note')).toBeNull();
  });

  describe('layout', () => {
    type Node = { type: string; props?: Record<string, unknown>; children?: (Node | string)[] | null };
    function flatten(node: Node | Node[] | null, trail: string[] = [], out: { id: string; type: string; trail: string[] }[] = []) {
      if (node == null) return out;
      if (Array.isArray(node)) { node.forEach((n) => flatten(n, trail, out)); return out; }
      const id = typeof node.props?.testID === 'string' ? node.props.testID : '';
      out.push({ id, type: node.type, trail });
      (node.children ?? []).forEach((c) => { if (typeof c !== 'string') flatten(c, [...trail, node.type], out); });
      return out;
    }

    it('puts the search bar, then the chips, then the summary, all before the rows and outside any sheet', async () => {
      mockParams = { agreementId: '3', types: 'REPAYMENTS' };
      renderScreen();
      await screen.findByTestId('statement-opening');
      const nodes = flatten(screen.toJSON() as Node | Node[]);
      const at = (id: string) => nodes.findIndex((n) => n.id === id);
      expect(at('history-search')).toBeGreaterThan(-1);
      expect(at('history-search')).toBeLessThan(at('active-filters'));
      expect(at('active-filters')).toBeLessThan(at('statement-opening'));
      expect(at('history-search')).toBeLessThan(at('statement-list'));
      expect(at('statement-opening')).toBeLessThan(at('statement-row'));
      const search = nodes[at('history-search')] as { trail: string[] };
      expect(search.trail).not.toContain('Modal');
      expect(screen.getByTestId('history-search').props.accessibilityLabel).toBeUndefined();
      expect(screen.getByPlaceholderText('Search invoice, order or reference')).toBeTruthy();
    });

    it('shows the search bar even while loading and on an error', async () => {
      api.mockImplementation(() => new Promise(() => undefined));
      renderScreen();
      expect(screen.getByTestId('history-search')).toBeTruthy();
      screen.unmount();
      respond(new ApiError({ code: 'X', message: 'boom', status: 500 }));
      renderScreen();
      await screen.findByText('Could not load your statement.');
      expect(screen.getByTestId('history-search')).toBeTruthy();
    });
  });

  describe('filters', () => {
    it('the filter button opens the Filters screen with the current filters and the agreement', async () => {
      mockParams = { agreementId: '3', period: 'd30', paidBy: 'UPI' };
      renderScreen();
      await screen.findByTestId('statement-list');
      const button = screen.getByTestId('open-filters');
      expect(button.props.accessibilityLabel).toBe('Filters, 2 applied');
      fireEvent.press(button);
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname: '/restaurant/credit/statement-filters',
        params: { agreementId: '3', period: 'd30', paidBy: 'UPI' },
      });
    });

    it('sends nothing for the default period and from/to for a preset or for months', async () => {
      mockParams = { agreementId: '3', months: '2026-09' };
      renderScreen();
      await screen.findByTestId('statement-list');
      expect(statementCalls()[0][0]).toBe(
        '/api/v1/credit/agreements/3/statement?from=2026-09-01&to=2026-09-30');
      screen.unmount();
      api.mockClear();
      mockParams = { agreementId: '3', period: 'd30' };
      renderScreen();
      await screen.findByTestId('statement-list');
      expect(statementCalls()[0][0]).toMatch(
        /statement\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
    });

    it('Type narrows the loaded lines and says the balances cover the whole period', async () => {
      mockParams = { agreementId: '3', types: 'REPAYMENTS' };
      renderScreen();
      await screen.findByTestId('statement-list');
      expect(screen.getAllByTestId('statement-row')).toHaveLength(1);
      expect(screen.getByText('Paid from wallet')).toBeTruthy();
      expect(screen.queryByText('Order #55')).toBeNull();
      expect(screen.getByText('Opening and closing balances cover the whole period')).toBeTruthy();
      // The server's balances are not recomputed.
      expect(screen.getByTestId('statement-opening').props.children).toBe('₹300.00');
      expect(screen.getByTestId('statement-closing').props.children).toBe('₹900.00');
    });

    it('Paid by narrows to the matching repayments', async () => {
      mockParams = { agreementId: '3', paidBy: 'UPI' };
      renderScreen();
      expect(await screen.findByText('Nothing matches these filters')).toBeTruthy();
      screen.unmount();
      mockParams = { agreementId: '3', paidBy: 'WALLET' };
      renderScreen();
      await waitFor(() => expect(screen.getAllByTestId('statement-row')).toHaveLength(1));
    });

    it('shows one removable chip per filter, removes one, and clears all', async () => {
      mockParams = { agreementId: '3', period: 'd180', types: 'ORDERS', paidBy: 'CASH' };
      renderScreen();
      await screen.findByTestId('statement-list');
      expect(screen.getByLabelText('Remove filter Last 6 months')).toBeTruthy();
      expect(screen.getByLabelText('Remove filter Orders on credit')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Remove filter Paid by Cash'));
      expect(mockSetParams).toHaveBeenLastCalledWith(
        { period: 'd180', months: '', types: 'ORDERS', paidBy: '' });
      fireEvent.press(screen.getByTestId('clear-all-chips'));
      expect(mockSetParams).toHaveBeenLastCalledWith({ period: '', months: '', types: '', paidBy: '' });
      // removable by an accessibility action too
      const chip = screen.getByLabelText('Remove filter Orders on credit');
      expect(chip.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Remove Orders on credit' }]);
    });

    it('searches invoice, order number, reference and label after the debounce', async () => {
      renderScreen();
      await screen.findByTestId('statement-list');
      jest.useFakeTimers();
      fireEvent.changeText(screen.getByTestId('history-search-input'), 'adjust');
      act(() => { jest.advanceTimersByTime(100); });
      expect(screen.getAllByTestId('statement-row')).toHaveLength(3); // still typing
      act(() => { jest.advanceTimersByTime(300); });
      jest.useRealTimers();
      expect(screen.getAllByTestId('statement-row')).toHaveLength(1);
      expect(screen.getByText('Adjustment')).toBeTruthy();
      expect(screen.getByText('Opening and closing balances cover the whole period')).toBeTruthy();
      typeSearch('INV-9');
      expect(screen.getAllByTestId('statement-row')).toHaveLength(2);
    });
  });

  describe('empty states', () => {
    it('no activity in the period, with no Clear filters offered when none are on', async () => {
      respond({ ...STATEMENT, lines: [] });
      renderScreen();
      expect(await screen.findByText('No credit activity in this period.')).toBeTruthy();
      expect(screen.queryByText('Clear filters')).toBeNull();
    });

    it('no results for a search offers to clear it', async () => {
      renderScreen();
      await screen.findByTestId('statement-list');
      typeSearch('zzzz');
      expect(screen.getByText('No matches')).toBeTruthy();
      jest.useFakeTimers();
      fireEvent.press(screen.getByText('Clear search'));
      act(() => { jest.advanceTimersByTime(300); });
      jest.useRealTimers();
      expect(screen.getAllByTestId('statement-row')).toHaveLength(3);
    });

    it('no results for the filters offers Clear filters, which empties them', async () => {
      mockParams = { agreementId: '3', paidBy: 'CHEQUE' };
      renderScreen();
      expect(await screen.findByText('Nothing matches these filters')).toBeTruthy();
      fireEvent.press(screen.getByText('Clear filters'));
      expect(mockSetParams).toHaveBeenLastCalledWith({ period: '', months: '', types: '', paidBy: '' });
    });

    it('a period with no lines and a filter on offers Clear filters', async () => {
      mockParams = { agreementId: '3', period: 'd30' };
      respond({ ...STATEMENT, lines: [] });
      renderScreen();
      expect(await screen.findByText('No credit activity in this period.')).toBeTruthy();
      expect(screen.getByText('Clear filters')).toBeTruthy();
    });
  });

  it('refetches on pull to refresh', async () => {
    renderScreen();
    const list = await screen.findByTestId('statement-list');
    const { onRefresh } = list.props.refreshControl.props;
    onRefresh();
    await waitFor(() => expect(statementCalls()).toHaveLength(2));
  });
});
