import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RestaurantHome from '@/app/restaurant/(tabs)/index';
import OrdersScreen from '@/app/restaurant/(tabs)/orders';
import { fetchDelivery } from '@/services/delivery';
import { fetchOutletOrders } from '@/services/procurement';
import { fetchIntents } from '@/services/intent';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/restaurant',
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' }, outletId: 7, loading: false }),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/components/restaurant/RestaurantHeader', () => ({ RestaurantHeader: () => null }));
jest.mock('@/components/restaurant/PopularSuppliersCarousel', () => ({ PopularSuppliersCarousel: () => null }));
jest.mock('@/services/catalog', () => ({ fetchCategories: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/procurement', () => ({ fetchOutletOrders: jest.fn() }));
jest.mock('@/services/intent', () => ({ fetchIntents: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/quickscan', () => ({ fetchQuickScanConfig: jest.fn().mockResolvedValue(null) }));
jest.mock('@/services/delivery', () => ({ fetchDelivery: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const order = (id: number, status: string, createdAt: string, deliveryMode = 'COSTONOMY_DELIVERY') => ({
  id, orderNumber: `ORD-${id}`, status, deliveryMode, supplierName: 'Fresh Farms', storeName: 'FF', outletName: 'Cafe',
  outletLocality: null, createdAt, totalAmount: '100.00', paymentMethod: 'PREPAID', items: [],
});
const intent = (id: number, status: string, createdAt: string, withinOrderWindow = true) => ({
  id, status, createdAt, supplierName: 'Fresh Farms', withinOrderWindow, orderCreationDeadline: '2026-01-01T12:30:00Z',
  fulfilment: 'FULFILLED', items: [], reference: `REQ-${id}`, storeName: 'FF', serverTime: '2026-01-01T10:00:00Z',
  responseDeadline: null, orderCreationWindowSeconds: 600, responseWindowSeconds: null,
});
const transit = {
  id: 9, status: 'IN_TRANSIT', mode: 'COSTONOMY', driverName: 'Ravi Kumar', trackable: true,
  etaMinutes: 14, estimatedArrivalAt: null, location: null,
};

function mount(el: React.ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) {
  return { client, ...render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{el}</QueryClientProvider>
    </SafeAreaProvider>,
  ) };
}
const pill = () => screen.queryByLabelText(/Order in progress/);

beforeEach(() => {
  mockPush.mockClear();
  (fetchOutletOrders as jest.Mock).mockReset();
  (fetchIntents as jest.Mock).mockReset().mockResolvedValue([]);
  (fetchDelivery as jest.Mock).mockReset().mockRejectedValue(new Error('none'));
});

describe('home active-order pill', () => {
  it('hidden with nothing in flight', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(5, 'DELIVERED', '2026-01-01T08:00:00Z')]);
    mount(<RestaurantHome />);
    await screen.findByText('No orders in flight');
    expect(pill()).toBeNull();
  });

  it('shows for the latest Costonomy delivery in flight and tap opens tracking', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([
      order(1, 'OUT_FOR_DELIVERY', '2026-01-01T09:00:00Z'),
      order(3, 'OUT_FOR_DELIVERY', '2026-01-01T08:00:00Z', 'SUPPLIER_DELIVERY'),
    ]);
    (fetchDelivery as jest.Mock).mockResolvedValue(transit);
    mount(<RestaurantHome />);
    expect(await screen.findByText('14 mins')).toBeTruthy();
    expect(screen.getByText('Order is on the way')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Order in progress/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/1');
  });

  it('own delivery order shows the pill', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([
      order(3, 'OUT_FOR_DELIVERY', '2026-01-01T09:00:00Z', 'SUPPLIER_DELIVERY'),
    ]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('On the way')).toBeTruthy();
    expect(screen.queryByText('arriving in')).toBeNull();
    // Only a Costonomy delivery has a delivery record to ask about.
    expect(fetchDelivery).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText(/Order in progress/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/3');
  });

  it('own delivery order packed and ready shows the pill', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([
      order(3, 'READY_FOR_PICKUP', '2026-01-01T09:00:00Z', 'SUPPLIER_DELIVERY'),
    ]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Packed and ready')).toBeTruthy();
  });

  it('pickup order shows the pill', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(6, 'READY_FOR_PICKUP', '2026-01-01T08:00:00Z', 'PICKUP')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Ready to collect')).toBeTruthy();
    expect(fetchDelivery).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText(/Order in progress/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/6');
  });

  it('answered request shows the pill and opens the request', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(5, 'DELIVERED', '2026-01-01T08:00:00Z')]);
    (fetchIntents as jest.Mock).mockResolvedValue([
      intent(11, 'OPEN', '2026-01-01T07:00:00Z'),
      intent(12, 'RESPONSES_RECEIVED', '2026-01-01T08:00:00Z'),
    ]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Fresh Farms accepted your request')).toBeTruthy();
    expect(screen.getByText(/Place your order/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Request answered/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/requests/12');
  });

  it('an answered request past its order window does not show the pill', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([]);
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T08:00:00Z', false)]);
    mount(<RestaurantHome />);
    await waitFor(() => expect(fetchIntents).toHaveBeenCalled());
    await screen.findByText('No orders in flight');
    expect(screen.queryByText(/accepted your request/)).toBeNull();
  });

  it('in-flight order beats a pending request', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(3, 'PREPARING', '2026-01-01T09:00:00Z', 'SUPPLIER_DELIVERY')]);
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T10:00:00Z')]);
    mount(<RestaurantHome />);
    await waitFor(() => expect(screen.queryByLabelText(/Order in progress/)).toBeTruthy());
    await waitFor(() => expect(fetchIntents).toHaveBeenCalled());
    expect(screen.queryByText(/accepted your request/)).toBeNull();
  });

  it('says finding a partner with no ETA badge when none is assigned', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(4, 'READY_FOR_PICKUP', '2026-01-01T08:00:00Z')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Assigning a delivery partner')).toBeTruthy();
    expect(screen.queryByText('arriving in')).toBeNull();
  });

  it('orders tab shows the same pill and opens tracking', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(1, 'OUT_FOR_DELIVERY', '2026-01-01T08:00:00Z')]);
    (fetchDelivery as jest.Mock).mockResolvedValue(transit);
    mount(<OrdersScreen />);
    expect(await screen.findByText('14 mins')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Order in progress/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/1');
  });

  it('orders tab has no pill when nothing is in flight', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(5, 'DELIVERED', '2026-01-01T08:00:00Z')]);
    mount(<OrdersScreen />);
    await screen.findByText('No active orders');
    expect(pill()).toBeNull();
  });

  it('home and orders share one query key', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(1, 'OUT_FOR_DELIVERY', '2026-01-01T08:00:00Z')]);
    (fetchDelivery as jest.Mock).mockResolvedValue(transit);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const home = mount(<RestaurantHome />, client);
    await screen.findByText('14 mins');
    const keys = () => client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    const afterHome = keys();
    expect(afterHome.filter((k) => k === JSON.stringify(['outlet', 7, 'orders']))).toHaveLength(1);
    expect(fetchOutletOrders).toHaveBeenCalledTimes(1);
    home.unmount();

    mount(<OrdersScreen />, client);
    await screen.findByText('14 mins');
    // The orders tab reuses both cache entries: no second orders key, no second delivery key, no refetch storm.
    expect(keys().sort()).toEqual(afterHome.sort());
    expect(keys()).toContain(JSON.stringify(['supplier-order', 1, 'delivery']));
  });
});
