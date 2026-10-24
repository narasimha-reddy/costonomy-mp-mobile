import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import HistoryScreen from '@/app/restaurant/wallet/history';
import WalletScreen from '@/app/restaurant/wallet/index';
import { billChipCopy, chooseBillChip } from '@/lib/wallet/billChip';
import type { WalletBillStatus, WalletEntry } from '@/models/wallet';
import { fetchWallet, fetchWalletTransactions } from '@/services/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 2, fontScale: 1 }),
}));
jest.mock('@/components/common/MandiToast', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
  MandiToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ show: jest.fn() }),
}));
const mockPush = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), setParams: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/restaurant/wallet',
  useIsFocused: () => mockFocused,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outlet: { id: 7, restaurantId: 3, name: 'Test outlet' } }),
}));
let mockMay = true;
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForOutlet: (p: string) => mockMay && p === 'QUICKSCAN_PAY' }),
}));
jest.mock('@/services/quickscan', () => ({ fetchQuickScanConfig: jest.fn().mockResolvedValue({ enabled: false }) }));
jest.mock('@/services/wallet', () => ({
  ...jest.requireActual('@/services/wallet'),
  fetchWalletTransactions: jest.fn(), fetchWallet: jest.fn(), withdrawFromWallet: jest.fn(),
}));

const NOW = new Date('2026-09-29T12:00:00Z');
const FULL: Record<WalletBillStatus, string> = {
  PENDING: 'Bill pending', READING: 'Reading bill', ADDED: 'Bill added',
  REVIEWED: 'Bill reviewed', UNREADABLE: 'Check bill',
};
const GLYPH: Partial<Record<WalletBillStatus, string>> = {
  ADDED: 'icon:checkmark', REVIEWED: 'icon:checkmark-done', UNREADABLE: 'icon:alert',
};

function entry(over: Partial<WalletEntry> = {}): WalletEntry {
  return {
    id: 5, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '85.0000', balanceAfter: '0',
    supplierOrderId: null, reason: 'Sharma Dairy', refundStatus: null, status: 'COMPLETED',
    instrument: null, at: '2026-09-29T08:00:00Z', ...over,
  };
}
const withBill = (status: WalletBillStatus) => entry({ bill: { status } });
const layout = (testID: string, width: number) => fireEvent(screen.getByTestId(testID), 'layout',
  { nativeEvent: { layout: { x: 0, y: 0, width, height: 12 } } });

function expectChip(status: WalletBillStatus, lineWidth: number) {
  const variant = chooseBillChip({ lineWidth, timeText: '4 hours ago', fontScale: 1, status });
  expect(screen.getByTestId(`bill-chip-${status}`)).toBeTruthy();
  if (variant === 'icon') {
    expect(screen.queryByTestId('bill-chip-label')).toBeNull();
  } else {
    const copy = billChipCopy(status);
    expect(screen.getByTestId('bill-chip-label').props.children).toBe(variant === 'full' ? copy.full : copy.short);
  }
  if (status === 'READING') {
    expect(screen.getByTestId('reading-dots', { includeHiddenElements: true })).toBeTruthy();
  } else if (GLYPH[status] != null) {
    expect(screen.getByText(GLYPH[status] as string)).toBeTruthy();
  }
  // Never an empty pill.
  expect(screen.queryByTestId('bill-chip-label') != null || screen.queryByTestId('reading-dots', { includeHiddenElements: true }) != null
    || (GLYPH[status] != null && screen.queryByText(GLYPH[status] as string) != null)
    || status === 'PENDING').toBe(true);
  const row = screen.getByRole('button');
  expect((row.props.accessibilityLabel as string).endsWith(`, ${FULL[status]}`)).toBe(true);
  const style = StyleSheet.flatten(screen.getByTestId('bill-chip-body').props.style);
  expect(style.overflow).toBeUndefined();
}

