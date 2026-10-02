import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WalletScreen from '@/app/restaurant/wallet/index';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { fetchWallet, withdrawFromWallet } from '@/services/wallet';

// Native modules the test runtime does not have.
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
// The real toast animates on a timer that outlives the test; only the calls matter here.
const mockToast = jest.fn();
jest.mock('@/components/common/MandiToast', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
  MandiToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ show: mockToast }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/quickscan', () => ({ fetchQuickScanConfig: jest.fn().mockResolvedValue({ enabled: false }) }));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn(), withdrawFromWallet: jest.fn() }));

const wallet = {
  balance: '500.0000',
  recent: [
    { id: 1, direction: 'CREDIT', kind: 'WITHDRAWAL_REVERSAL', amount: '50.0000', balanceAfter: '500.0000',
      supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-28T10:00:00Z' },
    { id: 2, direction: 'DEBIT', kind: 'WITHDRAWAL', amount: '50.0000', balanceAfter: '450.0000',
      supplierOrderId: null, reason: null, refundStatus: 'REVERSED', at: '2026-09-28T09:00:00Z' },
  ],
};

const refusal = (details: Record<string, unknown>) =>
  new ApiError({ code: 'WITHDRAWAL_EXCEEDS_REFUNDABLE', message: 'That is more than can go back.', status: 422, details });
const paused = () =>
  new ApiError({ code: 'WITHDRAWALS_PAUSED', message: 'Paused for now.', status: 503 });

const withdrawMock = withdrawFromWallet as jest.Mock;
const keyOfCall = (n: number) => withdrawMock.mock.calls[n][3] as string;

let client: QueryClient;

function setup() {
  (fetchWallet as jest.Mock).mockResolvedValue(wallet);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>
        <WalletScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** Open the form, type an amount, and go through the confirm dialog. */
async function submit(amount: string) {
  if (screen.queryByPlaceholderText('0.00') == null) fireEvent.press(await screen.findByTestId('action-withdraw'));
  fireEvent.changeText(await screen.findByPlaceholderText('0.00'), amount);
  // The form's button is the last "Withdraw" until the dialog opens, then the dialog's is.
  fireEvent.press(screen.getAllByText('Withdraw').slice(-1)[0]);
  await act(async () => { fireEvent.press(screen.getAllByText('Withdraw').slice(-1)[0]); });
}

/** Press the last "Withdraw" on screen n times: the form's button, then the dialog's. */
async function pressLast(times: number) {
  for (let i = 0; i < times; i++) {
    await act(async () => { fireEvent.press(screen.getAllByText('Withdraw').slice(-1)[0]); });
  }
}

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { client.clear(); });

describe('redesigned wallet screen: withdraw errors', () => {
  it('a 422 shows the server amount, and "Withdraw ₹X instead" sends a NEW key', async () => {
    setup();
    withdrawMock.mockRejectedValueOnce(refusal({ withdrawableNow: 30, reason: 'SOURCE_BLOCKED' }));
    withdrawMock.mockResolvedValueOnce({ amount: '30.00' });
    await submit('40');
    await screen.findByText('That is more than can go back.');
    const instead = await screen.findByText('Withdraw ₹30.00 instead');
    // Typing clears the notice, so it is only there while the answer still applies.
    await act(async () => { fireEvent.press(instead); });
    await waitFor(() => expect(screen.getAllByText('Withdraw ₹30.00?').length).toBeGreaterThan(0));
    await act(async () => { fireEvent.press(screen.getAllByText('Withdraw').slice(-1)[0]); });
    await waitFor(() => expect(withdrawMock).toHaveBeenCalledTimes(2));
    expect(withdrawMock.mock.calls[1][2]).toBe('30.00');
    expect(keyOfCall(1)).not.toBe(keyOfCall(0));
  });

  it('a 503 paused keeps the key: the retry reuses it', async () => {
    setup();
    withdrawMock.mockRejectedValueOnce(paused());
    withdrawMock.mockResolvedValueOnce({ amount: '40.00' });
    await submit('40');
    await screen.findByText('Paused for now.');
    expect(screen.getByText(/Nothing was taken from your wallet/)).toBeTruthy();
    await pressLast(2);
    await waitFor(() => expect(withdrawMock).toHaveBeenCalledTimes(2));
    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  it('a network failure keeps the key too, and refetches the wallet either way', async () => {
    setup();
    withdrawMock.mockRejectedValueOnce(new NetworkError());
    await submit('40');
    await waitFor(() => expect(fetchWallet).toHaveBeenCalledTimes(2)); // onSettled invalidates
    withdrawMock.mockResolvedValueOnce({ amount: '40.00' });
    await pressLast(2);
    await waitFor(() => expect(withdrawMock).toHaveBeenCalledTimes(2));
    expect(keyOfCall(1)).toBe(keyOfCall(0));
  });

  it('editing the amount clears the notice', async () => {
    setup();
    withdrawMock.mockRejectedValueOnce(refusal({ withdrawableNow: 30 }));
    await submit('40');
    await screen.findByText('Withdraw ₹30.00 instead');
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '25');
    expect(screen.queryByText('Withdraw ₹30.00 instead')).toBeNull();
  });

  it('the Recent list shows a reversal as a credit and a reversed withdrawal as not sent', async () => {
    setup();
    await screen.findByText('Withdrawal returned to your wallet');
    expect(screen.getByText('+₹50.00')).toBeTruthy();
    expect(screen.getByText("Couldn't be sent · back in your wallet")).toBeTruthy();
  });
});
