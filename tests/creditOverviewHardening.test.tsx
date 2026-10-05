import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditOverviewScreen from '@/app/restaurant/credit/index';
import { NetworkError } from '@/lib/api/errors';
import { fetchCreditSummary, repayFromWallet } from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>,
    MaterialCommunityIcons: ({ name }: { name: string }) => <Text>{`mci:${name}`}</Text>,
  };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), usePathname: () => '/restaurant/credit' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar', restaurantId: 1 } }),
}));
let mockMayRepay = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => mockMayRepay }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchCreditSummary: jest.fn(),
  repayFromWallet: jest.fn(),
}));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn().mockResolvedValue({ balance: '5000.0000' }) }));

const summaryM = fetchCreditSummary as jest.Mock;
const repay = repayFromWallet as jest.Mock;

const agreement = (o: Record<string, unknown>) => ({
  id: 1, supplierName: 'Acme', storeName: null, status: 'ACTIVE', approvedLimit: '50000', reserved: '0',
  utilized: '0', available: '30000', due: '0', overdue: '0', suspensionReason: null, canFund: true,
  latestRequest: null, ...o,
});
const summary = (o: Record<string, unknown> = {}, agreements: unknown[] = []) => ({
  outletId: 7, approvedLimit: '50000', reserved: '0', utilized: '20000', available: '30000',
  due: '0', overdue: '0', walletRepayEnabled: true, agreements, ...o,
});
const ONE = summary({ due: '600.0000' }, [agreement({ id: 9, supplierName: 'Solo', due: '600.0000', overdue: '100.0000' })]);
const TWO = summary({ due: '1700.0000', overdue: '500.0000' }, [
  agreement({ id: 1, supplierName: 'Zed Foods', due: '600.0000' }),
  agreement({ id: 2, supplierName: 'Acme', due: '1100.0000', overdue: '500.0000' }),
]);

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockMayRepay = true; });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <CreditOverviewScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  summaryM.mockReset();
  repay.mockReset();
});

describe('R30 / B16 on the real overview: the key survives closing the pay sheet', () => {
  it('open, pay 500, network error, close, reopen, 500, pay: the same Idempotency-Key both times', async () => {
    summaryM.mockResolvedValue(ONE);
    repay.mockRejectedValue(new NetworkError());
    renderScreen();

    async function payOtherFive() {
      fireEvent.press(await screen.findByTestId('pay-from-wallet'));
      fireEvent.press(await screen.findByTestId('choice-other'));
      fireEvent.changeText(screen.getByTestId('other-amount'), '500');
      fireEvent.press(screen.getByTestId('pay-button'));
    }

    await payOtherFive();
    await screen.findByTestId('pay-error-other');
    fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByTestId('pay-from-wallet-sheet')).toBeNull());

    await payOtherFive();
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(repay.mock.calls[0][3]).toEqual(expect.any(String));
    expect(repay.mock.calls[1][3]).toBe(repay.mock.calls[0][3]);
  });

  it('U04: pull to refresh while the payment is in flight sends no second POST and keeps the sheet', async () => {
    summaryM.mockResolvedValue(ONE);
    let release!: () => void;
    repay.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({
        repaymentId: 1, amount: '600.0000', walletEntryId: 9, walletBalanceAfter: '100.0000',
        allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' },
      });
    }));
    renderScreen();
    fireEvent.press(await screen.findByTestId('pay-from-wallet'));
    fireEvent.press(await screen.findByTestId('pay-button'));
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    const { RefreshControl } = jest.requireActual('react-native');
    const before = summaryM.mock.calls.length;
    await act(async () => { screen.UNSAFE_getAllByType(RefreshControl)[0]?.props.onRefresh(); });
    await waitFor(() => expect(summaryM.mock.calls.length).toBeGreaterThan(before));
    expect(repay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pay-from-wallet-sheet')).toBeTruthy();
    await act(async () => { release(); });
  });
});

