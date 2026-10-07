import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PayFromWalletSheet } from '@/components/credit/PayFromWalletSheet';
import { PayMultipleSheet } from '@/components/credit/PayMultipleSheet';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { repayFromWallet } from '@/services/credit';
import { fetchWallet } from '@/services/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  repayFromWallet: jest.fn(),
}));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn() }));

const repay = repayFromWallet as jest.Mock;
const wallet = fetchWallet as jest.Mock;

const RESPONSE = {
  repaymentId: 1, amount: '500.0000', walletEntryId: 9, walletBalanceAfter: '100.0000',
  allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' },
};
const apiError = (status: number, code: string, details?: Record<string, unknown>) =>
  new ApiError({ code, message: 'server said', status, details });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

let client: QueryClient;
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const payButton = () => screen.getByTestId('pay-button');
const disabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => el.props.accessibilityState?.disabled === true;
const keyOf = (call: number) => repay.mock.calls[call][3] as string;

const SINGLE = { agreementId: 3, supplierName: 'Acme Foods', due: '1200.0000', overdue: '500.0000' };

/** Mounts and unmounts the sheet the way the overview does: `{target != null && <Sheet/>}`. */
function Harness({ open, ...rest }: { open: boolean } & Partial<React.ComponentProps<typeof PayFromWalletSheet>>) {
  return (
    <QueryClientProvider client={client}>
      {open && <PayFromWalletSheet visible onClose={() => {}} onPaid={() => {}} {...SINGLE} {...rest} />}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  repay.mockReset();
  wallet.mockReset();
  wallet.mockResolvedValue({ balance: '2500.0000' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => { cleanup(); client.clear(); jest.useRealTimers(); });

describe('R30 / B16: the attempt key outlives the sheet', () => {
  async function payOther(amount: string) {
    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), amount);
    press('pay-button');
  }

  it('open, pay 500, network error, close, reopen, 500, pay: the SAME Idempotency-Key both times', async () => {
    repay.mockRejectedValue(new NetworkError());
    const view = render(<Harness open />);
    await payOther('500');
    await screen.findByTestId('pay-error-other');
    expect(repay).toHaveBeenCalledTimes(1);

    view.rerender(<Harness open={false} />);
    expect(screen.queryByTestId('pay-from-wallet-sheet')).toBeNull();
    view.rerender(<Harness open />);
    await payOther('500');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
    expect(repay.mock.calls[1][2]).toEqual({ amount: 500 });
  });

  it('a 5xx keeps the key across the close too, and an in-progress answer does as well', async () => {
    repay.mockRejectedValueOnce(apiError(503, 'UNAVAILABLE'))
      .mockRejectedValueOnce(apiError(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS'))
      .mockRejectedValue(apiError(503, 'UNAVAILABLE'));
    const view = render(<Harness open />);
    await payOther('500');
    await screen.findByTestId('pay-error-other');
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open />);
    await payOther('500');
    await screen.findByTestId('pay-error-processing');
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open />);
    await payOther('500');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(3));
    expect(keyOf(1)).toBe(keyOf(0));
    expect(keyOf(2)).toBe(keyOf(0));
  });

  it('a different amount after reopening is a different attempt: new key', async () => {
    repay.mockRejectedValue(new NetworkError());
    const view = render(<Harness open />);
    await payOther('500');
    await screen.findByTestId('pay-error-other');
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open />);
    await payOther('600');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('a definitive refusal ends the attempt: reopen and pay again gets a new key', async () => {
    repay.mockRejectedValueOnce(apiError(422, 'SOMETHING_ELSE')).mockRejectedValue(new NetworkError());
    const view = render(<Harness open />);
    await payOther('500');
    await screen.findByTestId('pay-error-other');
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open />);
    await payOther('500');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('success ends the attempt: the next payment of the same amount gets a new key', async () => {
    repay.mockResolvedValue(RESPONSE);
    const view = render(<Harness open />);
    await payOther('500');
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open />);
    await payOther('500');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('the screen showing different figures on reopen (the due moved) starts a new attempt', async () => {
    repay.mockRejectedValue(new NetworkError());
    const view = render(<Harness open />);
    await payOther('500');
    await screen.findByTestId('pay-error-other');
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open due="700.0000" overdue="0" />);
    await payOther('500');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('the invoice sheet keeps its key per invoice too', async () => {
    repay.mockRejectedValue(new NetworkError());
    const invoice = { id: 42, invoiceNumber: 'INV-42', outstanding: '300.0000' };
    const view = render(<Harness open invoice={invoice} />);
    press('pay-button');
    await screen.findByTestId('pay-error-other');
    view.rerender(<Harness open={false} />);
    view.rerender(<Harness open invoice={invoice} />);
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
    expect(repay.mock.calls[1][2]).toEqual({ amount: 300, invoiceIds: [42] });
  });
});

describe('PayMultipleSheet keeps its keys per supplier and amount (R30)', () => {
  const A = { id: 1, supplierName: 'Sri Balaji', storeName: null, status: 'ACTIVE', due: '14800.0000', overdue: '7200.0000' } as never;
  const B = { id: 2, supplierName: 'Deccan', storeName: null, status: 'ACTIVE', due: '5500.0000', overdue: '5500.0000' } as never;

  function Multi({ open }: { open: boolean }) {
    return (
      <QueryClientProvider client={client}>
        {open && <PayMultipleSheet visible onClose={() => {}} agreements={[A, B]} onPayOne={() => {}} />}
      </QueryClientProvider>
    );
  }

  it('network error on both rows, close, reopen, pay: each supplier is sent its same key again', async () => {
    repay.mockRejectedValue(new NetworkError());
    const view = render(<Multi open />);
    press('multi-pay');
    await screen.findByTestId('multi-results');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    const first = new Map(repay.mock.calls.map((c) => [c[1], c[3]]));
    view.rerender(<Multi open={false} />);
    view.rerender(<Multi open />);
    press('multi-pay');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(4));
    const second = new Map(repay.mock.calls.slice(2).map((c) => [c[1], c[3]]));
    expect(second.get(1)).toBe(first.get(1));
    expect(second.get(2)).toBe(first.get(2));
    expect(first.get(1)).not.toBe(first.get(2));
  });

  it('the single and the several sheet share an undecided attempt for the same supplier and amount', async () => {
    repay.mockRejectedValue(new NetworkError());
    const view = render(<Multi open />);
    press('multi-pay');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    const keyForB = repay.mock.calls.find((c) => c[1] === 2)?.[3];
    view.unmount();
    render(<Harness open agreementId={2} supplierName="Deccan" due="5500.0000" overdue="5500.0000" />);
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).toBe(keyForB);
  });

  it('WALLET_ON_HOLD names the hold on the row, with no Add money', async () => {
    repay.mockRejectedValue(apiError(403, 'WALLET_ON_HOLD'));
    render(<Multi open />);
    press('multi-pay');
    expect(await screen.findAllByText('Not paid: Your wallet is on hold. Please contact support.')).toHaveLength(2);
    expect(screen.queryByText(/Not available yet/)).toBeNull();
    expect(screen.queryByTestId('multi-add-money-1')).toBeNull();
  });

  it('FORBIDDEN still says Not available yet', async () => {
    repay.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    render(<Multi open />);
    press('multi-pay');
    expect((await screen.findAllByText('Not paid: Not available yet')).length).toBe(2);
  });

  it('KEY_REUSE on a row refreshes first and holds Try again until that is done', async () => {
    repay.mockRejectedValue(apiError(409, 'IDEMPOTENCY_KEY_REUSE'));
    render(<Multi open />);
    await waitFor(() => expect(wallet).toHaveBeenCalledTimes(1));
    const slow = deferred<{ balance: string }>();
    wallet.mockReturnValue(slow.promise);
    press('multi-pay');
    expect((await screen.findAllByText(/Your earlier payment may have gone through/)).length).toBe(2);
    await waitFor(() => expect(wallet.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(disabled(screen.getByTestId('multi-retry'))).toBe(true);
    await act(async () => { slow.resolve({ balance: '1.0000' }); });
    await waitFor(() => expect(disabled(screen.getByTestId('multi-retry'))).toBe(false));
    press('multi-retry');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(4));
    expect(repay.mock.calls[2][3]).not.toBe(repay.mock.calls[0][3]);
  });
});

describe('R22 / B1: IDEMPOTENCY_KEY_REUSE never silently allows a new debit', () => {
  it('refetches the wallet first, shows the message, keeps Pay off until the refetch is done, then a NEW key', async () => {
    repay.mockRejectedValueOnce(apiError(409, 'IDEMPOTENCY_KEY_REUSE')).mockResolvedValue(RESPONSE);
    render(<Harness open />);
    await screen.findByText('Wallet balance ₹2,500.00');
    const slow = deferred<{ balance: string }>();
    wallet.mockReturnValue(slow.promise);

    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), '500');
    press('pay-button');

    const note = await screen.findByTestId('pay-error-reuse');
    expect(note).toHaveTextContent(
      "Your earlier payment may have gone through. We've refreshed your balance: please check before paying again.");
    await waitFor(() => expect(wallet.mock.calls.length).toBeGreaterThanOrEqual(2));
    // The refetch has not finished: paying again is not possible yet.
    expect(disabled(payButton())).toBe(true);
    fireEvent.press(payButton());
    expect(repay).toHaveBeenCalledTimes(1);

    await act(async () => { slow.resolve({ balance: '2000.0000' }); });
    await screen.findByText('Wallet balance ₹2,000.00');
    await waitFor(() => expect(disabled(payButton())).toBe(false));
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('also re-reads the credit summary and the agreement', async () => {
    repay.mockRejectedValue(apiError(409, 'IDEMPOTENCY_KEY_REUSE'));
    const refetch = jest.spyOn(client, 'refetchQueries');
    render(<Harness open />);
    press('pay-button');
    await screen.findByTestId('pay-error-reuse');
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    const keys = refetch.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['outlet', 7, 'wallet']),
      JSON.stringify(['outlet', 7, 'credit']),
      JSON.stringify(['credit-agreement', 3]),
    ]));
  });
});

