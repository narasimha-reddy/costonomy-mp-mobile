import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DetailScreen from '@/app/restaurant/wallet/transaction/[id]';
import { MandiToastProvider } from '@/components/common';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { fetchWalletTransaction, undoWalletBillWaiver, waiveWalletBill } from '@/services/wallet';
import type { WalletTransactionDetail } from '@/models/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '184' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
let mockMay = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => mockMay }) }));
jest.mock('@/services/wallet', () => ({
  fetchWalletTransaction: jest.fn(),
  waiveWalletBill: jest.fn(),
  undoWalletBillWaiver: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: { uri: 'file:///cache' } } }));
jest.mock('@/lib/wallet/shareReceipt', () => ({ shareReceiptImage: jest.fn() }));

function detail(over: Partial<WalletTransactionDetail> = {}, actions: Partial<WalletTransactionDetail['actions']> = {}): WalletTransactionDetail {
  return {
    key: 'L184', id: 184, transactionId: '184', direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT',
    amount: '2820.0000', balanceAfter: '4750.0000', supplierOrderId: null, reason: 'QuickScan payment',
    status: 'COMPLETED', refundStatus: null, instrument: null, at: '2026-09-10T10:00:00Z',
    counterpartyName: 'Kosta Delights', counterpartyDetail: 'ko••••@okhdfc',
    references: [], invoice: null,
    actions: { canPayAgain: false, canAddBill: true, ...actions },
    ...over,
  };
}

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 805 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

let client: QueryClient;
function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
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

function load(over: Partial<WalletTransactionDetail> = {}, actions: Partial<WalletTransactionDetail['actions']> = {}) {
  (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail(over, actions));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMay = true;
  (waiveWalletBill as jest.Mock).mockResolvedValue(undefined);
  (undoWalletBillWaiver as jest.Mock).mockResolvedValue(undefined);
});

