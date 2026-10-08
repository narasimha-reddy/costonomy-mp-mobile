import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import RestaurantOrderScreen from '@/app/restaurant/orders/[id]';
import SupplierOrderScreen from '@/app/supplier/orders/[id]';
import { fetchDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { openThread } from '@/services/chat';
import { ApiError } from '@/lib/api/errors';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '5' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 3 }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/delivery', () => ({
  fetchDelivery: jest.fn(),
  reassignDelivery: jest.fn(),
  switchToOwnDelivery: jest.fn(),
  requestDelivery: jest.fn(),
  markDeliveryDispatched: jest.fn(),
  markDeliveryDelivered: jest.fn(),
}));
jest.mock('@/services/procurement', () => ({ fetchSupplierOrder: jest.fn(), newIdempotencyKey: () => 'key' }));
jest.mock('@/services/supplier', () => ({
  markPreparing: jest.fn(), markReady: jest.fn(), markOutForDelivery: jest.fn(), markDelivered: jest.fn(),
  supplierCancelOrder: jest.fn(), recordDispatchWeights: jest.fn(),
}));
jest.mock('@/services/billing', () => ({
  fetchTaxInvoice: jest.fn(), fetchCreditNotes: jest.fn(), generateTaxInvoice: jest.fn(),
}));

const order = {
  id: 5, orderNumber: 'ORD-5', status: 'PREPARING', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Cafe', outletId: 1, supplierStoreId: 2, totalAmount: '1180.00', subtotal: '1000.00',
  gstAmount: '180.00', acceptedAmount: null, createdAt: '2026-01-01T10:00:00Z', paymentMethod: 'PREPAID',
  items: [
    {
      id: 1, productName: 'Paneer', requestedQuantity: '10', acceptedQuantity: null, unit: 'KG', lineTotal: '1000.00',
      sku: null, unitPriceInclusiveGst: '118.00', gstRate: '18',
    },
  ],
};
const delivery = {
  id: 9, status: 'DRIVER_ASSIGNED', mode: 'COSTONOMY', driverName: 'Ravi Kumar', driverPhone: '999', driverVehicle: 'Bike',
  trackable: true, trackingUrl: null, location: null, etaMinutes: 12, estimatedArrivalAt: null, failureReason: 'secret reason',
  canSwitchToOwn: false, timeline: [],
};
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup(Screen: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><Screen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const noDelivery = () => (fetchDelivery as jest.Mock).mockRejectedValue(
  new ApiError({ status: 404, code: 'NOT_FOUND', message: 'none' }),
);

beforeEach(() => {
  mockPush.mockClear();
  (fetchSupplierOrder as jest.Mock).mockResolvedValue(order);
  (fetchDelivery as jest.Mock).mockResolvedValue(delivery);
});

describe('buyer order screen', () => {
  it('has no Track Delivery while preparing', async () => {
    noDelivery();
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('Packing your order')).toBeTruthy();
    expect(screen.queryByText('Track Delivery')).toBeNull();
  });

  it('credit order bar says On credit', async () => {
    noDelivery();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({
      ...order, status: 'COMPLETED', paymentMethod: 'CREDIT', paymentStatus: 'ON_CREDIT', acceptedAmount: '1180.00',
    });
    setup(RestaurantOrderScreen);
    expect((await screen.findAllByText('On credit')).length).toBeGreaterThan(0);
    expect(screen.queryByText('You paid')).toBeNull();
  });

  it('status card Track opens tracking', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    setup(RestaurantOrderScreen);
    const track = await screen.findByText('Track ›');
    fireEvent.press(track);
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/5');
  });

  it('hides the status card when cancelled and keeps the refund copy', async () => {
    noDelivery();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({
      ...order, status: 'CANCELLED', paymentStatus: 'CAPTURED', paymentInstrument: 'UPI',
    });
    setup(RestaurantOrderScreen);
    await screen.findByText('Bill Summary');
    expect(screen.queryByText('Track ›')).toBeNull();
    expect(screen.queryByText('Order cancelled')).toBeNull();
  });

  it('Support opens chat', async () => {
    noDelivery();
    (openThread as jest.Mock).mockResolvedValue({ id: 77 });
    setup(RestaurantOrderScreen);
    fireEvent.press(await screen.findByText('Support'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/chat/77?suggestType=ORDER&suggestId=5'));
    expect(screen.queryByText('Need help?')).toBeNull();
  });

  it('bill lines equal server fields to the paisa', async () => {
    noDelivery();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({
      ...order, subtotal: '1000.10', gstAmount: '180.20', totalAmount: '1234.56', deliveryFee: '49.00',
      acceptedSubtotal: '0.00', acceptedGst: '0.00',
    });
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('₹1,000.10')).toBeTruthy();
    expect(screen.getByText('₹180.20')).toBeTruthy();
    expect(screen.getAllByText('₹1,234.56').length).toBeGreaterThan(0);
    expect(screen.queryByText('₹1,229.30')).toBeNull();
  });

  it('has no Track Delivery or partner card when ready with no partner', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    noDelivery();
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('Assigning a delivery partner')).toBeTruthy();
    expect(screen.queryByText('Track Delivery')).toBeNull();
    expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
  });

  it('shows Track Delivery and the partner status once a partner is assigned', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('Track Delivery')).toBeTruthy();
    expect(screen.getByText('Ravi is on the way to the supplier')).toBeTruthy();
    expect(screen.getByText('10 x Paneer')).toBeTruthy();
  });

  it('the status card follows a live partner and opens tracking', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'OUT_FOR_DELIVERY' });
    (fetchDelivery as jest.Mock).mockResolvedValue({
      ...delivery, status: 'IN_TRANSIT',
      location: { latitude: '12.9', longitude: '77.6', bearing: null, recordedAt: '2026-01-01T10:00:00Z' },
      locationStale: false,
    });
    setup(RestaurantOrderScreen);
    fireEvent.press(await screen.findByLabelText('Order status, Order is on the way'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/5');
  });

  it('never shows the failure reason to the buyer', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    (fetchDelivery as jest.Mock).mockResolvedValue({
      ...delivery, status: 'QUOTE_FAILED', driverName: null, trackable: false, canSwitchToOwn: true,
    });
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('Still arranging delivery')).toBeTruthy();
    expect(screen.queryByText(/secret reason/)).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryByText('Track Delivery')).toBeNull();
  });

  it('still offers check-in when the order is receivable, with a report link and no Track', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'DELIVERED' });
    (fetchDelivery as jest.Mock).mockResolvedValue({ ...delivery, status: 'DELIVERED', deliveredAt: null });
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('Check in delivery')).toBeTruthy();
    fireEvent.press(screen.getByText('Report an issue'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/dispute/5');
    expect(screen.queryByText('Track ›')).toBeNull();
    expect(screen.queryByText('Track Delivery')).toBeNull();
    expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
  });
});