describe('B3: the earlier-failed and still-running answers', () => {
  it('IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED is definitive: plain message, and the next tap uses a NEW key', async () => {
    repay.mockRejectedValueOnce(apiError(409, 'IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED')).mockResolvedValue(RESPONSE);
    render(<Harness open />);
    press('pay-button');
    expect(await screen.findByTestId('pay-error-failed')).toHaveTextContent("That didn't go through. Please try again.");
    expect(screen.queryByText('server said')).toBeNull();
    expect(disabled(payButton())).toBe(false);
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('IDEMPOTENT_REQUEST_IN_PROGRESS keeps the key, says Still processing and looks again after a short delay', async () => {
    jest.useFakeTimers();
    repay.mockRejectedValueOnce(apiError(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS')).mockResolvedValue(RESPONSE);
    render(<Harness open />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.press(payButton());
    expect(await screen.findByTestId('pay-error-processing')).toHaveTextContent("Still processing… we'll check again.");
    const before = wallet.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(4100); });
    await waitFor(() => expect(wallet.mock.calls.length).toBeGreaterThan(before));
    fireEvent.press(payButton());
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
  });
});

describe('B11 / U19: wallet on hold', () => {
  it('says the wallet is on hold, not that paying is unavailable, and offers no Add money', async () => {
    repay.mockRejectedValue(apiError(403, 'WALLET_ON_HOLD'));
    render(<Harness open />);
    press('pay-button');
    expect(await screen.findByTestId('pay-error-hold')).toHaveTextContent('Your wallet is on hold. Please contact support.');
    expect(screen.queryByText(/isn't available yet/)).toBeNull();
    expect(screen.queryByTestId('add-money')).toBeNull();
  });

  it('FORBIDDEN keeps its own wording', async () => {
    repay.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    render(<Harness open />);
    press('pay-button');
    expect(await screen.findByText("Paying credit from your wallet isn't available yet.")).toBeTruthy();
  });
});

describe('token expiry mid-flow', () => {
  it('a 401 says Please sign in again and keeps what was typed', async () => {
    repay.mockRejectedValue(apiError(401, 'UNAUTHENTICATED'));
    render(<Harness open />);
    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), '250.50');
    press('pay-button');
    expect(await screen.findByTestId('pay-error-auth')).toHaveTextContent('Please sign in again.');
    expect(screen.getByTestId('other-amount').props.value).toBe('250.50');
  });
});

describe('M03 / B5: nothing stranded under ₹1', () => {
  it('Full due is selectable and payable when it is below ₹1', async () => {
    repay.mockResolvedValue(RESPONSE);
    render(<Harness open due="0.4000" overdue="0" />);
    expect(screen.getByText('Full due ₹0.40')).toBeTruthy();
    expect(disabled(payButton())).toBe(false);
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalled());
    expect(repay.mock.calls[0][2]).toEqual({ amount: 0.4 });
  });

  it('an invoice with ₹0.75 left is payable in full', async () => {
    repay.mockResolvedValue(RESPONSE);
    render(<Harness open invoice={{ id: 5, invoiceNumber: 'INV-5', outstanding: '0.7500' }} />);
    expect(disabled(payButton())).toBe(false);
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalled());
    expect(repay.mock.calls[0][2]).toEqual({ amount: 0.75, invoiceIds: [5] });
  });

  it('Other amount: below ₹1 is refused unless it is exactly the full due', () => {
    render(<Harness open due="0.4000" overdue="0" />);
    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), '0.30');
    expect(disabled(payButton())).toBe(true);
    expect(screen.getByText('Enter at least ₹1.00.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('other-amount'), '0.40');
    expect(disabled(payButton())).toBe(false);
  });

  it('typing an amount that leaves 0.50 shows the hint, and Pay full amount selects the full due', async () => {
    repay.mockResolvedValue(RESPONSE);
    render(<Harness open due="1000.0000" overdue="0" />);
    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), '999.50');
    expect(screen.getByTestId('sliver-hint')).toHaveTextContent(/This would leave ₹0\.50 owed\. Pay the full ₹1,000\.00 instead\?/);
    press('pay-full-instead');
    expect(screen.getByLabelText('Full due ₹1,000.00').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByTestId('sliver-hint')).toBeNull();
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalled());
    expect(repay.mock.calls[0][2]).toEqual({ amount: 1000 });
  });

  it.each([['999', false], ['500', false], ['1000', false], ['999.99', true], ['999.01', true]])(
    'amount %s: hint shown = %s', (value, shown) => {
      render(<Harness open due="1000.0000" overdue="0" />);
      press('choice-other');
      fireEvent.changeText(screen.getByTestId('other-amount'), value);
      expect(screen.queryByTestId('sliver-hint') != null).toBe(shown);
    });

  it('the hint does not block paying the typed amount', () => {
    render(<Harness open due="1000.0000" overdue="0" />);
    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), '999.50');
    expect(disabled(payButton())).toBe(false);
  });

  it('PayMultipleSheet: a supplier total of ₹0.40 is checked and sent exactly', async () => {
    repay.mockResolvedValue(RESPONSE);
    const tiny = { id: 9, supplierName: 'Tiny', storeName: null, status: 'ACTIVE', due: '0.4000', overdue: '0.4000' } as never;
    render(
      <QueryClientProvider client={client}>
        <PayMultipleSheet visible onClose={() => {}} agreements={[tiny]} onPayOne={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('multi-row-9').props.accessibilityState.checked).toBe(true);
    press('multi-pay');
    await waitFor(() => expect(repay).toHaveBeenCalled());
    expect(repay.mock.calls[0][2]).toEqual({ amount: 0.4 });
  });
});