describe('a mounted row whose bill status changes', () => {
  it('shows the new chip each time, on a fresh native body, with nothing clipped', () => {
    const props = { now: NOW, onPress: jest.fn(), onBillPress: jest.fn(), mayAddBill: true };
    const { rerender } = render(<TransactionRow entry={withBill('READING')} {...props} />);
    layout('row-time-line', 260);
    layout('row-bill-line', 300);
    expectChip('READING', 260);
    for (const next of ['ADDED', 'REVIEWED', 'UNREADABLE', 'PENDING'] as WalletBillStatus[]) {
      const before = screen.getByTestId('bill-chip-body');
      rerender(<TransactionRow entry={withBill(next)} {...props} />);
      expectChip(next, 260);
      expect(screen.getByTestId('bill-chip-body')).not.toBe(before);
    }
  });

  it('a change of shape alone (260 -> 120) is also a new body and never an empty chip', () => {
    render(<TransactionRow entry={withBill('ADDED')} now={NOW} onPress={jest.fn()} />);
    layout('row-time-line', 260);
    expectChip('ADDED', 260);
    const before = screen.getByTestId('bill-chip-body');
    layout('row-time-line', 120);
    expectChip('ADDED', 120);
    expect(screen.getByTestId('bill-chip-body')).not.toBe(before);
  });
});

// ── History screen ───────────────────────────────────────────────────

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const row = (id: number, reason: string, bill?: { status: string } | null) => ({
  id, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '85.0000', balanceAfter: '0', supplierOrderId: null,
  reason, refundStatus: null, status: 'COMPLETED', at: iso(4), ...(bill === undefined ? {} : { bill }),
});
function page(items: unknown[]) {
  const d = new Date(Date.now() + 330 * 60_000);
  const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { items, monthTotals: [{ month: m, added: '0.0000', spent: '85.0000' }], availableMonths: [m], nextCursor: null };
}
const METRICS = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: 0 } } });
}
const tree = (ui: React.ReactElement, client: QueryClient) => (
  <SafeAreaProvider initialMetrics={METRICS}><QueryClientProvider client={client}>{ui}</QueryClientProvider></SafeAreaProvider>
);
/** The chip of a status is on screen (its words may be the short form until the row is measured). */
const findChip = (status: WalletBillStatus) => screen.findByTestId(`bill-chip-${status}`);
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const histCalls = () => (fetchWalletTransactions as jest.Mock).mock.calls.length;

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockClear(); mockFocused = true; mockMay = true;
  (fetchWalletTransactions as jest.Mock).mockReset();
  (fetchWallet as jest.Mock).mockReset();
});
afterEach(() => { jest.useRealTimers(); });

describe('History polls while a bill is being read', () => {
  it('shows the new chip in place after 3 s, then stops asking', async () => {
    (fetchWalletTransactions as jest.Mock)
      .mockResolvedValueOnce(page([row(1, 'Alpha', { status: 'READING' })]))
      .mockResolvedValue(page([row(1, 'Alpha', { status: 'ADDED' })]));
    render(tree(<HistoryScreen />, newClient()));
    await findChip('READING');
    const before = histCalls();
    await advance(3000);
    await findChip('ADDED');
    expect(histCalls()).toBeGreaterThan(before);
    const settled = histCalls();
    await advance(10_000);
    expect(histCalls()).toBe(settled);
  });

  it('gives up after about 90 s when a row stays READING', async () => {
    (fetchWalletTransactions as jest.Mock).mockResolvedValue(page([row(1, 'Alpha', { status: 'READING' })]));
    render(tree(<HistoryScreen />, newClient()));
    await findChip('READING');
    for (let i = 0; i < 32; i += 1) await advance(3000);
    const stopped = histCalls();
    expect(stopped).toBeGreaterThan(5);
    await advance(30_000);
    expect(histCalls()).toBe(stopped);
  });

  it('does not poll when nothing is READING', async () => {
    (fetchWalletTransactions as jest.Mock).mockResolvedValue(page([row(1, 'Alpha', { status: 'ADDED' })]));
    render(tree(<HistoryScreen />, newClient()));
    await findChip('ADDED');
    const n = histCalls();
    await advance(20_000);
    expect(histCalls()).toBe(n);
  });

  it('pauses while the screen is not focused and refetches once when focus returns', async () => {
    (fetchWalletTransactions as jest.Mock).mockResolvedValue(page([row(1, 'Alpha', { status: 'READING' })]));
    const client = newClient();
    const { rerender } = render(tree(<HistoryScreen />, client));
    await findChip('READING');
    mockFocused = false;
    rerender(tree(<HistoryScreen />, client));
    await advance(100);
    const n = histCalls();
    await advance(15_000);
    expect(histCalls()).toBe(n);
    mockFocused = true;
    rerender(tree(<HistoryScreen />, client));
    await advance(1);
    await waitFor(() => expect(histCalls()).toBe(n + 1));
  });
});