describe('supplier order screen', () => {
  it('offers Try again and I will deliver it myself for a failed quote that can switch', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    (fetchDelivery as jest.Mock).mockResolvedValue({
      ...delivery, status: 'QUOTE_FAILED', driverName: null, trackable: false, canSwitchToOwn: true,
    });
    setup(SupplierOrderScreen);
    expect(await screen.findByText('Try again')).toBeTruthy();
    expect(screen.getByText('I will deliver it myself')).toBeTruthy();
    expect(screen.getAllByText('secret reason').length).toBeGreaterThan(0);
    expect(screen.queryByText('Track')).toBeNull();
    expect(screen.queryByText(/Pidge/)).toBeNull();
  });

  it('offers Request Delivery Partner when ready with no delivery, once the automatic search has had its minute', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T10:00:00Z') });
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    noDelivery();
    setup(SupplierOrderScreen);
    expect(await screen.findByText('Finding a delivery partner…')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(61000); });
    expect(await screen.findByText('Request Delivery Partner')).toBeTruthy();
    expect(screen.queryByText(/Pidge/)).toBeNull();
    jest.useRealTimers();
  });

  it('shows the partner card and Track only once a trackable partner is assigned', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    setup(SupplierOrderScreen);
    expect(await screen.findByText('Ravi Kumar')).toBeTruthy();
    expect(screen.getByText('Track')).toBeTruthy();
  });
});
