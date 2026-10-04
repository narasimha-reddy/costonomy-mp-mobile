import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HistoryScreen from '@/app/restaurant/wallet/history';
import FiltersScreen from '@/app/restaurant/wallet/filters';
import { refreshBillViews } from '@/hooks/useWalletInvoice';
import { fetchWalletTransactions } from '@/services/wallet';
import { EMPTY_FILTER_PARAMS } from '@/lib/wallet/history';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), setParams: mockSetParams, navigate: mockNavigate }),
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/restaurant/wallet/history',
  useIsFocused: () => true,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outlet: { id: 7, restaurantId: 3, name: 'Test outlet' } }),
}));
let mockMay = true;
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForOutlet: (permission: string) => mockMay && permission === 'QUICKSCAN_PAY' }),
}));
jest.mock('@/services/wallet', () => ({ fetchWalletTransactions: jest.fn() }));

const NOW = new Date();
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const month = (hoursAgo: number) => {
  const d = new Date(new Date(iso(hoursAgo)).getTime() + 330 * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const row = (id: number, reason: string, bill?: { status: string } | null, hours = 4) => ({
  id, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '85.0000', balanceAfter: '0', supplierOrderId: null,
  reason, refundStatus: null, status: 'COMPLETED', at: iso(hours), ...(bill === undefined ? {} : { bill }),
});
function pageOf(extra: Record<string, unknown> = {}, items = [row(1, 'Sharma Dairy', { status: 'PENDING' })]) {
  return {
    items,
    monthTotals: [{ month: month(4), added: '0.0000', spent: '85.0000' }],
    availableMonths: [month(4)],
    nextCursor: null,
    ...extra,
  };
}

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: 0 } } });
}
function mount(ui: React.ReactElement, client = newClient()) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const serve = (p: unknown) => (fetchWalletTransactions as jest.Mock).mockResolvedValue(p);

beforeEach(() => {
  mockPush.mockClear(); mockSetParams.mockClear(); mockNavigate.mockClear();
  (fetchWalletTransactions as jest.Mock).mockReset();
  mockParams = {}; mockMay = true;
});

