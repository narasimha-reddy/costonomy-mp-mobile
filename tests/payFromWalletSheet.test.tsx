import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Keyboard, KeyboardAvoidingView } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PayFromWalletSheet } from '@/components/credit/PayFromWalletSheet';
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let client: QueryClient;
let invalidate: jest.SpyInstance;
const onClose = jest.fn();
const onPaid = jest.fn();

function renderSheet(props: Partial<React.ComponentProps<typeof PayFromWalletSheet>> = {}) {
  return render(
    <QueryClientProvider client={client}>
      <PayFromWalletSheet
        visible
        onClose={onClose}
        agreementId={3}
        supplierName="Acme Foods"
        due="1200.0000"
        overdue="500.0000"
        onPaid={onPaid}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const payButton = () => screen.getByTestId('pay-button');
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const apiError = (status: number, code: string, details?: Record<string, unknown>) =>
  new ApiError({ code, message: 'server said', status, details });

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
  repay.mockReset();
  wallet.mockResolvedValue({ balance: '2500.0000' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  invalidate = jest.spyOn(client, 'invalidateQueries');
});

afterEach(() => { client.clear(); });

describe('PayFromWalletSheet choices', () => {
  it('defaults to the overdue amount when something is overdue', async () => {
    renderSheet();
    expect(screen.getByText('Pay Acme Foods')).toBeTruthy();
    expect(screen.getByText('Full due ₹1,200.00')).toBeTruthy();
    expect(screen.getByText('Overdue only ₹500.00')).toBeTruthy();
    expect(screen.getByText('Other amount')).toBeTruthy();
    expect(screen.getByLabelText('Overdue only ₹500.00').props.accessibilityState.selected).toBe(true);
    expect(payButton().props.accessibilityLabel).toBe('Pay ₹500.00 from wallet');
    expect(await screen.findByText('Wallet balance ₹2,500.00')).toBeTruthy();
    expect(screen.getByText(/oldest invoices first/)).toBeTruthy();
  });

  it('defaults to the full due and hides overdue-only when nothing is overdue', () => {
    renderSheet({ overdue: 0 });
    expect(screen.queryByText(/Overdue only/)).toBeNull();
    expect(payButton().props.accessibilityLabel).toBe('Pay ₹1,200.00 from wallet');
  });

  it('uses the primary variant, not purple', () => {
    renderSheet();
    const flat = JSON.stringify(payButton().props.style);
    expect(flat).toContain(Colors.primary);
    expect(flat).not.toContain(Colors.credit);
  });

  it.each([
    ['0.5', false], ['1', true], ['1.005', false], ['1.50', true], ['', false],
  ])('other amount %p enabled=%p', (value, enabled) => {
    renderSheet();
    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), value);
    expect(payButton().props.accessibilityState.disabled).toBe(!enabled);
  });

  it('is disabled while offline', () => {
    mockOffline = true;
    renderSheet();
    expect(payButton().props.accessibilityState.disabled).toBe(true);
  });
});

