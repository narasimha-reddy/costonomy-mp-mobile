import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HistoryScreen from '@/app/restaurant/wallet/history';
import { fetchWalletTransactions } from '@/services/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/restaurant/wallet/history',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/services/wallet', () => ({ fetchWalletTransactions: jest.fn() }));

const NOW = new Date();
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const month = (hoursAgo: number) => {
  const d = new Date(new Date(iso(hoursAgo)).getTime() + 330 * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const page = {
  items: [
    { id: 1, direction: 'CREDIT', kind: 'TOP_UP', amount: '49000.0000', balanceAfter: '0', supplierOrderId: null,
      reason: null, refundStatus: null, status: 'COMPLETED', instrument: 'Card •1007', at: iso(4) },
    { id: 2, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '85.0000', balanceAfter: '0', supplierOrderId: null,
      reason: 'Sharma Dairy', refundStatus: null, status: 'COMPLETED', at: iso(30) },
  ],
  monthTotals: [{ month: month(4), added: '49000.0000', spent: '124.0000' }],
  availableMonths: [month(4)],
  nextCursor: null,
};

function setup() {
  (fetchWalletTransactions as jest.Mock).mockResolvedValue(page);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>
        <HistoryScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => { mockPush.mockClear(); mockBack.mockClear(); });

describe('History screen', () => {
  it('shows the title, the statements pill, search with filters, a month band with its net, and rows', async () => {
    setup();
    expect(await screen.findByText('Sharma Dairy')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('My Statements')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search')).toBeTruthy();
    expect(screen.getByText('+ ₹48,876')).toBeTruthy();
    expect(screen.getByText('Card •••• 1007')).toBeTruthy();
    expect(screen.getByText('4 hours ago')).toBeTruthy();
    expect(screen.getByText('1 day ago')).toBeTruthy();
    expect(screen.getAllByText('Debited from wallet')).toHaveLength(1);
  });

  it('opens a bottom sheet with the month\'s money in, money out and net when its band is tapped', async () => {
    setup();
    await screen.findByText('Sharma Dairy');
    expect(screen.queryByTestId('month-sheet')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /Show how this month adds up/ }));
    expect(await screen.findByTestId('month-sheet')).toBeTruthy();
    expect(screen.getByLabelText('Money in ₹49,000')).toBeTruthy();
    expect(screen.getByLabelText('Money out ₹124')).toBeTruthy();
    expect(screen.getByLabelText('Net + ₹48,876')).toBeTruthy();
    expect(screen.getByText('Everything in your wallet that month, including refunds and returned withdrawals.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Close .* summary$/));
    await waitFor(() => expect(screen.queryByTestId('month-sheet')).toBeNull());
  });

  it('opens statements and filters, and goes back', async () => {
    setup();
    await screen.findByText('Sharma Dairy');
    fireEvent.press(screen.getByTestId('open-statements'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/statement');
    fireEvent.press(screen.getByTestId('open-filters'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/restaurant/wallet/filters', params: {} });
    fireEvent.press(screen.getByTestId('history-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a row opens its transaction', async () => {
    setup();
    fireEvent.press(await screen.findByLabelText(/Paid to Sharma Dairy/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/transaction/2');
  });

  it('searches after a pause, drops the month total while it does, and says when nothing matches', async () => {
    jest.useFakeTimers();
    try {
      setup();
      await act(async () => { await jest.advanceTimersByTimeAsync(10); });
      expect(screen.getByText('Sharma Dairy')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('history-search-input'), 'sharma');
      // Not yet: typing has to pause first.
      expect(screen.getByText('Card •••• 1007')).toBeTruthy();
      await act(async () => { await jest.advanceTimersByTimeAsync(300); });
      expect(screen.queryByText('Card •••• 1007')).toBeNull();
      expect(screen.getByText('Sharma Dairy')).toBeTruthy();
      expect(screen.queryByText('+ ₹48,876')).toBeNull();

      fireEvent.changeText(screen.getByTestId('history-search-input'), 'zzzz');
      await act(async () => { await jest.advanceTimersByTimeAsync(300); });
      expect(screen.getByText('No matches')).toBeTruthy();

      fireEvent.press(screen.getByTestId('history-search-clear'));
      await act(async () => { await jest.advanceTimersByTimeAsync(300); });
      expect(screen.getByText('Card •••• 1007')).toBeTruthy();
      expect(screen.getByText('+ ₹48,876')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('says so when the history cannot be loaded', async () => {
    (fetchWalletTransactions as jest.Mock).mockRejectedValue(new Error('down'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <QueryClientProvider client={client}><HistoryScreen /></QueryClientProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(screen.getByText("Couldn't load your wallet history.")).toBeTruthy());
  });
});