describe('Details page bill status', () => {
  it.each([[null], [undefined]])('shows nothing extra when billStatus is %s (older server)', async (billStatus) => {
    load({ billStatus });
    setup();
    await screen.findByText('Kosta Delights');
    expect(screen.queryByTestId('bill-status-section')).toBeNull();
    expect(screen.queryByTestId('invoice-row')).toBeNull();
    expect(screen.queryByText('No bill needed')).toBeNull();
    expect(screen.queryByText('Bill pending')).toBeNull();
  });

  it('PENDING shows the Bill row with a Bill pending chip and the No bill needed button', async () => {
    load({ billStatus: 'PENDING' }, { canWaiveBill: true });
    setup();
    expect(await screen.findByText('Bill pending')).toBeTruthy();
    expect(screen.getByTestId('bill-chip-PENDING').props.accessibilityLabel).toBe('Bill pending');
    expect(screen.getByLabelText('No bill needed')).toBeTruthy();
  });

  it('PENDING hides No bill needed without the permission or the server action', async () => {
    mockMay = false;
    load({ billStatus: 'PENDING' }, { canWaiveBill: true });
    const first = setup();
    await screen.findByText('Bill pending');
    expect(screen.queryByTestId('bill-waive')).toBeNull();
    first.unmount();

    mockMay = true;
    load({ billStatus: 'PENDING' }, {});
    setup();
    await screen.findByText('Bill pending');
    expect(screen.queryByTestId('bill-waive')).toBeNull();
  });

  it('confirm sheet: Cancel does nothing, confirming calls the service, refreshes and toasts', async () => {
    load({ billStatus: 'PENDING' }, { canWaiveBill: true });
    setup();
    await screen.findByText('Bill pending');
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    fireEvent.press(screen.getByTestId('bill-waive'));
    expect(screen.getByText('Mark as no bill needed?')).toBeTruthy();
    expect(screen.getByText('You can undo this.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('bill-waive-cancel'));
    expect(waiveWalletBill).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('bill-waive'));
    fireEvent.press(screen.getByTestId('bill-waive-confirm'));
    await waitFor(() => expect(waiveWalletBill).toHaveBeenCalledWith(7, '184', 'token'));
    expect(await screen.findByText('Marked as no bill needed')).toBeTruthy();
    await waitFor(() => expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('NOT_REQUIRED shows the quiet note and Undo, which needs no confirmation', async () => {
    load({ billStatus: 'NOT_REQUIRED' }, { canUndoWaiver: true });
    setup();
    expect(await screen.findByTestId('bill-not-required')).toBeTruthy();
    fireEvent.press(screen.getByTestId('bill-undo-waiver'));
    await waitFor(() => expect(undoWalletBillWaiver).toHaveBeenCalledWith(7, '184', 'token'));
    expect(await screen.findByText('Bill needed again')).toBeTruthy();
  });

  it('NOT_REQUIRED hides Undo without the permission or the action', async () => {
    mockMay = false;
    load({ billStatus: 'NOT_REQUIRED' }, { canUndoWaiver: true });
    const first = setup();
    await screen.findByTestId('bill-not-required');
    expect(screen.queryByTestId('bill-undo-waiver')).toBeNull();
    first.unmount();

    mockMay = true;
    load({ billStatus: 'NOT_REQUIRED' }, { canUndoWaiver: false });
    setup();
    await screen.findByTestId('bill-not-required');
    expect(screen.queryByTestId('bill-undo-waiver')).toBeNull();
  });

  it.each([
    ['422', new ApiError({ code: 'INVOICE_NOT_ALLOWED', message: 'x', status: 422 }), 'This payment does not need a bill.'],
    ['409', new ApiError({ code: 'INVOICE_EXISTS', message: 'x', status: 409 }), 'This payment already has a bill, so it cannot be marked as no bill needed.'],
    ['403', new ApiError({ code: 'FORBIDDEN', message: 'x', status: 403 }), 'You do not have permission to change bills for this outlet.'],
    ['network', new NetworkError('offline'), 'You seem to be offline. Check your connection and try again.'],
  ])('shows plain words when waiving fails with %s', async (_n, error, words) => {
    load({ billStatus: 'PENDING' }, { canWaiveBill: true });
    (waiveWalletBill as jest.Mock).mockRejectedValue(error);
    setup();
    await screen.findByText('Bill pending');
    fireEvent.press(screen.getByTestId('bill-waive'));
    fireEvent.press(screen.getByTestId('bill-waive-confirm'));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.queryByText('Marked as no bill needed')).toBeNull();
  });

  it('shows plain words when undo fails with 422', async () => {
    load({ billStatus: 'NOT_REQUIRED' }, { canUndoWaiver: true });
    (undoWalletBillWaiver as jest.Mock).mockRejectedValue(new ApiError({ code: 'INVOICE_NOT_ALLOWED', message: 'x', status: 422 }));
    setup();
    await screen.findByTestId('bill-undo-waiver');
    fireEvent.press(screen.getByTestId('bill-undo-waiver'));
    expect(await screen.findByText('This payment cannot be changed back.')).toBeTruthy();
  });

  it.each([
    ['READING', { status: 'READING' as const }, 'Reading bill'],
    ['ADDED', { status: 'READ' as const }, 'Bill added'],
    ['REVIEWED', { status: 'READ' as const }, 'Bill reviewed'],
    ['UNREADABLE', { status: 'UNREADABLE' as const }, 'Check bill'],
  ])('puts the %s chip on the Invoice row with the list words', async (billStatus, inv, words) => {
    load({
      billStatus: billStatus as never,
      invoice: { ...inv, vendorName: 'KOSTA', total: 100, thumbnailUrl: null },
    });
    setup();
    await screen.findByTestId('invoice-row');
    expect(screen.getByTestId(`bill-chip-${billStatus}`).props.accessibilityLabel).toBe(words);
    expect(screen.getByLabelText(new RegExp(`^Invoice, ${words}`))).toBeTruthy();
  });

  it('derives the chip from the invoice when billStatus is absent', async () => {
    load({ invoice: { status: 'READ', vendorName: null, total: null, thumbnailUrl: null } });
    setup();
    await screen.findByTestId('invoice-row');
    expect(screen.getByTestId('bill-chip-ADDED')).toBeTruthy();
  });

  it('keeps the plain Invoice row (no chip) for an invoice with no known status', async () => {
    load({ invoice: { status: 'READ', vendorName: null, total: null, thumbnailUrl: null }, billStatus: 'PENDING' });
    setup();
    await screen.findByTestId('invoice-row');
    expect(screen.getByTestId('bill-chip-ADDED')).toBeTruthy();
    expect(screen.queryByTestId('bill-chip-PENDING')).toBeNull();
  });
});