describe('PayFromWalletSheet request', () => {
  it('sends invoiceIds in invoice mode', async () => {
    repay.mockResolvedValue(RESPONSE);
    renderSheet({ invoice: { id: 42, invoiceNumber: 'INV-42', outstanding: '300.0000' } });
    expect(screen.getByText('This pays invoice INV-42.')).toBeTruthy();
    expect(screen.getByText('Full ₹300.00')).toBeTruthy();
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalled());
    expect(repay).toHaveBeenCalledWith('tok', 3, { amount: 300, invoiceIds: [42] }, expect.any(String));
  });

  it('omits invoiceIds in agreement mode', async () => {
    repay.mockResolvedValue(RESPONSE);
    renderSheet();
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalled());
    const body = repay.mock.calls[0][2];
    expect(body).toEqual({ amount: 500 });
    expect('invoiceIds' in body).toBe(false);
  });

  it('reuses the key on a retry of the same attempt and mints a new one for a new amount', async () => {
    repay.mockRejectedValueOnce(apiError(503, 'UNAVAILABLE')).mockRejectedValueOnce(apiError(503, 'UNAVAILABLE'));
    renderSheet();
    press('pay-button');
    await screen.findByTestId('pay-error-other');
    press('retry');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(2));
    expect(repay.mock.calls[1][3]).toBe(repay.mock.calls[0][3]);

    await screen.findByTestId('pay-error-other');
    press('choice-full');
    repay.mockRejectedValueOnce(apiError(503, 'UNAVAILABLE'));
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(3));
    expect(repay.mock.calls[2][3]).not.toBe(repay.mock.calls[0][3]);
  });

  it('sends one request on a double tap', async () => {
    const d = deferred<typeof RESPONSE>();
    repay.mockReturnValue(d.promise);
    renderSheet();
    press('pay-button');
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    expect(payButton().props.accessibilityState.disabled).toBe(true);
    await act(async () => { d.resolve(RESPONSE); });
  });

  it('succeeds in order: no toast before the response, then refresh, toast, close, onPaid', async () => {
    const d = deferred<typeof RESPONSE>();
    repay.mockReturnValue(d.promise);
    renderSheet();
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalled());
    expect(mockToast).not.toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();
    await act(async () => { d.resolve(RESPONSE); });
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(RESPONSE));
    expect(mockToast).toHaveBeenCalledWith('Paid ₹500.00 to Acme Foods', 'success');
    expect(onClose).toHaveBeenCalled();
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(['outlet', 7, 'wallet']));
    expect(keys).toContain(JSON.stringify(['outlet', 7, 'credit']));
  });
});

describe('PayFromWalletSheet errors', () => {
  it('shows the short-by note and an Add money action after the server says so', async () => {
    repay.mockRejectedValue(apiError(422, 'WALLET_INSUFFICIENT_BALANCE', { shortBy: 250, balance: 250 }));
    renderSheet();
    press('pay-button');
    expect(await screen.findByText("You're ₹250.00 short")).toBeTruthy();
    press('add-money');
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/add-money');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('refetches the wallet balance when the sheet becomes visible again', async () => {
    const view = renderSheet({ visible: false });
    await waitFor(() => expect(wallet).toHaveBeenCalledTimes(1));
    view.rerender(
      <QueryClientProvider client={client}>
        <PayFromWalletSheet
          visible onClose={onClose} agreementId={3} supplierName="Acme Foods"
          due="1200.0000" overdue="500.0000" onPaid={onPaid}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(wallet).toHaveBeenCalledTimes(2));
  });

  it('explains an overpayment and refreshes the credit queries', async () => {
    repay.mockRejectedValue(apiError(422, 'CREDIT_OVERPAYMENT', { outstanding: 100 }));
    renderSheet();
    press('pay-button');
    expect(await screen.findByText("That's more than the ₹100.00 you owe.")).toBeTruthy();
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(['outlet', 7, 'credit']));
  });

  it('says paying from the wallet is not available on FORBIDDEN', async () => {
    repay.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    renderSheet();
    press('pay-button');
    expect(await screen.findByText("Paying credit from your wallet isn't available yet.")).toBeTruthy();
  });

  it('shows the server message with Retry for any other error', async () => {
    repay.mockRejectedValue(apiError(500, 'BOOM'));
    renderSheet();
    press('pay-button');
    expect(await screen.findByText('server said')).toBeTruthy();
    expect(screen.getByLabelText('Retry')).toBeTruthy();
  });
});