describe('U11: back during an in-flight payment', () => {
  it('no state update warning after unmount; the outcome is still handled by invalidation and a toast', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const d = deferred<typeof RESPONSE>();
    repay.mockReturnValue(d.promise);
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const view = render(<Harness open onPaid={onPaid} onClose={onClose} />);
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => { d.resolve(RESPONSE); });
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Paid ₹500.00 to Acme Foods', 'success');
    expect(invalidate).toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('U04: a refresh while paying does not send a second request', () => {
  it('refetching the wallet during the request leaves one POST and the sheet in place', async () => {
    const d = deferred<typeof RESPONSE>();
    repay.mockReturnValue(d.promise);
    render(<Harness open />);
    await screen.findByText('Wallet balance ₹2,500.00');
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    await act(async () => { await client.refetchQueries({ queryKey: ['outlet', 7, 'wallet'] }); });
    expect(repay).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pay-from-wallet-sheet')).toBeTruthy();
    expect(disabled(payButton())).toBe(true);
    await act(async () => { d.resolve(RESPONSE); });
  });
});

describe('U13: every balance screen is refreshed after a payment', () => {
  it('invalidates the wallet, the outlet credit tree (summary, invoices, invoice detail) and the agreement', async () => {
    repay.mockResolvedValue(RESPONSE);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    render(<Harness open />);
    press('pay-button');
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['outlet', 7, 'wallet']),
      JSON.stringify(['outlet', 7, 'credit']),
      JSON.stringify(['credit-agreement', 3]),
    ]));
  });

  it('an unknown outcome also re-reads them, so the truth shows up without a pull to refresh', async () => {
    repay.mockRejectedValue(new NetworkError());
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    render(<Harness open />);
    press('pay-button');
    await screen.findByTestId('pay-error-other');
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['outlet', 7, 'wallet']),
      JSON.stringify(['outlet', 7, 'credit']),
    ]));
  });
});
