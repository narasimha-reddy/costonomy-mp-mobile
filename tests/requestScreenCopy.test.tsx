import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RequestDetailScreen from '@/app/restaurant/requests/[id]';
import { MandiToastProvider } from '@/components/common';
import { cancelIntent, fetchIntent, previewOrder } from '@/services/intent';
import { istDay } from '@/lib/delivery/deliveryDay';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '7' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/intent', () => ({
  fetchIntent: jest.fn(), previewOrder: jest.fn(), createOrderFromIntent: jest.fn(), cancelIntent: jest.fn(),
  cloneIntent: jest.fn(), removeIntentItem: jest.fn(), updateIntentItem: jest.fn(),
}));
jest.mock('@/services/delivery', () => ({ fetchAvailableSlots: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
jest.mock('@/components/request/DeliveryModePicker', () => ({ DeliveryModePicker: () => null }));
jest.mock('@/components/request/DeliverySlotPicker', () => ({ DeliverySlotPicker: () => null }));
jest.mock('@/components/request/PaymentMethodPicker', () => ({ PaymentMethodPicker: () => null }));

const base = {
  id: 7, reference: 'RQ-7', outletId: 9, outletName: 'Cafe One', outletLocality: 'Indiranagar', outletCity: 'Bengaluru',
  supplierStoreId: 4, storeName: 'Sri Balaji', supplierName: 'Sri Balaji', status: 'RESPONSES_RECEIVED',
  fulfilment: 'PARTIALLY_FULFILLED', deliveryPreference: 'DELIVERY', withinOrderWindow: true, quantityEditable: false,
  editable: false, preferredDeliveryDate: null, sentAt: '2026-10-07T05:00:00Z', createdAt: '2026-10-07T05:00:00Z',
  orderCreationDeadline: null, responseDeadline: null, responseWindowSeconds: 300,
  items: [
    { id: 501, supplierSkuId: 77, sku: null, requestedQuantity: '4', offeredQuantity: '3', unit: 'KG', lineTotal: '106.00', agreedLineTotal: '132.00' },
    { id: 502, supplierSkuId: 78, sku: null, requestedQuantity: '2', offeredQuantity: '2', unit: 'KG', lineTotal: '40.00', agreedLineTotal: '40.00' },
  ],
  acceptance: { offeredValue: '100.00', offeredGst: '6.00', offeredTotal: '106.00', deliveryFee: '0', deliveryModes: 'PICKUP', notes: null },
  agreedValue: null, agreedGst: null, agreedTotal: '132.00',
};

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><RequestDetailScreen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchIntent as jest.Mock).mockResolvedValue(base);
  (previewOrder as jest.Mock).mockResolvedValue({ grandTotal: '106.00', deliveryFee: '0', lines: [] });
  (cancelIntent as jest.Mock).mockResolvedValue({});
});

describe('an answered request at checkout', () => {
  it('shows one status chip when two would say the same thing', async () => {
    setup();
    await screen.findByTestId('checkout-header');
    expect(screen.getByText('Accepted in part')).toBeTruthy();
    expect(screen.queryByText('Partly available')).toBeNull();
  });

  it('a fully accepted request shows one chip that keeps both facts', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue({ ...base, fulfilment: 'FULFILLED' });
    setup();
    await screen.findByTestId('checkout-header');
    expect(screen.getByText('Accepted in full')).toBeTruthy();
    expect(screen.queryByText('Supplier accepted')).toBeNull();
    expect(screen.queryByText('All available')).toBeNull();
  });

  it('names the supplier once', async () => {
    setup();
    await screen.findByTestId('checkout-header');
    expect(screen.getAllByText('Sri Balaji')).toHaveLength(1);
  });

  it('shows the offered quantity with what was asked for, not the requested box', async () => {
    setup();
    await screen.findByTestId('checkout-header');
    expect(screen.getByLabelText(/^3 KG/)).toBeTruthy();
    expect(screen.getByText('You asked for 4 KG')).toBeTruthy();
    expect(screen.queryByText(/Only 3 KG available/)).toBeNull();
  });

  it('withdraw offers Keep request, not Keep editing, when nothing is editable', async () => {
    setup();
    await screen.findByTestId('checkout-header');
    fireEvent.press(screen.getAllByText('Withdraw request')[0] as never);
    expect(await screen.findByText('Keep request')).toBeTruthy();
    expect(screen.queryByText('Keep editing')).toBeNull();
  });
});

describe('a request that was withdrawn', () => {
  it('says Request withdrawn and offers Back to Home', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue({ ...base, status: 'CANCELLED', fulfilment: 'AWAITING' });
    setup();
    expect(await screen.findByText('Request withdrawn')).toBeTruthy();
    expect(screen.queryByText('Cancelled')).toBeNull();
    fireEvent.press(screen.getByText('Back to Home'));
    expect(mockReplace).toHaveBeenCalledWith('/restaurant');
  });
});

describe('a request waiting for the supplier', () => {
  const open = (over: object = {}) => ({
    ...base, status: 'OPEN', fulfilment: 'AWAITING', acceptance: null, quantityEditable: true,
    responseDeadline: new Date(Date.now() + 297_000).toISOString(), ...over,
  });

  it('says one thing about the reply time, with the clock', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue(open());
    setup();
    expect(await screen.findByText(/^Replies within 5 min/)).toBeTruthy();
    expect(screen.queryByText(/usually replies/)).toBeNull();
    expect(screen.getByLabelText(/minutes \d+ seconds left to reply/)).toBeTruthy();
    expect(screen.queryByLabelText(/left left/)).toBeNull();
    expect(screen.queryByText('Usually accepts within')).toBeNull();
    expect(screen.queryByText('to accept')).toBeNull();
  });

  it('names the supplier once, in the header card', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue(open({ storeName: 'Sri Balaji Traders — Domlur', supplierName: 'Sri Balaji Traders' }));
    setup();
    await screen.findByText(/^Replies within 5 min/);
    expect(screen.getAllByText(/Sri Balaji Traders/)).toHaveLength(1);
  });

  it('shows the chosen way and day on the request sent screen', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue(open());
    setup();
    expect(await screen.findByText('Deliver to me · As soon as possible')).toBeTruthy();
  });

  it('says Later today for a request sent for today', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue(open({ preferredDeliveryDate: istDay(0) }));
    setup();
    expect(await screen.findByText('Deliver to me · Later today')).toBeTruthy();
  });

  it('drops the spoken-twice "left" once the reply window has run out', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue(open({ responseDeadline: new Date(Date.now() - 5_000).toISOString() }));
    setup();
    expect(await screen.findByLabelText('Window expired')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('left')).toBeNull());
  });

  it('names tomorrow and pickup in words', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue(open({ deliveryPreference: 'PICKUP', preferredDeliveryDate: istDay(1) }));
    setup();
    expect(await screen.findByText('Pickup · Tomorrow')).toBeTruthy();
  });
});