describe('PayFromWalletSheet with the keyboard open', () => {
  it('keeps the whole body in a scroll container that persists taps, inside a keyboard-avoiding wrapper', () => {
    renderSheet();
    press('choice-other');
    const avoiding = screen.getByTestId('pay-from-wallet-sheet-keyboard-avoiding');
    const wrapper = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(wrapper.props.behavior).toBe('padding');
    expect(wrapper.props.enabled).toBe(true);
    const scroll = screen.getByTestId('pay-from-wallet-sheet-scroll');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    // The amount, the helper text and the Pay button are all inside what scrolls.
    expect(within(scroll).getByTestId('other-amount')).toBeTruthy();
    expect(within(scroll).getByText(/oldest invoices first/)).toBeTruthy();
    expect(within(scroll).getByTestId('pay-button')).toBeTruthy();
    // And the scroll container is inside the avoiding wrapper.
    expect(within(avoiding).getByTestId('pay-from-wallet-sheet-scroll')).toBeTruthy();
  });

  it('shows the amount error inside the scroll container too', () => {
    renderSheet();
    press('choice-other');
    fireEvent.changeText(screen.getByTestId('other-amount'), '0.5');
    expect(within(screen.getByTestId('pay-from-wallet-sheet-scroll')).getByText('Enter at least ₹1.00.')).toBeTruthy();
  });

  it('uses a Done key that closes the keyboard', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    renderSheet();
    press('choice-other');
    const input = screen.getByTestId('other-amount');
    expect(input.props.returnKeyType).toBe('done');
    fireEvent(input, 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('dismisses the keyboard when the choice moves away from Other amount, not when it moves to it', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    renderSheet();
    press('choice-other');
    expect(dismiss).not.toHaveBeenCalled();
    press('choice-full');
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });
});

describe('PayFromWalletSheet waiting reports (pay twice)', () => {
  const WARNING = "You told your supplier you paid ₹500.00 directly, and they haven't confirmed it yet. If you also pay from your wallet, you may pay twice.";
  const reported = { openClaimsAmount: '500.0000', reportableAmount: 700 };

  it('agreement: warns and relabels when the amount exceeds what can still be reported', () => {
    renderSheet(reported);
    // Overdue only 500 <= 700 can still be reported: no overlap.
    expect(screen.queryByTestId('double-pay-warning')).toBeNull();
    expect(payButton().props.accessibilityLabel).toBe('Pay ₹500.00 from wallet');
    press('choice-full');
    expect(screen.getByTestId('double-pay-warning')).toBeTruthy();
    expect(screen.getByText(WARNING)).toBeTruthy();
    expect(payButton().props.accessibilityLabel).toBe('Pay anyway ₹1,200.00 from wallet');
  });

  it('agreement: no warning without waiting reports, or without the data', () => {
    renderSheet({ openClaimsAmount: '0.0000', reportableAmount: 0 });
    press('choice-full');
    expect(screen.queryByTestId('double-pay-warning')).toBeNull();
    expect(payButton().props.accessibilityLabel).toBe('Pay ₹1,200.00 from wallet');
  });

  it('agreement: absent data (old API) shows no warning', () => {
    renderSheet();
    press('choice-full');
    expect(screen.queryByTestId('double-pay-warning')).toBeNull();
  });

  it('invoice: compares with the invoice reportable amount and shows the invoice waiting total', () => {
    renderSheet({
      invoice: { id: 5, invoiceNumber: 'INV-5', outstanding: '900.0000', reportableAmount: 400, waitingAmount: 500 },
    });
    expect(screen.getByTestId('double-pay-warning')).toBeTruthy();
    expect(screen.getByText(WARNING)).toBeTruthy();
    expect(payButton().props.accessibilityLabel).toBe('Pay anyway ₹900.00 from wallet');
  });

  it('invoice: no warning when nothing is waiting on it', () => {
    renderSheet({
      invoice: { id: 5, invoiceNumber: 'INV-5', outstanding: '900.0000', reportableAmount: 900, waitingAmount: 0 },
    });
    expect(screen.queryByTestId('double-pay-warning')).toBeNull();
    expect(payButton().props.accessibilityLabel).toBe('Pay ₹900.00 from wallet');
  });

  it('Pay anyway pays the same amount and closes as before', async () => {
    repay.mockResolvedValue(RESPONSE);
    renderSheet(reported);
    press('choice-full');
    press('pay-button');
    await waitFor(() => expect(repay).toHaveBeenCalledTimes(1));
    expect(repay.mock.calls[0][2]).toMatchObject({ amount: 1200 });
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(RESPONSE));
  });
});
