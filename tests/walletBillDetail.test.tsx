import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DetailScreen from '@/app/restaurant/wallet/transaction/[id]';
import { MandiToastProvider } from '@/components/common';
import { fetchWalletTransaction } from '@/services/wallet';
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
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/wallet', () => ({ fetchWalletTransaction: jest.fn() }));
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

beforeEach(() => jest.clearAllMocks());

describe('Transaction detail: bill', () => {
  it('offers Add bill when the payment allows it and there is no bill', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    expect(await screen.findByLabelText('Add bill')).toBeTruthy();
    expect(screen.queryByTestId('invoice-row')).toBeNull();
    expect(screen.queryByLabelText('Invoice')).toBeNull();
    fireEvent.press(screen.getByLabelText('Add bill'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/bill', params: { id: '184' } });
  });

  it('does not offer Add bill when the server does not allow it', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({}, { canAddBill: false }));
    setup();
    await screen.findByText('Kosta Delights');
    expect(screen.queryByLabelText('Add bill')).toBeNull();
  });

  it('keeps four actions at most: Pay again and Add bill squeeze Wallet out', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({}, { canPayAgain: true, payeeVpa: 'k@x' }));
    setup();
    await screen.findByLabelText('Add bill');
    expect(screen.getByLabelText('Pay again')).toBeTruthy();
    expect(screen.getByLabelText('View History')).toBeTruthy();
    expect(screen.getByLabelText('Share Receipt')).toBeTruthy();
    expect(screen.queryByLabelText('Wallet')).toBeNull();
  });

  it('shows Wallet next to Add bill when there is no Pay again', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    setup();
    await screen.findByLabelText('Add bill');
    expect(screen.getByLabelText('Wallet')).toBeTruthy();
  });

  it('shows the Invoice row with thumbnail, vendor and total for a read bill, and Invoice replaces Add bill', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      invoice: { status: 'READ', vendorName: 'KOSTA Delights', total: 2820, thumbnailUrl: 'https://cdn.test/t.jpg' },
    }));
    setup();
    await screen.findByTestId('invoice-row');
    expect(screen.getByText('KOSTA Delights · ₹2,820')).toBeTruthy();
    expect(screen.getByTestId('invoice-thumb').props.source).toEqual({ uri: 'https://cdn.test/t.jpg' });
    expect(screen.queryByLabelText('Add bill')).toBeNull();
    expect(screen.getByLabelText('Invoice')).toBeTruthy();
    fireEvent.press(screen.getByTestId('invoice-row'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/invoice', params: { id: '184' } });
  });

  it('shows the reading state with animated dots, no spinner', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      invoice: { status: 'READING', vendorName: null, total: null, thumbnailUrl: null },
    }));
    setup();
    expect(await screen.findByText('Reading the bill…')).toBeTruthy();
    expect(screen.getByTestId('reading-dots', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows the unreadable state', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      invoice: { status: 'UNREADABLE', vendorName: null, total: null, thumbnailUrl: null },
    }));
    setup();
    expect(await screen.findByText('Could not read, tap to view photo')).toBeTruthy();
  });
});
