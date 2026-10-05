import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PayMultipleSheet } from '@/components/credit/PayMultipleSheet';
import { ApiError } from '@/lib/api/errors';
import { repayFromWallet } from '@/services/credit';
import { fetchWallet } from '@/services/wallet';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  repayFromWallet: jest.fn(),
}));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn() }));

const repay = repayFromWallet as jest.Mock;
const wallet = fetchWallet as jest.Mock;

const agreement = (o: Record<string, unknown>) => ({
  id: 1, supplierName: 'Acme', storeName: null, status: 'ACTIVE', due: '0', overdue: '0', nextDueDate: null, ...o,
}) as never;

const A = agreement({ id: 1, supplierName: 'Sri Balaji', due: '14800.0000', overdue: '7200.0000' });
const B = agreement({ id: 2, supplierName: 'Deccan', due: '5500.0000', overdue: '5500.0000' });
const C = agreement({ id: 3, supplierName: 'Metro Fresh', due: '11100.0000', overdue: '0' });

const ok = (amount: string, after: string) => ({
  repaymentId: 1, amount, walletEntryId: 9, walletBalanceAfter: after,
  allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' },
});
const apiError = (status: number, code: string, details?: Record<string, unknown>) =>
  new ApiError({ code, message: 'server said so', status, details });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let client: QueryClient;
let invalidate: jest.SpyInstance;
const onClose = jest.fn();
const onPayOne = jest.fn();

