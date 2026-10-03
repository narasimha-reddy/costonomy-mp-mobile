import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DetailScreen from '@/app/restaurant/wallet/transaction/[id]';
import ViewerScreen from '@/app/restaurant/wallet/transaction/invoice';
import BillScreen from '@/app/restaurant/wallet/transaction/bill';
import ReviewScreen from '@/app/restaurant/wallet/transaction/bill-review';
import { MandiToastProvider } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { fetchWalletInvoice, fetchWalletTransaction, saveWalletInvoiceReview, uploadWalletInvoice } from '@/services/wallet';
import type { WalletInvoice, WalletTransactionDetail } from '@/models/wallet';
import { kostaInvoice } from './fixtures/billReview';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '184' }),
  useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn(), setOptions: jest.fn(), isFocused: () => true }),
}));
// The REAL usePermissions runs against this session: only the memberships are faked.
let mockPermissions: string[] = [];
jest.mock('@/contexts/SessionProvider', () => ({
  useSession: () => ({
    accessToken: 'token',
    me: { memberships: [{ scopeType: 'RESTAURANT', scopeId: 5, permissions: mockPermissions }] },
  }),
}));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outlet: { id: 7, restaurantId: 5, name: 'Test outlet' } }),
}));
jest.mock('@/services/wallet', () => ({
  fetchWalletTransaction: jest.fn(),
  fetchWalletInvoice: jest.fn(),
  deleteWalletInvoice: jest.fn(),
  uploadWalletInvoice: jest.fn(),
  saveWalletInvoiceReview: jest.fn(),
  fetchSupplierLookup: jest.fn().mockResolvedValue([]),
  fetchSkuLookup: jest.fn().mockResolvedValue([]),
  LOOKUP_MAX_QUERY: 60,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: { uri: 'file:///cache' } } }));
jest.mock('@/lib/wallet/shareReceipt', () => ({ shareReceiptImage: jest.fn() }));
jest.mock('@/components/wallet/bill/ZoomableImage', () => {
  const { Text } = jest.requireActual('react-native');
  return { MAX_SCALE: 4, MIN_SCALE: 1, ZoomableImage: ({ uri }: { uri: string }) => <Text testID="zoom-image">{uri}</Text> };
});