describe('History: bill chips', () => {
  it('shows a chip per status and none for a row without a bill or from an older server', async () => {
    serve(pageOf({}, [
      row(1, 'Alpha', { status: 'PENDING' }), row(2, 'Bravo', { status: 'READING' }),
      row(3, 'Charlie', { status: 'ADDED' }), row(4, 'Delta', { status: 'REVIEWED' }),
      row(5, 'Echo', { status: 'UNREADABLE' }), row(6, 'Foxtrot', null), row(7, 'Golf'),
    ]));
    mount(<HistoryScreen />);
    await screen.findByText('Alpha');
    for (const s of ['PENDING', 'READING', 'ADDED', 'REVIEWED', 'UNREADABLE']) {
      expect(screen.getAllByTestId(`bill-chip-${s}`)).toHaveLength(1);
    }
    expect(screen.getAllByTestId('row-time-line')).toHaveLength(5);
  });

  it('a pending chip opens Add bill for someone who may add bills; the row opens the details', async () => {
    serve(pageOf());
    mount(<HistoryScreen />);
    fireEvent.press(await screen.findByTestId('bill-chip-PENDING'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/bill', params: { id: '1' } });
    mockPush.mockClear();
    fireEvent.press(screen.getByLabelText(/Paid to Sharma Dairy/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/transaction/1');
  });

  it('without permission a pending chip is not a button, but an added one still opens the bill', async () => {
    mockMay = false;
    serve(pageOf({}, [row(1, 'Alpha', { status: 'PENDING' }), row(2, 'Bravo', { status: 'ADDED' })]));
    mount(<HistoryScreen />);
    await screen.findByText('Alpha');
    fireEvent.press(screen.getByTestId('bill-chip-PENDING'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/wallet/transaction/1');
    fireEvent.press(screen.getByTestId('bill-chip-ADDED'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/invoice', params: { id: '2' } });
  });
});

describe('History: bill filter and banner', () => {
  it('asks the server for the chosen bill statuses and shows a removable chip for each', async () => {
    mockParams = { bills: 'PENDING,UNREADABLE' };
    serve(pageOf());
    mount(<HistoryScreen />);
    await screen.findByText('Sharma Dairy');
    expect((fetchWalletTransactions as jest.Mock).mock.calls[0][2].filters.bills).toEqual(['PENDING', 'UNREADABLE']);
    expect(screen.getByLabelText('Remove filter Bill: Pending')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Remove filter Bill: Check bill'));
    expect(mockSetParams).toHaveBeenCalledWith({ ...EMPTY_FILTER_PARAMS, bills: 'PENDING' });
  });

  it('removing the only bill chip really clears the bills param', async () => {
    mockParams = { bills: 'READING' };
    serve(pageOf());
    mount(<HistoryScreen />);
    fireEvent.press(await screen.findByLabelText('Remove filter Bill: Reading'));
    expect(mockSetParams).toHaveBeenCalledWith({ ...EMPTY_FILTER_PARAMS });
    expect(mockSetParams.mock.calls[0][0].bills).toBe('');
  });

  it('prompts with the count and Show them applies the Pending filter, keeping the others', async () => {
    mockParams = { categories: 'TOP_UP' };
    serve(pageOf({ billSummary: { pending: 3, reading: 0, unreadable: 0 } }));
    mount(<HistoryScreen />);
    expect(await screen.findByText('3 payments need a bill')).toBeTruthy();
    expect(screen.getByTestId('bill-banner-action')).toBeTruthy();
    fireEvent.press(screen.getByTestId('bill-banner'));
    expect(mockSetParams).toHaveBeenCalledWith(
      expect.objectContaining({ categories: 'TOP_UP', bills: 'PENDING' }));
  });

  it('says "1 payment needs a bill" for one', async () => {
    serve(pageOf({ billSummary: { pending: 1, reading: 0, unreadable: 0 } }));
    mount(<HistoryScreen />);
    expect(await screen.findByText('1 payment needs a bill')).toBeTruthy();
  });

  it('while showing pending, the banner says so and Clear removes only the bills', async () => {
    mockParams = { bills: 'PENDING', months: '2026-09' };
    serve(pageOf({ billSummary: { pending: 3, reading: 0, unreadable: 0 } }));
    mount(<HistoryScreen />);
    expect(await screen.findByText('Showing payments that need a bill')).toBeTruthy();
    fireEvent.press(screen.getByTestId('bill-banner-action'));
    const arg = mockSetParams.mock.calls[0][0];
    expect(arg.bills).toBe('');
    expect(arg.months).toBe('2026-09');
  });

  it.each([
    ['no pending', {}, { billSummary: { pending: 0, reading: 2, unreadable: 1 } }],
    ['an older server (no summary)', {}, {}],
    ['another bill filter on', { bills: 'ADDED' }, { billSummary: { pending: 5, reading: 0, unreadable: 0 } }],
    ['pending and another', { bills: 'PENDING,ADDED' }, { billSummary: { pending: 5, reading: 0, unreadable: 0 } }],
  ])('no banner with %s', async (_n, params, extra) => {
    mockParams = params as Record<string, string>;
    serve(pageOf(extra));
    mount(<HistoryScreen />);
    await screen.findByText('Sharma Dairy');
    expect(screen.queryByTestId('bill-banner')).toBeNull();
  });
});

describe('History: month sheet', () => {
  async function openSheet() {
    await screen.findByText('Sharma Dairy');
    fireEvent.press(screen.getByRole('button', { name: /Show how this month adds up/ }));
    await screen.findByTestId('month-sheet');
  }

  it('shows Bills pending when the month has some', async () => {
    serve(pageOf({ monthTotals: [{ month: month(4), added: '0.0000', spent: '85.0000', billsPending: 2 }] }));
    mount(<HistoryScreen />);
    await openSheet();
    expect(screen.getByLabelText('Bills pending 2')).toBeTruthy();
  });

  it.each([['zero', 0], ['absent', undefined]])('hides Bills pending when %s', async (_n, billsPending) => {
    serve(pageOf({ monthTotals: [{ month: month(4), added: '0.0000', spent: '85.0000', billsPending }] }));
    mount(<HistoryScreen />);
    await openSheet();
    expect(screen.queryByText('Bills pending')).toBeNull();
  });
});

describe('History: follows bill changes made elsewhere', () => {
  it('a bill added then removed shows up without a manual refresh', async () => {
    const client = newClient();
    serve(pageOf({}, [row(1, 'Sharma Dairy', { status: 'PENDING' })]));
    mount(<HistoryScreen />, client);
    await screen.findByTestId('bill-chip-PENDING');

    serve(pageOf({}, [row(1, 'Sharma Dairy', { status: 'READING' })]));
    await act(async () => { await refreshBillViews(client, 7, 1); });
    await screen.findByTestId('bill-chip-READING');
    expect(screen.queryByTestId('bill-chip-PENDING')).toBeNull();

    serve(pageOf({}, [row(1, 'Sharma Dairy', null)]));
    await act(async () => { await refreshBillViews(client, 7, 1); });
    await waitFor(() => expect(screen.queryAllByTestId('row-time-line')).toHaveLength(0));
    expect(screen.queryByTestId('bill-chip-READING')).toBeNull();
    expect(screen.getByText('Sharma Dairy')).toBeTruthy();
  });
});

describe('Filters screen: Bill section', () => {
  it('lists the five statuses in order and applies the choice with the other params cleared', async () => {
    serve(pageOf());
    mount(<FiltersScreen />);
    fireEvent.press(await screen.findByTestId('rail-bills'));
    for (const key of ['PENDING', 'READING', 'ADDED', 'REVIEWED', 'UNREADABLE']) {
      expect(screen.getByTestId(`choice-${key}`)).toBeTruthy();
    }
    expect(screen.getByText('Check bill')).toBeTruthy();
    fireEvent.press(screen.getByTestId('choice-PENDING'));
    fireEvent.press(screen.getByTestId('choice-UNREADABLE'));
    fireEvent.press(screen.getByTestId('apply-filters'));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/restaurant/wallet/history',
      params: { ...EMPTY_FILTER_PARAMS, bills: 'PENDING,UNREADABLE' },
    });
  });

  it('starts from the applied bills, counts them, and clearing them sends an empty bills param', async () => {
    mockParams = { bills: 'ADDED' };
    serve(pageOf());
    mount(<FiltersScreen />);
    const rail = await screen.findByTestId('rail-bills');
    expect(rail).toHaveTextContent('Bill1');
    fireEvent.press(rail);
    fireEvent.press(screen.getByTestId('choice-ADDED'));
    fireEvent.press(screen.getByTestId('apply-filters'));
    expect(mockNavigate.mock.calls[0][0].params.bills).toBe('');
  });
});