function renderSheet(agreements = [A, B, C]) {
  return render(
    <QueryClientProvider client={client}>
      <PayMultipleSheet visible onClose={onClose} agreements={agreements} onPayOne={onPayOne} />
    </QueryClientProvider>,
  );
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const payBtn = () => screen.getByTestId('multi-pay');

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
  repay.mockReset();
  wallet.mockResolvedValue({ balance: '77541.6900' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  invalidate = jest.spyOn(client, 'invalidateQueries');
});
afterEach(() => { cleanup(); client.clear(); });

describe('PayMultipleSheet layout', () => {
  it('scrolls only the supplier list: total, wallet line and Pay buttons sit outside the scroll view', () => {
    renderSheet();
    const list = screen.getByTestId('multi-list');
    const inside = (id: string) => {
      for (let n = screen.getByTestId(id).parent; n != null; n = n.parent) if (n === list) return true;
      return false;
    };
    expect(inside('multi-row-1')).toBe(true);
    for (const id of ['multi-total', 'multi-wallet', 'multi-pay', 'multi-one-instead']) expect(inside(id)).toBe(false);
    expect(StyleSheet.flatten(list.props.style).flexShrink).toBe(1);
  });
});

describe('PayMultipleSheet list', () => {
  it('lists suppliers in the given order, overdue checked, the rest unchecked and not overdue', async () => {
    renderSheet();
    expect(screen.getByText('Pay overdue to')).toBeTruthy();
    const rows = screen.getAllByTestId(/^multi-row-/).map((r) => r.props.testID);
    expect(rows).toEqual(['multi-row-1', 'multi-row-2', 'multi-row-3']);
    expect(screen.getByTestId('multi-row-1').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('multi-row-2').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('multi-row-3').props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('₹7,200.00')).toBeTruthy();
    expect(screen.getByText('₹11,100.00')).toBeTruthy();
    expect(screen.getByText('not overdue')).toBeTruthy();
    expect(screen.getAllByText('Overdue')).toHaveLength(2);
    expect(await screen.findByText('Wallet ₹77,541.69')).toBeTruthy();
  });

  it('a supplier whose total is under ₹1 is selectable at its exact amount', () => {
    renderSheet([
      agreement({ id: 1, supplierName: 'One', due: '0.5000', overdue: '0.5000' }),
      agreement({ id: 2, supplierName: 'Two', due: '1000.0000', overdue: '1000.0000' }),
    ]);
    expect(screen.getByTestId('multi-row-1').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('multi-row-1').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('multi-total')).toHaveTextContent('Total ₹1,000.50');
  });

  it('total is the sum of the checked rows and follows the checkboxes', () => {
    renderSheet();
    expect(screen.getByTestId('multi-total')).toHaveTextContent('Total ₹12,700.00');
    expect(payBtn().props.accessibilityLabel).toBe('Pay ₹12,700.00 from wallet');
    press('multi-row-3');
    expect(screen.getByTestId('multi-total')).toHaveTextContent('Total ₹23,800.00');
    press('multi-row-1');
    expect(screen.getByTestId('multi-total')).toHaveTextContent('Total ₹16,600.00');
  });

  it('adds a total that floats would get wrong', () => {
    renderSheet([
      agreement({ id: 1, supplierName: 'One', due: '1.1000', overdue: '1.1000' }),
      agreement({ id: 2, supplierName: 'Two', due: '2.2000', overdue: '2.2000' }),
    ]);
    expect(screen.getByTestId('multi-total')).toHaveTextContent('Total ₹3.30');
  });

  it('disables Pay when nothing is checked, and offline', () => {
    renderSheet();
    press('multi-row-1');
    press('multi-row-2');
    expect(payBtn().props.accessibilityState?.disabled).toBe(true);
  });

  it('disables Pay offline', () => {
    mockOffline = true;
    renderSheet();
    expect(payBtn().props.accessibilityState?.disabled).toBe(true);
  });

  it('keeps Pay orange, never purple', () => {
    renderSheet();
    const style = StyleSheet.flatten(payBtn().props.style);
    expect(style.backgroundColor).toBe(Colors.primary);
    expect(JSON.stringify(screen.toJSON())).not.toContain(Colors.credit);
  });

  it('Pay one supplier instead hands over to the single-supplier path', () => {
    renderSheet();
    press('multi-one-instead');
    expect(onPayOne).toHaveBeenCalledTimes(1);
    expect(repay).not.toHaveBeenCalled();
  });
});

describe('PayMultipleSheet paying', () => {
  it('pays one after another: the second starts only after the first answers', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    repay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderSheet();
    press('multi-pay');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    expect(repay.mock.calls[0]?.[1]).toBe(1);
    expect(repay.mock.calls[0]?.[2]).toEqual({ amount: 7200 });
    // Still waiting: nothing may have started for the second, and nothing is called paid.
    await act(async () => { await Promise.resolve(); });
    expect(repay).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Paid/)).toBeNull();
    expect(screen.getByText('Paying…')).toBeTruthy();
    await act(async () => { first.resolve(ok('7200.0000', '70341.6900')); });
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(repay.mock.calls[1]?.[1]).toBe(2);
    expect(screen.queryByText('Paid 2 of 2')).toBeNull();
    await act(async () => { second.resolve(ok('5500.0000', '64841.6900')); });
    expect(await screen.findByText('Paid 2 of 2')).toBeTruthy();
    expect(screen.getByText('Paid ₹7,200.00')).toBeTruthy();
    expect(screen.getByText('Paid ₹5,500.00')).toBeTruthy();
    expect(screen.getByTestId('multi-balance-now')).toHaveTextContent('Wallet balance now ₹64,841.69');
    expect(screen.queryByTestId('multi-retry')).toBeNull();
    // Each repayment has its own key.
    expect(repay.mock.calls[0]?.[3]).not.toBe(repay.mock.calls[1]?.[3]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['outlet', 7, 'wallet'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['outlet', 7, 'credit'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-agreement', 1] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-agreement', 2] });
    press('multi-done');
    expect(onClose).toHaveBeenCalled();
  });

  it('a failure does not stop the next supplier; the short row offers Add money', async () => {
    repay
      .mockRejectedValueOnce(apiError(422, 'WALLET_INSUFFICIENT_BALANCE', { shortBy: 700, balance: 6500 }))
      .mockResolvedValueOnce(ok('5500.0000', '1000.0000'));
    renderSheet();
    press('multi-pay');
    expect(await screen.findByText('Paid 1 of 2')).toBeTruthy();
    expect(repay).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Not paid: Wallet is ₹700.00 short')).toBeTruthy();
    expect(screen.getByText('Paid ₹5,500.00')).toBeTruthy();
    expect(screen.getByTestId('multi-balance-now')).toHaveTextContent('Wallet balance now ₹1,000.00');
    fireEvent.press(screen.getByTestId('multi-add-money-1'));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/add-money');
  });

  it('says Nothing was paid when all fail, with plain reasons and no balance line', async () => {
    repay
      .mockRejectedValueOnce(apiError(422, 'CREDIT_OVERPAYMENT', { outstanding: 10 }))
      .mockRejectedValueOnce(apiError(403, 'FORBIDDEN'));
    renderSheet();
    press('multi-pay');
    expect(await screen.findByText('Nothing was paid')).toBeTruthy();
    expect(screen.getByText('Not paid: You owe less than that now')).toBeTruthy();
    expect(screen.getByText('Not paid: Not available yet')).toBeTruthy();
    expect(screen.queryByTestId('multi-balance-now')).toBeNull();
    expect(screen.queryByText(/^Paid/)).toBeNull();
  });

  it('shows the server message for any other failure', async () => {
    repay.mockRejectedValueOnce(apiError(500, 'INTERNAL', undefined)).mockResolvedValueOnce(ok('5500.0000', '1.0000'));
    renderSheet();
    press('multi-pay');
    expect(await screen.findByText('Not paid: server said so')).toBeTruthy();
  });

  it('Try again sends only the failed rows, with the same keys when the outcome was unknown', async () => {
    repay
      .mockRejectedValueOnce(apiError(503, 'UNAVAILABLE'))
      .mockResolvedValueOnce(ok('5500.0000', '1000.0000'))
      .mockResolvedValueOnce(ok('7200.0000', '900.0000'));
    renderSheet();
    press('multi-pay');
    expect(await screen.findByText('Paid 1 of 2')).toBeTruthy();
    const firstKey = repay.mock.calls[0]?.[3];
    press('multi-retry');
    expect(await screen.findByText('Paid 2 of 2')).toBeTruthy();
    expect(repay).toHaveBeenCalledTimes(3);
    expect(repay.mock.calls[2]?.[1]).toBe(1);
    expect(repay.mock.calls[2]?.[2]).toEqual({ amount: 7200 });
    expect(repay.mock.calls[2]?.[3]).toBe(firstKey);
    expect(screen.getByTestId('multi-balance-now')).toHaveTextContent('Wallet balance now ₹900.00');
  });

  it('a refused row gets a fresh key on retry, as the single-supplier sheet does', async () => {
    repay
      .mockRejectedValueOnce(apiError(422, 'WALLET_INSUFFICIENT_BALANCE', { shortBy: 1, balance: 1 }))
      .mockResolvedValueOnce(ok('5500.0000', '1.0000'))
      .mockResolvedValueOnce(ok('7200.0000', '1.0000'));
    renderSheet();
    press('multi-pay');
    await screen.findByText('Paid 1 of 2');
    press('multi-retry');
    await screen.findByText('Paid 2 of 2');
    expect(repay.mock.calls[2]?.[3]).not.toBe(repay.mock.calls[0]?.[3]);
  });

  it('cannot be started twice while paying', async () => {
    const first = deferred<unknown>();
    repay.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok('5500.0000', '1.0000'));
    renderSheet();
    press('multi-pay');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    await act(async () => { first.resolve(ok('7200.0000', '1.0000')); });
    await screen.findByText('Paid 2 of 2');
    expect(repay).toHaveBeenCalledTimes(2);
  });
});

