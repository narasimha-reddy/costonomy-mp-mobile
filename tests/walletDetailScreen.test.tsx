import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DetailScreen from '@/app/restaurant/wallet/transaction/[id]';
import { ReceiptCard } from '@/components/wallet/detail/ReceiptCard';
import { MandiToastProvider } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { fetchWalletTransaction } from '@/services/wallet';
import { shareReceiptImage } from '@/lib/wallet/shareReceipt';
import type { WalletTransactionDetail } from '@/models/wallet';
import { DetailStatusColors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '184' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/wallet', () => ({ fetchWalletTransaction: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    copy() {}
    delete() {}
  }
  return { File, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('@/lib/wallet/shareReceipt', () => ({ shareReceiptImage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Clipboard = require('expo-clipboard') as { setStringAsync: jest.Mock };

function detail(over: Partial<WalletTransactionDetail> = {}): WalletTransactionDetail {
  return {
    key: 'L184', id: 184, transactionId: '184', direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT',
    amount: '250.0000', balanceAfter: '4750.0000', supplierOrderId: null, reason: 'QuickScan payment',
    status: 'COMPLETED', refundStatus: null, instrument: null, at: '2026-09-10T10:00:00Z',
    counterpartyName: 'Sri Ram Tea Stall', counterpartyDetail: 'sr••••@okhdfc',
    references: [{ label: 'QuickScan payment', value: '41', copyable: true }],
    actions: { canPayAgain: true, payeeVpa: 'sriram@okhdfc' },
    ...over,
  };
}

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 805 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <DetailScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (shareReceiptImage as jest.Mock).mockResolvedValue(undefined);
});

describe('Transaction detail screen', () => {
  it('asks the API for the entry in the History row\'s id', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    await screen.findByText('Sri Ram Tea Stall');
    expect(fetchWalletTransaction).toHaveBeenCalledWith(7, '184', 'token');
  });

  it('shows a successful payment: green header, label, name, masked id, amount, ids and wallet row', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    expect(await screen.findByText('Transaction Successful')).toBeTruthy();
    expect(screen.getByTestId('detail-header').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: DetailStatusColors.success })]));
    expect(screen.getByText(/^\d\d:\d\d (am|pm) on \d\d Sep 2026$/)).toBeTruthy();
    expect(screen.getByText('Paid to')).toBeTruthy();
    expect(screen.getByText('sr••••@okhdfc')).toBeTruthy();
    expect(screen.getAllByText('₹250').length).toBe(2);
    expect(screen.getByText('Costonomy Transaction ID')).toBeTruthy();
    expect(screen.getAllByText('184').length).toBeGreaterThan(0);
    expect(screen.getByText('Debited from')).toBeTruthy();
    expect(screen.getByText('Costonomy Wallet')).toBeTruthy();
    expect(screen.getByText('Reference: QuickScan payment 41')).toBeTruthy();
    expect(screen.getByTestId('detail-avatar-out')).toBeTruthy();
    expect(screen.queryByText(/powered by/i)).toBeNull();
  });

  it.each([
    ['IN_PROGRESS', 'Transaction in progress', DetailStatusColors.inProgress],
    ['FAILED', 'Transaction failed', DetailStatusColors.failed],
    ['RETURNED', 'Money returned', DetailStatusColors.returned],
  ])('shows %s with its header', async (status, title, color) => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({ status: status as never }));
    setup();
    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByTestId('detail-header').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: color })]));
  });

  it('shows money in with the filled avatar, the received label and "Credited to"', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      direction: 'CREDIT', kind: 'QUICKSCAN_RETURN', actions: { canPayAgain: false },
    }));
    setup();
    expect(await screen.findByText('Received from')).toBeTruthy();
    expect(screen.getByText('Credited to')).toBeTruthy();
    expect(screen.getByTestId('detail-avatar-in')).toBeTruthy();
  });

  it('falls back to the History title when the entry has no counterparty', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      kind: 'TOP_UP', direction: 'CREDIT', counterpartyName: null, counterpartyDetail: null,
      instrument: 'Card •1007', references: [], actions: { canPayAgain: false },
    }));
    setup();
    expect(await screen.findByText('Added to wallet')).toBeTruthy();
    expect(screen.getByText('Card •••• 1007')).toBeTruthy();
  });

  it('shows skeleton blocks, not a spinner, while loading', () => {
    (fetchWalletTransaction as jest.Mock).mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByTestId('detail-skeleton')).toBeTruthy();
    expect(screen.queryByText('Transaction Successful')).toBeNull();
  });

  it('says "Transaction not found" for a 404', async () => {
    (fetchWalletTransaction as jest.Mock).mockRejectedValue(
      new ApiError({ code: 'NOT_FOUND', message: 'No such entry', status: 404 }));
    setup();
    expect(await screen.findByText('Transaction not found')).toBeTruthy();
  });

  it('shows an error with Try again, and loads on retry', async () => {
    (fetchWalletTransaction as jest.Mock)
      .mockRejectedValueOnce(new ApiError({ code: 'X', message: 'boom', status: 500 }))
      .mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Try Again'));
    expect(await screen.findByText('Sri Ram Tea Stall')).toBeTruthy();
  });

  it('offers Pay again only when the server says so, prefilled with the payee', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Pay again'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/quickscan/pay',
      params: { vpa: 'sriram@okhdfc', name: 'Sri Ram Tea Stall' },
    });
  });

  it('has no Pay again when it cannot be offered', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({ actions: { canPayAgain: false } }));
    setup();
    await screen.findByText('Sri Ram Tea Stall');
    expect(screen.queryByLabelText('Pay again')).toBeNull();
    expect(screen.getByLabelText('Wallet')).toBeTruthy();
  });

  it('opens the wallet and the History from the round actions', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Wallet'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/wallet');
    fireEvent.press(screen.getByLabelText('View History'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/wallet/history');
  });

  it('goes back from the arrow', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
    // Let the screen's lists finish their batched render inside act (no warning after the test).
    await act(async () => { await new Promise((r) => { setTimeout(r, 100); }); });
  });

  it('collapses and opens Transfer Details', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByTestId('transfer-details-toggle'));
    expect(screen.queryByTestId('transfer-details-body')).toBeNull();
    // The actions stay while the section is closed.
    expect(screen.getByLabelText('Share Receipt')).toBeTruthy();
    fireEvent.press(screen.getByTestId('transfer-details-toggle'));
    expect(screen.getByTestId('transfer-details-body')).toBeTruthy();
  });

  it('copies the transaction id and says "Copied"', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Copy transaction ID'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('184'));
    expect(await screen.findByText('Copied')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Copy reference'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('41'));
  });

  it('shows no copy icon on a reference that is not copyable', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      references: [{ label: 'UTR', value: '99', copyable: false }],
    }));
    setup();
    await screen.findByText('Reference: UTR 99');
    expect(screen.queryByLabelText('Copy reference')).toBeNull();
  });

  it('says support is coming soon', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Contact Support'));
    expect(await screen.findByText('Support is coming soon')).toBeTruthy();
  });

  it('captures and shares the receipt under its file name, and is disabled meanwhile', async () => {
    let finish: () => void = () => {};
    (shareReceiptImage as jest.Mock).mockReturnValue(new Promise<void>((r) => { finish = r; }));
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Share Receipt'));
    expect(shareReceiptImage).toHaveBeenCalledTimes(1);
    expect((shareReceiptImage as jest.Mock).mock.calls[0][1]).toBe('costonomy-receipt-184.png');
    await waitFor(() => expect(screen.getByLabelText('Share Receipt').props.accessibilityState.disabled).toBe(true));
    fireEvent.press(screen.getByLabelText('Share Receipt'));
    expect(shareReceiptImage).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.getByLabelText('Share Receipt').props.accessibilityState.disabled).toBe(false));
  });

  it('toasts when the receipt cannot be made', async () => {
    (shareReceiptImage as jest.Mock).mockRejectedValue(new Error('no'));
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    fireEvent.press(await screen.findByLabelText('Share Receipt'));
    expect(await screen.findByText('Could not create receipt')).toBeTruthy();
  });
});