// ── Wallet screen: Recent ────────────────────────────────────────────

const walletRow = (id: number, bill?: { status: string } | null) => ({
  id, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '100.0000', balanceAfter: '450.0000',
  supplierOrderId: null, reason: `Shop${id}`, refundStatus: null, status: 'COMPLETED', at: iso(3),
  ...(bill === undefined ? {} : { bill }),
});
const walletOf = (recent: unknown[]) => ({ balance: '500.0000', recent });

describe('Wallet Recent shows bill chips', () => {
  it('renders chips, routes chip and row taps, and leaves a billless row alone', async () => {
    (fetchWallet as jest.Mock).mockResolvedValue(walletOf([
      walletRow(1, { status: 'PENDING' }), walletRow(2, { status: 'ADDED' }), walletRow(3),
      walletRow(4, { status: 'REVIEWED' }),
    ]));
    render(tree(<WalletScreen />, newClient()));
    fireEvent.press(await screen.findByTestId('bill-chip-PENDING'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/bill', params: { id: '1' } });
    fireEvent.press(screen.getByTestId('bill-chip-ADDED'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/invoice', params: { id: '2' } });
    fireEvent.press(screen.getByLabelText(/Shop1/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/transaction/1');
    // The third row has no bill: no chip and no time line for it; the fourth is not shown.
    expect(screen.getAllByTestId('row-time-line')).toHaveLength(2);
    expect(screen.queryByTestId('bill-chip-REVIEWED')).toBeNull();
  });

  it.each([
    [['READING', 'UNREADABLE', 'REVIEWED']],
    [['PENDING', 'ADDED', 'READING']],
  ])('shows each of %j', async (statuses) => {
    (fetchWallet as jest.Mock).mockResolvedValue(
      walletOf(statuses.map((s, i) => walletRow(i + 1, { status: s }))));
    render(tree(<WalletScreen />, newClient()));
    await screen.findAllByTestId('row-time-line');
    for (const s of statuses) expect(screen.getByTestId(`bill-chip-${s}`)).toBeTruthy();
  });

  it('a row without a bill (older server) has no chip', async () => {
    (fetchWallet as jest.Mock).mockResolvedValue(walletOf([walletRow(1)]));
    render(tree(<WalletScreen />, newClient()));
    await screen.findByLabelText(/Shop1/);
    expect(screen.queryByTestId('row-time-line')).toBeNull();
  });

  it('polls every 3 s while a shown Recent row is READING and updates the chip in place', async () => {
    (fetchWallet as jest.Mock)
      .mockResolvedValueOnce(walletOf([walletRow(1, { status: 'READING' })]))
      .mockResolvedValue(walletOf([walletRow(1, { status: 'ADDED' })]));
    render(tree(<WalletScreen />, newClient()));
    await findChip('READING');
    await advance(3000);
    await findChip('ADDED');
    const n = (fetchWallet as jest.Mock).mock.calls.length;
    await advance(10_000);
    expect((fetchWallet as jest.Mock).mock.calls.length).toBe(n);
  });
});

// ── Service ──────────────────────────────────────────────────────────

describe('mapWallet maps recent like History does', () => {
  const { mapWallet } = jest.requireActual('@/services/wallet');
  const raw = (recent: unknown, limits?: unknown) => ({ balance: '1', recent, ...(limits ? { limits } : {}) });
  const limits = {
    maxBalance: '1', monthlyTopUpLimit: '1', addedThisMonth: '1', remainingThisMonth: '1', minTopUp: '1', maxTopUp: '1',
  };
  it.each([[undefined], [limits]])('with limits %#', (lim) => {
    const out = mapWallet(raw([
      walletRow(1, { status: 'READING' }), walletRow(2, { status: 'WEIRD' }), walletRow(3),
    ], lim));
    expect(out.recent.map((r: WalletEntry) => r.bill)).toEqual([{ status: 'READING' }, null, null]);
  });
  it('missing or non-array recent is []', () => {
    expect(mapWallet(raw(undefined)).recent).toEqual([]);
    expect(mapWallet(raw('x', limits)).recent).toEqual([]);
  });
});
