import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import SupplierOrderScreen from '@/app/supplier/orders/[id]';
import { fetchDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { markPreparing, markReady } from '@/services/supplier';
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
  fetchDelivery: jest.fn(), reassignDelivery: jest.fn(), switchToOwnDelivery: jest.fn(), requestDelivery: jest.fn(),
  markDeliveryDispatched: jest.fn(), markDeliveryDelivered: jest.fn(),
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
  id: 5, orderNumber: 'ORD-5', status: 'CONFIRMED', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Indiranagar', restaurantName: 'Spice Garden', outletLocality: 'Main Road',
  outletCity: 'Bengaluru', outletId: 1, supplierStoreId: 2, totalAmount: '173.24', subtotal: '123.24',
  gstAmount: '0.00', acceptedAmount: null, createdAt: '2026-01-01T10:00:00Z', paymentMethod: 'PREPAID',
  deliveryFee: null,
  items: [{
    id: 1, productName: 'Paneer', requestedQuantity: '10', acceptedQuantity: null, unit: 'KG', lineTotal: '1000.00',
    sku: null, unitPriceInclusiveGst: '118.00', gstRate: '18',
  }],
};
const delivery = {
  id: 9, status: 'DRIVER_ASSIGNED', mode: 'COSTONOMY', driverName: 'Ravi Kumar', driverPhone: '999',
  driverVehicle: 'Bike', trackable: true, trackingUrl: null, location: null, etaMinutes: 12,
  estimatedArrivalAt: null, failureReason: null, canSwitchToOwn: false, timeline: [],
};
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><SupplierOrderScreen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const noDelivery = () => (fetchDelivery as jest.Mock).mockRejectedValue(
  new ApiError({ status: 404, code: 'NOT_FOUND', message: 'none' }),
);

beforeEach(() => {
  jest.clearAllMocks();
  (fetchSupplierOrder as jest.Mock).mockResolvedValue(order);
  noDelivery();
});
afterEach(() => { jest.useRealTimers(); });

describe('issue 2: the stage bar cannot be double-tapped through two stages', () => {
  it('ignores "Mark ready" pressed right after "Start preparing"', async () => {
    (markPreparing as jest.Mock).mockImplementation(async () => {
      (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'PREPARING' });
      return { ...order, status: 'PREPARING' };
    });
    setup();
    fireEvent.press(await screen.findByText('Start preparing'));
    // The next stage's button renders in the same place a moment later: a second tap lands on it.
    await screen.findByText('Mark ready');
    // Let the first mutation settle (the button stops loading) but stay well inside the window.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    fireEvent.press(screen.getByText('Mark ready'));
    // The mutation runs on a later tick.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(markReady).not.toHaveBeenCalled();
  });

  it('presses "Mark ready" normally once the window has passed', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T10:00:00Z') });
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'PREPARING' });
    (markReady as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    setup();
    const ready = await screen.findByText('Mark ready');
    act(() => { jest.advanceTimersByTime(1000); });
    fireEvent.press(ready);
    await waitFor(() => expect(markReady).toHaveBeenCalledTimes(1));
  });
});

describe('issue 3: finding a delivery partner after Ready', () => {
  beforeEach(() => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
  });

  it('says "Finding a delivery partner…" instead of offering the manual button', async () => {
    setup();
    expect(await screen.findByText('Finding a delivery partner…')).toBeTruthy();
    expect(screen.queryByText('Request Delivery Partner')).toBeNull();
  });

  it('asks for the delivery again every few seconds while there is none', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T10:00:00Z') });
    setup();
    await screen.findByText('Finding a delivery partner…');
    const before = (fetchDelivery as jest.Mock).mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(2600); });
    await waitFor(() => expect((fetchDelivery as jest.Mock).mock.calls.length).toBeGreaterThan(before));
  });

  it('offers the manual button after about a minute with still no delivery', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T10:00:00Z') });
    setup();
    await screen.findByText('Finding a delivery partner…');
    await act(async () => { jest.advanceTimersByTime(61000); });
    expect(await screen.findByText('Request Delivery Partner')).toBeTruthy();
  });

  it('stops saying finding once the delivery exists', async () => {
    (fetchDelivery as jest.Mock).mockResolvedValue(delivery);
    setup();
    expect(await screen.findByText('Ravi Kumar')).toBeTruthy();
    expect(screen.queryByText('Finding a delivery partner…')).toBeNull();
    expect(screen.queryByText('Request Delivery Partner')).toBeNull();
  });
});

describe('issue 23 / 28 / 16: the order card', () => {
  it('has no tall decorative hero and no sandbox card, and Track opens the tracking page', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    (fetchDelivery as jest.Mock).mockResolvedValue(delivery);
    setup();
    await screen.findByText('Ravi Kumar');
    expect(screen.queryByLabelText('Track delivery on the map')).toBeNull();
    expect(screen.queryByText(/Sandbox/i)).toBeNull();
    fireEvent.press(screen.getByText('Track'));
    expect(mockPush).toHaveBeenCalledWith('/supplier/tracking/5');
  });

  it('names a Costonomy delivery "Delivery partner"', async () => {
    setup();
    expect(await screen.findByText('Delivery partner')).toBeTruthy();
    expect(screen.queryByText('We deliver')).toBeNull();
  });

  it('says the total includes the delivery fee only when the server sends one', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, deliveryFee: '50.00' });
    const first = setup();
    expect(await screen.findByText('Includes ₹50.00 delivery fee')).toBeTruthy();
    first.unmount();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, deliveryFee: null });
    setup();
    await screen.findByText('Delivery partner');
    expect(screen.queryByText(/Includes/)).toBeNull();
  });

  it('shows the restaurant name as the title', async () => {
    setup();
    expect(await screen.findByText('Spice Garden · Indiranagar')).toBeTruthy();
  });

  it('shows the restaurant rating and comment when present, nothing when absent', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, rating: 4, ratingComment: 'Fresh and on time' });
    const first = setup();
    expect(await screen.findByLabelText('Rated 4 out of 5')).toBeTruthy();
    expect(screen.getByText('Fresh and on time')).toBeTruthy();
    first.unmount();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, rating: null, ratingComment: null });
    setup();
    await screen.findByText('Delivery partner');
    expect(screen.queryByLabelText(/Rated/)).toBeNull();
  });
});