const NO_PERMISSION = "You don't have permission to add or change bills";
const VIEW_ONLY = ['ORDER_VIEW'];
const CAN_CHANGE = ['ORDER_VIEW', 'QUICKSCAN_PAY'];

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function mount(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>{ui}</MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function detail(over: Partial<WalletTransactionDetail> = {}): WalletTransactionDetail {
  return {
    key: 'L184', id: 184, transactionId: '184', direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT',
    amount: '2820.0000', balanceAfter: '4750.0000', supplierOrderId: null, reason: 'QuickScan payment',
    status: 'COMPLETED', refundStatus: null, instrument: null, at: '2026-09-10T10:00:00Z',
    counterpartyName: 'Kosta Delights', counterpartyDetail: 'ko••••@okhdfc',
    references: [], invoice: null,
    actions: { canPayAgain: false, canAddBill: true },
    ...over,
  };
}

const future = () => new Date(Date.now() + 5 * 60_000).toISOString();
function readBill(over: Partial<WalletInvoice> = {}): WalletInvoice {
  return {
    status: 'READ', createdAt: '2026-10-03T10:00:00Z', pageCount: 1, attempts: 1, error: null,
    pages: [{ page: 1, contentType: 'image/jpeg', sizeBytes: 1000, url: 'https://cdn.test/p1?sig=a', expiresAt: future() }],
    reading: {
      vendorName: 'KOSTA Delights', vendorAddress: 'Shop 4', invoiceNumber: '1631', invoiceDate: '04 Sep 2026',
      customerName: 'Test outlet', currency: 'INR',
      items: [{ name: '16/20 prawns', quantity: 2, unit: 'kg', unitPrice: 560, total: 1120 }],
      subtotal: 1120, tax: null, delivery: null, total: 1120,
    },
    check: { paid: 1120, billTotal: 1120, matches: true, difference: 0 },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = VIEW_ONLY;
});

describe('Bill actions need QUICKSCAN_PAY', () => {
  it('details page: no Add bill without it, Add bill with it', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail());
    const view = mount(<DetailScreen />);
    expect(await screen.findByLabelText('View History')).toBeTruthy();
    expect(screen.queryByLabelText('Add bill')).toBeNull();
    view.unmount();

    mockPermissions = CAN_CHANGE;
    mount(<DetailScreen />);
    fireEvent.press(await screen.findByLabelText('Add bill'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/bill', params: { id: '184' } });
  });

  it('details page: Invoice for an existing bill stays without it', async () => {
    (fetchWalletTransaction as jest.Mock).mockResolvedValue(detail({
      invoice: { status: 'READ', pageCount: 1, vendorName: 'KOSTA', total: 1120, checkMatches: true } as never,
      actions: { canPayAgain: false, canAddBill: false },
    }));
    mount(<DetailScreen />);
    expect(await screen.findByLabelText('Invoice')).toBeTruthy();
    expect(screen.queryByLabelText('Add bill')).toBeNull();
  });

  it('viewer: shows the bill and reading but no change actions without it', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(readBill());
    mount(<ViewerScreen />);
    expect(await screen.findByText('KOSTA Delights')).toBeTruthy();
    expect(screen.getByTestId('zoom-image')).toBeTruthy();
    expect(screen.queryByTestId('review-and-edit')).toBeNull();
    expect(screen.queryByText('Review and edit')).toBeNull();
    expect(screen.queryByTestId('delete-bill')).toBeNull();
    expect(screen.queryByLabelText('Delete bill')).toBeNull();
  });

  it('viewer: no Replace bill on an unreadable bill without it', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(readBill({ status: 'UNREADABLE', reading: null, check: null, error: 'blurry' }));
    mount(<ViewerScreen />);
    expect(await screen.findByTestId('state-unreadable')).toBeTruthy();
    expect(screen.queryByText('Replace bill')).toBeNull();
    expect(screen.queryByText('Review and edit')).toBeNull();
  });

  it('viewer: the empty state has no Add bill without it', async () => {
    (fetchWalletInvoice as jest.Mock).mockRejectedValue(new ApiError({ code: 'INVOICE_NOT_FOUND', message: 'no', status: 404 }));
    mount(<ViewerScreen />);
    expect(await screen.findByText('No bill on this payment')).toBeTruthy();
    expect(screen.queryByText('Add bill')).toBeNull();
  });

  it('viewer: with it, Review and edit, Remove and Add bill are there as before', async () => {
    mockPermissions = CAN_CHANGE;
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(readBill());
    const view = mount(<ViewerScreen />);
    expect(await screen.findByTestId('review-and-edit')).toBeTruthy();
    expect(screen.getByTestId('delete-bill')).toBeTruthy();
    view.unmount();

    (fetchWalletInvoice as jest.Mock).mockRejectedValue(new ApiError({ code: 'INVOICE_NOT_FOUND', message: 'no', status: 404 }));
    mount(<ViewerScreen />);
    expect(await screen.findByText('Add bill')).toBeTruthy();
  });

  it('capture screen: plain no-permission state, no form, nothing uploaded', async () => {
    mount(<BillScreen />);
    expect(screen.getByText(NO_PERMISSION)).toBeTruthy();
    expect(screen.queryByLabelText('Take photo')).toBeNull();
    expect(screen.queryByTestId('upload-bill')).toBeNull();
    expect(uploadWalletInvoice).not.toHaveBeenCalled();
  });

  it('capture screen: with it, the form shows', async () => {
    mockPermissions = CAN_CHANGE;
    mount(<BillScreen />);
    expect(screen.getByLabelText('Take photo')).toBeTruthy();
    expect(screen.queryByText(NO_PERMISSION)).toBeNull();
  });

  it('review screen: plain no-permission state, no form, nothing saved', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(kostaInvoice());
    mount(<ReviewScreen />);
    expect(await screen.findByText(NO_PERMISSION)).toBeTruthy();
    expect(screen.queryByTestId('review-details')).toBeNull();
    expect(screen.queryByTestId('save-review')).toBeNull();
    expect(saveWalletInvoiceReview).not.toHaveBeenCalled();
  });

  it('review screen: with it, the form shows', async () => {
    mockPermissions = CAN_CHANGE;
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(kostaInvoice());
    mount(<ReviewScreen />);
    expect(await screen.findByTestId('review-details')).toBeTruthy();
    expect(screen.queryByText(NO_PERMISSION)).toBeNull();
  });
});
