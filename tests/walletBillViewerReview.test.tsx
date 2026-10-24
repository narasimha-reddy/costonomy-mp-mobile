import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ViewerScreen from '@/app/restaurant/wallet/transaction/invoice';
import { MandiToastProvider } from '@/components/common';
import { reviewedAtText } from '@/components/wallet/bill/ReviewedReading';
import { fetchWalletInvoice } from '@/services/wallet';
import type { WalletInvoice } from '@/models/wallet';
import { kostaDraft, kostaInvoice } from './fixtures/billReview';

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
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token', me: { user: { id: 9 } } }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/wallet', () => ({ fetchWalletInvoice: jest.fn(), deleteWalletInvoice: jest.fn() }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/components/wallet/bill/ZoomableImage', () => {
  const { Text } = jest.requireActual('react-native');
  return { ZoomableImage: ({ uri }: { uri: string }) => <Text testID="zoom-image">{uri}</Text> };
});

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup(invoice: WalletInvoice) {
  (fetchWalletInvoice as jest.Mock).mockResolvedValue(invoice);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><ViewerScreen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());
/** The list re-measures its cells on a timer after its content changes; let that land inside act. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

describe('Invoice viewer: review', () => {
  it('a read bill offers Review and edit, which opens the review screen', async () => {
    setup(kostaInvoice());
    fireEvent.press(await screen.findByTestId('review-and-edit'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/bill-review', params: { id: '184' } });
    // No review yet: the reading is shown as before.
    expect(screen.getByTestId('bill-reading')).toBeTruthy();
    expect(screen.queryByTestId('reviewed-reading')).toBeNull();
    await settle();
  });

  it('an unreadable bill can be reviewed too; a bill being read cannot', async () => {
    const { unmount } = setup(kostaInvoice({ status: 'UNREADABLE', error: 'Too blurry', reading: null }));
    expect(await screen.findByTestId('review-and-edit')).toBeTruthy();
    await settle();
    unmount();
    setup(kostaInvoice({ status: 'READING', reading: null, draft: null }));
    expect(await screen.findByTestId('state-reading')).toBeTruthy();
    expect(screen.queryByTestId('review-and-edit')).toBeNull();
    await settle();
  });

  it('after a save, shows the reviewed values with a Reviewed chip and "Edited by you", and the server’s totals', async () => {
    setup(kostaInvoice({
      review: kostaDraft({
        supplier: { id: null, name: 'Kosta Fresh' },
        invoiceNumber: '1631A',
        invoiceDate: '2026-09-02',
        paymentStatus: 'COMPLETED',
        delivery: '50.00', deliveryOverridden: true,
        subtotal: '2820.00', tax: '0.00', total: '2870.00',
        reviewedAt: '2026-10-03T04:00:00Z',
        reviewedBy: 9,
      }),
    }));
    const card = await screen.findByTestId('reviewed-reading');
    expect(within(card).getByText('Kosta Fresh')).toBeTruthy();
    expect(within(card).getByTestId('reviewed-chip').props.accessibilityLabel).toBe('Reviewed');
    expect(within(card).getByText(/^Edited by you/)).toBeTruthy();
    expect(within(card).getByText('1631A')).toBeTruthy();
    expect(within(card).getByText('2 Sep 2026')).toBeTruthy();
    expect(within(card).getByText('Completed')).toBeTruthy();
    expect(within(card).getAllByTestId('reviewed-item')).toHaveLength(3);
    expect(within(card).getByText('Prawns 16/20')).toBeTruthy();
    expect(within(card).getByText('On the bill: 16/20 prawns')).toBeTruthy();
    expect(within(card).getByTestId('reviewed-delivery').props.children).toBe('₹50.00');
    expect(within(card).getByTestId('reviewed-total').props.children).toBe('₹2,870.00');
    // What was read stays one tap away.
    expect(screen.queryByTestId('bill-reading')).toBeNull();
    fireEvent.press(screen.getByTestId('toggle-reading'));
    expect(screen.getByTestId('bill-reading')).toBeTruthy();
    expect(screen.getByTestId('review-and-edit')).toBeTruthy();
    await settle();
  });

  it('writes the review time in words, or nothing for a bad date', () => {
    expect(reviewedAtText('nope')).toBeNull();
    expect(reviewedAtText(null)).toBeNull();
    expect(reviewedAtText('2026-10-03T04:00:00Z')).toMatch(/^3 Oct 2026, \d{2}:\d{2}$/);
  });
});
