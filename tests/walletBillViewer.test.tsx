import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ViewerScreen from '@/app/restaurant/wallet/transaction/invoice';
import { MandiToastProvider } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { deleteWalletInvoice, fetchWalletInvoice } from '@/services/wallet';
import type { WalletInvoice } from '@/models/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '184' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/wallet', () => ({ fetchWalletInvoice: jest.fn(), deleteWalletInvoice: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
// Pinch and pan need a real gesture system; the viewer's job here is the links and states.
jest.mock('@/components/wallet/bill/ZoomableImage', () => {
  const { Text, Pressable } = jest.requireActual('react-native');
  return {
    ZoomableImage: ({ uri, onError }: { uri: string; onError: () => void }) => (
      <Pressable testID="zoom-image" onPress={onError}><Text>{uri}</Text></Pressable>
    ),
  };
});

const future = () => new Date(Date.now() + 5 * 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

function invoice(over: Partial<WalletInvoice> = {}): WalletInvoice {
  return {
    status: 'READ', createdAt: '2026-10-03T10:00:00Z', pageCount: 1, attempts: 1, error: null,
    pages: [{ page: 1, contentType: 'image/jpeg', sizeBytes: 1000, url: 'https://cdn.test/p1?sig=a', expiresAt: future() }],
    reading: {
      vendorName: 'KOSTA Delights', vendorAddress: 'Shop 4, Mandi Road', invoiceNumber: '1631', invoiceDate: '04 Sep 2026',
      customerName: 'Test outlet', currency: 'INR',
      items: [
        { name: '16/20 prawns', quantity: 2, unit: 'kg', unitPrice: 560, total: 1120 },
        { name: '21/25 prawns', quantity: 2, unit: 'kg', unitPrice: 450, total: 900 },
      ],
      subtotal: 2820, tax: null, delivery: null, total: 2820,
    },
    check: { paid: 2820, billTotal: 2820, matches: true, difference: 0 },
    ...over,
  };
}

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 805 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <ViewerScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('Invoice viewer', () => {
  it('shows a read bill: reading, items, totals and a green check', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice());
    setup();
    expect(await screen.findByText('KOSTA Delights')).toBeTruthy();
    expect(fetchWalletInvoice).toHaveBeenCalledWith(7, '184', 'token');
    expect(screen.getByText('Shop 4, Mandi Road')).toBeTruthy();
    expect(screen.getByText('1631 · 04 Sep 2026')).toBeTruthy();
    expect(screen.getAllByTestId('bill-item')).toHaveLength(2);
    expect(screen.getAllByText('2 kg')).toHaveLength(2);
    expect(screen.getByText('₹1,120')).toBeTruthy();
    expect(screen.getByTestId('check-match')).toBeTruthy();
    expect(screen.getByText('Bill total matches the payment (₹2,820)')).toBeTruthy();
    expect(screen.getByText('https://cdn.test/p1?sig=a')).toBeTruthy();
  });

  it('warns in amber when the bill total differs, using the server difference', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice({
      check: { paid: 2820, billTotal: 2900, matches: false, difference: 80 },
    }));
    setup();
    expect(await screen.findByTestId('check-differs')).toBeTruthy();
    expect(screen.getByText('Bill total ₹2,900 differs from the payment ₹2,820 by ₹80')).toBeTruthy();
  });

  it('shows a grey note when the bill has no total', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice({
      check: { paid: 2820, billTotal: null, matches: null, difference: null },
    }));
    setup();
    expect(await screen.findByTestId('check-none')).toBeTruthy();
  });

  it('shows the reading state with the photo already viewable', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice({ status: 'READING', reading: null, check: null }));
    setup();
    expect(await screen.findByText('Reading the bill… you can leave this page')).toBeTruthy();
    expect(screen.getByTestId('zoom-image')).toBeTruthy();
    expect(screen.queryByTestId('bill-reading')).toBeNull();
  });

  it('shows the unreadable message from the server, keeps the photo, and Replace bill deletes then re-adds', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice({
      status: 'UNREADABLE', reading: null, check: null, error: 'The photo is too blurry to read.',
    }));
    (deleteWalletInvoice as jest.Mock).mockResolvedValue(undefined);
    setup();
    expect(await screen.findByText('The photo is too blurry to read.')).toBeTruthy();
    expect(screen.getByTestId('zoom-image')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Replace bill'));
    expect(await screen.findByText('Replace this bill?')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getAllByLabelText('Replace bill').slice(-1)[0] as never); });
    await waitFor(() => expect(deleteWalletInvoice).toHaveBeenCalledWith(7, '184', 'token'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/restaurant/wallet/transaction/bill', params: { id: '184' },
    }));
  });

  it('asks before removing, calls delete on confirm, and goes back', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice());
    (deleteWalletInvoice as jest.Mock).mockResolvedValue(undefined);
    setup();
    await screen.findByText('KOSTA Delights');
    fireEvent.press(screen.getByLabelText('Delete bill'));
    expect(await screen.findByText('Remove this bill?')).toBeTruthy();
    expect(deleteWalletInvoice).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByLabelText('Remove bill')); });
    await waitFor(() => expect(deleteWalletInvoice).toHaveBeenCalledWith(7, '184', 'token'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('keeps the bill when the owner chooses Keep bill', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice());
    setup();
    await screen.findByText('KOSTA Delights');
    fireEvent.press(screen.getByLabelText('Delete bill'));
    await act(async () => { fireEvent.press((await screen.findAllByLabelText('Keep bill'))[0] as never); });
    expect(deleteWalletInvoice).not.toHaveBeenCalled();
    // Let the page list finish its own batched render inside act (no warning after the test).
    await act(async () => { await new Promise((r) => { setTimeout(r, 100); }); });
  });

  it('refetches once when a page link has expired, and shows the fresh link', async () => {
    (fetchWalletInvoice as jest.Mock)
      .mockResolvedValueOnce(invoice({ pages: [{ page: 1, contentType: 'image/jpeg', sizeBytes: 1, url: 'https://cdn.test/old', expiresAt: past() }] }))
      .mockResolvedValue(invoice({ pages: [{ page: 1, contentType: 'image/jpeg', sizeBytes: 1, url: 'https://cdn.test/new', expiresAt: future() }] }));
    setup();
    expect(await screen.findByText('https://cdn.test/new')).toBeTruthy();
    expect(fetchWalletInvoice).toHaveBeenCalledTimes(2);
  });

  it('refetches once when an image fails to load, then offers Try again instead of looping', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice());
    setup();
    fireEvent.press(await screen.findByTestId('zoom-image'));
    await waitFor(() => expect(fetchWalletInvoice).toHaveBeenCalledTimes(2));
    fireEvent.press(await screen.findByTestId('zoom-image'));
    expect(await screen.findByText('We could not load the bill photo.')).toBeTruthy();
    expect(fetchWalletInvoice).toHaveBeenCalledTimes(2);
    // Let the page list finish its own batched render inside act (no warning after the test).
    await act(async () => { await new Promise((r) => { setTimeout(r, 100); }); });
  });

  it('shows a PDF page as a tile', async () => {
    (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice({
      pages: [{ page: 1, contentType: 'application/pdf', sizeBytes: 1, url: 'https://cdn.test/b.pdf', expiresAt: future() }],
    }));
    setup();
    expect(await screen.findByText('PDF · open')).toBeTruthy();
  });

  it('says there is no bill on a 404', async () => {
    (fetchWalletInvoice as jest.Mock).mockRejectedValue(new ApiError({ code: 'INVOICE_NOT_FOUND', message: 'no', status: 404 }));
    setup();
    expect(await screen.findByText('No bill on this payment')).toBeTruthy();
  });
});