describe('ReceiptCard', () => {
  it('has the card content but no actions, support row, copy icons or footer', () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ReceiptCard entry={detail()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Transaction Successful')).toBeTruthy();
    expect(screen.getByText('Paid to')).toBeTruthy();
    expect(screen.getByText('Sri Ram Tea Stall')).toBeTruthy();
    expect(screen.getByText('Costonomy Transaction ID')).toBeTruthy();
    expect(screen.getByText('Reference: QuickScan payment 41')).toBeTruthy();
    for (const absent of ['Pay again', 'Wallet', 'View History', 'Share Receipt', 'Contact Support']) {
      expect(screen.queryByText(absent)).toBeNull();
    }
    expect(screen.queryByLabelText('Copy transaction ID')).toBeNull();
    expect(screen.queryByLabelText('Copy reference')).toBeNull();
    expect(screen.queryByText(/powered by/i)).toBeNull();
    expect(screen.getByTestId('receipt-card-root').props.collapsable).toBe(false);
  });
});

describe('Credit repayment detail', () => {
  const repayment = (over: Partial<WalletTransactionDetail> = {}) => detail({
    kind: 'CREDIT_REPAYMENT', reason: 'Credit repayment', amount: '1500.0000',
    counterpartyName: 'Green Farms', counterpartyDetail: 'INV-1, INV-2',
    references: [
      { label: 'Credit invoice', value: 'INV-1', copyable: true },
      { label: 'Credit invoice', value: 'INV-2', copyable: true },
      { label: 'Credit line', value: '7', copyable: true },
      { label: 'Credit repayment', value: '12', copyable: true },
    ],
    actions: { canPayAgain: false },
    ...over,
  });

  it('names the supplier, lists the invoices and goes to the credit line', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(repayment());
    setup();
    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('Paid to')).toBeTruthy();
    expect(screen.getByText('Credit repayment')).toBeTruthy();
    expect(screen.getByText('Invoices settled')).toBeTruthy();
    expect(screen.getByText('INV-1')).toBeTruthy();
    expect(screen.getByText('INV-2')).toBeTruthy();
    expect(screen.getByTestId('detail-avatar-out')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('View in Credit'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/credit/7');
  });

  it('renders no bill controls or Pay again, even if the server sent bill fields', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(repayment({
      billStatus: 'PENDING',
      actions: { canPayAgain: true, canAddBill: true, canWaiveBill: true },
      invoice: { status: 'READ', vendorName: null, total: null, thumbnailUrl: null },
    }));
    setup();
    await screen.findByText('Green Farms');
    expect(screen.queryByTestId('bill-status-section')).toBeNull();
    expect(screen.queryByLabelText('Add bill')).toBeNull();
    expect(screen.queryByLabelText('Invoice')).toBeNull();
    expect(screen.queryByLabelText('No bill needed')).toBeNull();
    expect(screen.queryByLabelText('Pay again')).toBeNull();
    expect(screen.queryByText(/bill/i)).toBeNull();
    expect(screen.getByLabelText('Share Receipt')).toBeTruthy();
  });

  it('keeps the 48 dp Copy reference button inside its own row, clear of the amount and the invoices block', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(repayment());
    setup();
    await screen.findByText('Green Farms');
    const copy = StyleSheet.flatten(screen.getAllByLabelText('Copy reference')[0].props.style);
    expect(copy.height).toBe(48);
    expect(copy.marginVertical).toBe(0);
    const row = StyleSheet.flatten(screen.getAllByTestId('detail-ref-row')[0].props.style);
    expect(row.minHeight).toBe(48);
    expect(row.marginTop).toBe(0);
    const idCopy = StyleSheet.flatten(screen.getByLabelText('Copy transaction ID').props.style);
    expect(idCopy.marginVertical).toBe(0);
    expect(StyleSheet.flatten(screen.getByTestId('detail-id-row').props.style).minHeight).toBe(48);
  });

  it('other kinds keep the compact reference row', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    await screen.findByText('Sri Ram Tea Stall');
    const copy = StyleSheet.flatten(screen.getAllByLabelText('Copy reference')[0].props.style);
    expect(copy.marginVertical).toBe(-17);
    expect(StyleSheet.flatten(screen.getAllByTestId('detail-ref-row')[0].props.style).minHeight).toBe(14);
  });

  it('hides View in Credit when the server gave no credit line', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(repayment({
      references: [{ label: 'Credit invoice', value: 'INV-1', copyable: true }],
    }));
    setup();
    await screen.findByText('Green Farms');
    expect(screen.queryByLabelText('View in Credit')).toBeNull();
  });

  it('the share receipt picture says Credit repayment, the supplier and the invoices, with no link', () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ReceiptCard entry={repayment()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Credit repayment')).toBeTruthy();
    expect(screen.getByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('INV-1')).toBeTruthy();
    expect(screen.queryByLabelText('View in Credit')).toBeNull();
  });

  it('an unknown future kind still renders through the fallback', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      kind: 'SOMETHING_NEW' as never, counterpartyName: null, counterpartyDetail: null, reason: null,
      references: [], actions: { canPayAgain: false },
    }));
    setup();
    expect(await screen.findByText('Money out')).toBeTruthy();
    expect(screen.getByText('Paid to')).toBeTruthy();
    expect(screen.queryByTestId('credit-repayment-block')).toBeNull();
  });
});
