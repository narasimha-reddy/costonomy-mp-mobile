import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RequestDetailScreen from '@/app/restaurant/requests/[id]';
import { MandiToastProvider } from '@/components/common';
import { fetchIntent, previewOrder } from '@/services/intent';
import { fetchAvailableSlots } from '@/services/delivery';
import { istDay } from '@/lib/delivery/deliveryDay';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '7' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/intent', () => ({
  fetchIntent: jest.fn(), previewOrder: jest.fn(), createOrderFromIntent: jest.fn(), cancelIntent: jest.fn(),
  cloneIntent: jest.fn(), removeIntentItem: jest.fn(), updateIntentItem: jest.fn(),
}));
jest.mock('@/services/delivery', () => ({ fetchAvailableSlots: jest.fn() }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
jest.mock('@/components/request/DeliveryModePicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    DeliveryModePicker: ({ onSelect }: { onSelect: (m: string, fee: string) => void }) => (
      <Pressable accessibilityLabel="pick courier" onPress={() => onSelect('COSTONOMY_DELIVERY', '40')}><Text>pick courier</Text></Pressable>
    ),
  };
});
jest.mock('@/components/request/DeliverySlotPicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  const { istDay: day } = jest.requireActual('@/lib/delivery/deliveryDay');
  return {
    DeliverySlotPicker: ({ onSelect }: { onSelect: (s: number, d: string) => void }) => (
      <Pressable accessibilityLabel="pick slot" onPress={() => onSelect(3, day(1))}><Text>pick slot</Text></Pressable>
    ),
  };
});
jest.mock('@/components/request/PaymentMethodPicker', () => ({ PaymentMethodPicker: () => null }));

const request = {
  id: 7, reference: 'RQ-7', outletId: 9, outletName: 'Cafe One', outletLocality: 'Indiranagar', outletCity: 'Bengaluru',
  supplierStoreId: 4, storeName: 'Metro Wholesale', supplierName: 'Metro Wholesale', status: 'RESPONSES_RECEIVED',
  fulfilment: 'FULFILLED', withinOrderWindow: true, quantityEditable: false, editable: false, preferredDeliveryDate: null,
  sentAt: '2026-10-07T05:00:00Z', createdAt: '2026-10-07T05:00:00Z',
  orderCreationDeadline: new Date(Date.now() + 10 * 60_000).toISOString(), orderCreationWindowSeconds: 900,
  items: [{ id: 501, supplierSkuId: 77, sku: null, requestedQuantity: '3', offeredQuantity: '3', unit: 'KG', agreedLineTotal: '100.00' }],
  acceptance: { offeredValue: '1000.00', offeredGst: '50.00', offeredTotal: '1050.00', deliveryFee: '0', deliveryModes: 'PICKUP', notes: null },
  agreedValue: null, agreedGst: null, agreedTotal: null,
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
  (fetchIntent as jest.Mock).mockResolvedValue(request);
  (previewOrder as jest.Mock).mockResolvedValue({ grandTotal: '1181.40', deliveryFee: '40', lines: [] });
  (fetchAvailableSlots as jest.Mock).mockResolvedValue([
    { id: 3, slotName: 'Morning', startTime: '06:00:00', endTime: '08:00:00', available: true, availableCapacity: 5, orderCutoffTime: '04:00:00' },
  ]);
});

describe('the checkout header and delivery rows', () => {
  it('header card shows supplier, delivery window and outlet', async () => {
    setup();
    const card = within(await screen.findByTestId('checkout-header'));
    expect(card.getByText('Metro Wholesale')).toBeTruthy();
    expect(card.getByText('As soon as possible')).toBeTruthy();
    expect(card.getByText('to Cafe One · Indiranagar')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('pick courier'));
    fireEvent.press(screen.getByLabelText('pick slot'));
    await waitFor(() => expect(card.getByText('Tomorrow · 06:00 - 08:00')).toBeTruthy());
    expect(card.queryByText('As soon as possible')).toBeNull();
    expect(card.getByText('to Cafe One · Indiranagar').props.numberOfLines).toBe(1);
  });

  it('reply validity timer is still shown and on one line', async () => {
    setup();
    const card = within(await screen.findByTestId('checkout-header'));
    const label = card.getByText('Order from this reply within');
    expect(label.props.numberOfLines).toBe(1);
    // The compact chip: no trailing "to order" word to wrap under the time.
    expect(card.queryByText('to order')).toBeNull();
    expect(card.getByLabelText(/minutes \d+ seconds left to order/)).toBeTruthy();
    // And it is not repeated in the status card.
    expect(screen.getAllByText('Order from this reply within')).toHaveLength(1);
  });

  it('Add more items opens the supplier menu', async () => {
    setup();
    fireEvent.press(await screen.findByLabelText('Add more items'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/supplier/4');
    expect(screen.queryByText('Add a note for the supplier')).toBeNull();
  });

  it('delivery rows show window, address and total from the preview', async () => {
    setup();
    const rows = within(await screen.findByTestId('checkout-rows'));
    expect(rows.getByText('Delivery window')).toBeTruthy();
    expect(rows.getByText('Delivery at Cafe One')).toBeTruthy();
    expect(rows.getByText('Indiranagar, Bengaluru')).toBeTruthy();
    // The server's figure (1181.40), not the acceptance's 1050.00 and not a sum of 1000 + 50 + 40.
    await waitFor(() => expect(rows.getByText('Total bill ₹1,181.40')).toBeTruthy());
    expect(rows.getByText('Incl. taxes and charges')).toBeTruthy();
    expect(rows.queryByText(/1,090|1,050/)).toBeNull();
  });

  it('rows fall back to the acceptance total before the preview arrives', async () => {
    (previewOrder as jest.Mock).mockReturnValue(new Promise(() => undefined));
    setup();
    const rows = within(await screen.findByTestId('checkout-rows'));
    expect(rows.getByText('Total bill ₹1,050.00')).toBeTruthy();
  });

  it('bar and picker behaviour unchanged', async () => {
    setup();
    await screen.findByText('Place order');
    expect(screen.getByLabelText('pick courier')).toBeTruthy();
    expect(screen.getByText('PAY USING')).toBeTruthy();
    expect(screen.getByText('Withdraw Request')).toBeTruthy();
    await waitFor(() => expect(
      within(screen.getByLabelText('Place order')).queryByText('₹1,181.40'),
    ).toBeTruthy());
    void istDay;
  });
});