describe('B12 / P04: CREDIT_REPAY gates every way to pay or report', () => {
  it('without it: no Pay, no I paid, Get credit stays', async () => {
    mockMayRepay = false;
    summaryM.mockResolvedValue(TWO);
    renderScreen();
    await screen.findByTestId('credit-actions');
    expect(screen.queryByTestId('pay-from-wallet')).toBeNull();
    expect(screen.queryByTestId('i-paid')).toBeNull();
    expect(screen.getByTestId('get-credit')).toBeTruthy();
    // The dues are still listed: viewing is a different permission.
    expect(screen.getByTestId('dues-row-2')).toBeTruthy();
  });

  it('with it: Pay and I paid are there, and Pay all overdue opens the several sheet', async () => {
    summaryM.mockResolvedValue(TWO);
    renderScreen();
    expect(await screen.findByTestId('i-paid')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pay-from-wallet'));
    expect(await screen.findByTestId('pay-multiple-sheet')).toBeTruthy();
  });

  it('single-supplier case without it: nothing opens a pay sheet', async () => {
    mockMayRepay = false;
    summaryM.mockResolvedValue(ONE);
    renderScreen();
    await screen.findByTestId('credit-actions');
    expect(screen.queryByTestId('pay-from-wallet')).toBeNull();
    expect(screen.queryByTestId('pay-from-wallet-sheet')).toBeNull();
    expect(screen.queryByTestId('pay-multiple-sheet')).toBeNull();
  });
});

describe('D / U rows', () => {
  it('D01: renders with openClaimsAmount, reportableAmount and dueState all absent (old API)', async () => {
    summaryM.mockResolvedValue(summary({ due: '600.0000' }, [
      { ...agreement({ id: 9, supplierName: 'Solo', due: '600.0000' }) },
    ]));
    renderScreen();
    expect(await screen.findByTestId('dues-row-9')).toBeTruthy();
    expect(screen.getByTestId('i-paid')).toBeTruthy();
    expect(screen.queryByTestId('dues-reported-9')).toBeNull();
  });

  it('D03: empty agreements keep the empty state', async () => {
    summaryM.mockResolvedValue(summary({}, []));
    renderScreen();
    expect(await screen.findByText('No credit yet')).toBeTruthy();
  });

  it('D07/D08: a very long supplier name with emoji is cut to one line in the row and the pick list', async () => {
    const name = `Sri Venkateswara Wholesale Fruits & Vegetables Private Limited 🍅🥭🍌 ${'x'.repeat(80)}`;
    summaryM.mockResolvedValue(summary({ due: '600.0000' }, [
      agreement({ id: 1, supplierName: name, due: '300.0000' }),
      agreement({ id: 2, supplierName: 'Other', due: '300.0000' }),
    ]));
    renderScreen();
    const row = await screen.findByTestId('dues-row-1');
    const nameNode = row.findAll((n: { props: Record<string, unknown> }) => n.props?.children === name && n.props.numberOfLines === 1);
    expect(nameNode.length).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId('i-paid'));
    const pick = await screen.findByTestId('pick-supplier-1');
    expect(pick.findAll((n: { props: Record<string, unknown> }) => n.props?.children === name && n.props.numberOfLines === 1).length).toBeGreaterThan(0);
  });

  it('D09: a null supplier name falls back to the store name, then to Supplier', async () => {
    summaryM.mockResolvedValue(summary({ due: '900.0000' }, [
      agreement({ id: 1, supplierName: null, storeName: 'Main Store', due: '300.0000' }),
      agreement({ id: 2, supplierName: null, storeName: null, due: '600.0000' }),
    ]));
    renderScreen();
    expect(await screen.findByText('Main Store')).toBeTruthy();
    expect(screen.getByText('Supplier')).toBeTruthy();
  });

  it('D10: null next due date and amount render the row without a Next line', async () => {
    summaryM.mockResolvedValue(summary({ due: '600.0000' }, [
      agreement({ id: 1, supplierName: 'Acme', due: '600.0000', nextDueDate: null, nextDueAmount: null }),
    ]));
    renderScreen();
    await screen.findByTestId('dues-row-1');
    expect(screen.queryByText(/^Next /)).toBeNull();
  });

  it('D11: money arriving as JSON numbers renders with Indian grouping (U16)', async () => {
    summaryM.mockResolvedValue(summary({ due: 100000 }, [
      agreement({ id: 1, supplierName: 'Acme', due: 100000 }),
    ]));
    renderScreen();
    expect(await screen.findByText('Owed ₹1,00,000.00')).toBeTruthy();
  });

  it('U12: two quick presses on a due row push once; another row is independent', async () => {
    summaryM.mockResolvedValue(TWO);
    renderScreen();
    const row = await screen.findByTestId('dues-row-2');
    fireEvent.press(row);
    fireEvent.press(row);
    expect(mockPush.mock.calls.filter((c) => c[0] === '/restaurant/credit/2')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('dues-row-1'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/credit/1');
  });

  it('U12: two quick presses on Get credit push the request screen once', async () => {
    summaryM.mockResolvedValue(summary({}, [agreement({ id: 1 })]));
    renderScreen();
    const button = await screen.findByTestId('get-credit');
    fireEvent.press(button);
    fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('U12: two quick I paid presses open the claim form once', async () => {
    summaryM.mockResolvedValue(ONE);
    renderScreen();
    const button = await screen.findByTestId('i-paid');
    fireEvent.press(button);
    fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