describe('PayMultipleSheet waiting reports (pay twice)', () => {
  const WARNING_START = /You reported ₹4,000\.00 paid outside the app and your supplier hasn't confirmed it yet\. If you also pay from your wallet, you may pay twice\./;
  const D = agreement({
    id: 4, supplierName: 'Greens', due: '5000.0000', overdue: '5000.0000',
    openClaimsAmount: '4000.0000', reportableAmount: 1000,
  });
  const E = agreement({
    id: 5, supplierName: 'Spice Hub', due: '6000.0000', overdue: '3000.0000',
    openClaimsAmount: '500.0000', reportableAmount: 5500,
  });

  it('warns, names the supplier and relabels the button when a checked row overlaps', () => {
    renderSheet([D, B]);
    expect(screen.getByTestId('multi-waiting-4')).toHaveTextContent('₹4,000.00 reported, waiting for supplier');
    expect(screen.queryByTestId('multi-waiting-2')).toBeNull();
    expect(screen.getByTestId('multi-double-pay-warning')).toHaveTextContent(WARNING_START);
    expect(screen.getByTestId('multi-double-pay-warning')).toHaveTextContent(/Greens/);
    expect(payBtn().props.accessibilityLabel).toBe('Pay anyway ₹10,500.00 from wallet');
  });

  it('shows the waiting line but no warning when the payment does not exceed what can still be reported', () => {
    renderSheet([E, B]);
    expect(screen.getByTestId('multi-waiting-5')).toHaveTextContent('₹500.00 reported, waiting for supplier');
    expect(screen.queryByTestId('multi-double-pay-warning')).toBeNull();
    expect(payBtn().props.accessibilityLabel).toBe('Pay ₹8,500.00 from wallet');
  });

  it('only a CHECKED overlapping row counts', () => {
    renderSheet([D, B]);
    press('multi-row-4');
    expect(screen.queryByTestId('multi-double-pay-warning')).toBeNull();
    expect(payBtn().props.accessibilityLabel).toBe('Pay ₹5,500.00 from wallet');
  });

  it('shows nothing extra when the server sent no reports data (old API)', () => {
    renderSheet();
    expect(screen.queryByTestId('multi-double-pay-warning')).toBeNull();
    expect(screen.queryByTestId('multi-waiting-1')).toBeNull();
    expect(payBtn().props.accessibilityLabel).toBe('Pay ₹12,700.00 from wallet');
  });

  it('Pay anyway still pays each supplier in turn with the same amounts', async () => {
    repay.mockResolvedValue(ok('5000.00', '100.0000'));
    renderSheet([D]);
    press('multi-pay');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    expect(repay.mock.calls[0][2]).toMatchObject({ amount: 5000 });
  });
});

describe('PayMultipleSheet when nothing is overdue', () => {
  it('says so under the title and keeps Pay disabled until a supplier is ticked', () => {
    renderSheet([C]);
    expect(screen.getByTestId('multi-nothing-overdue')).toHaveTextContent('Nothing is overdue. Tick the suppliers you want to pay.');
    expect(screen.getByTestId('multi-total')).toHaveTextContent('Total ₹0.00');
    expect(payBtn().props.accessibilityState.disabled).toBe(true);
    press('multi-row-3');
    expect(payBtn().props.accessibilityState.disabled).toBe(false);
  });

  it('does not say it when something is overdue', () => {
    renderSheet();
    expect(screen.queryByTestId('multi-nothing-overdue')).toBeNull();
  });
});
