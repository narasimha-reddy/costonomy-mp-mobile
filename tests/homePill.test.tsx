import { ACTIVE_PILL_CLEARANCE } from '@/components/delivery/ActiveOrderPill';
import React from 'react';
import { StyleSheet, View } from 'react-native';
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
jest.mock('@/services/delivery', () => ({
  fetchDelivery: jest.fn(),
  fetchOutletDeliveryRadar: jest.fn().mockResolvedValue({ outletId: 7, summary: { totalActive: 0 }, items: [] }),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
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
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(5, 'DELIVERED', ago(2))]);
    mount(<RestaurantHome />);
    await screen.findByText('No orders in flight');
    expect(pill()).toBeNull();
  });

  it('shows for the latest Costonomy delivery in flight and tap opens tracking', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([
      order(1, 'OUT_FOR_DELIVERY', ago(1)),
      order(3, 'OUT_FOR_DELIVERY', ago(2), 'SUPPLIER_DELIVERY'),
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
      order(3, 'OUT_FOR_DELIVERY', ago(1), 'SUPPLIER_DELIVERY'),
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
      order(3, 'READY_FOR_PICKUP', ago(1), 'SUPPLIER_DELIVERY'),
    ]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Packed and ready')).toBeTruthy();
  });

  it('pickup order shows the pill', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(6, 'READY_FOR_PICKUP', ago(2), 'PICKUP')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Ready to collect')).toBeTruthy();
    expect(fetchDelivery).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText(/Order in progress/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/6');
  });

  it('answered request shows the pill and opens the request', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(5, 'DELIVERED', ago(2))]);
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

  it('the reply deadline reads in the app 12-hour style, not 24-hour', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([]);
    const at = (h: number, m: number) => new Date(2026, 0, 1, h, m).toISOString();
    (fetchIntents as jest.Mock).mockResolvedValue([
      { ...intent(12, 'RESPONSES_RECEIVED', '2026-01-01T08:00:00Z'), orderCreationDeadline: at(18, 5) },
    ]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Place your order before 6:05 PM')).toBeTruthy();
  });

  it('a deadline just after midnight reads 12:30 AM', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([]);
    (fetchIntents as jest.Mock).mockResolvedValue([
      { ...intent(12, 'RESPONSES_RECEIVED', '2026-01-01T08:00:00Z'), orderCreationDeadline: new Date(2026, 0, 2, 0, 30).toISOString() },
    ]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Place your order before 12:30 AM')).toBeTruthy();
  });

  it('an answered request past its order window does not show the pill', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([]);
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T08:00:00Z', false)]);
    mount(<RestaurantHome />);
    await waitFor(() => expect(fetchIntents).toHaveBeenCalled());
    await screen.findByText('No orders in flight');
    expect(screen.queryByText(/accepted your request/)).toBeNull();
  });

  it('an answered, time-limited request beats a passive in-flight order', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(3, 'PREPARING', ago(1), 'SUPPLIER_DELIVERY')]);
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T10:00:00Z')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Fresh Farms accepted your request')).toBeTruthy();
    expect(pill()).toBeNull();
  });

  it('an in-flight order shows when the answered request is past its window', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(3, 'PREPARING', ago(1), 'SUPPLIER_DELIVERY')]);
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T10:00:00Z', false)]);
    mount(<RestaurantHome />);
    await waitFor(() => expect(pill()).toBeTruthy());
    expect(screen.queryByText(/accepted your request/)).toBeNull();
  });

  it('an order 30 h old with no future schedule is skipped for the pill (the request shows) but is still listed', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(97, 'PREPARING', ago(30), 'SUPPLIER_DELIVERY')]);
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T10:00:00Z')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Fresh Farms accepted your request')).toBeTruthy();
    expect(screen.getByText(/Active orders.*\(1\)/)).toBeTruthy();
  });

  it('a stuck order alone gives no pill, but is still listed and counted', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(97, 'PREPARING', ago(30), 'SUPPLIER_DELIVERY')]);
    mount(<RestaurantHome />);
    await screen.findByText(/Active orders.*\(1\)/);
    await new Promise((r) => setTimeout(r, 50));
    expect(pill()).toBeNull();
    expect(screen.getAllByText('Fresh Farms').length).toBeGreaterThan(0);
  });

  it('a 30 h old order scheduled for a future day still appears in Active Orders, in the count, and can be the pill', async () => {
    const inTwoDays = new Date(Date.now() + 48 * 3_600_000).toISOString().slice(0, 10);
    (fetchOutletOrders as jest.Mock).mockResolvedValue([
      { ...order(41, 'CONFIRMED', ago(30), 'SUPPLIER_DELIVERY'), scheduledDeliveryDate: inTwoDays },
    ]);
    mount(<RestaurantHome />);
    expect(await screen.findByText(/Active orders.*\(1\)/)).toBeTruthy();
    expect(screen.getAllByText('Fresh Farms').length).toBeGreaterThan(0);
    await waitFor(() => expect(pill()).toBeTruthy());
  });

  it('the Active Orders count and list agree with the Orders tab: nothing in flight is hidden by age', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([
      order(1, 'OUT_FOR_DELIVERY', ago(1), 'SUPPLIER_DELIVERY'),
      order(97, 'PREPARING', ago(40), 'SUPPLIER_DELIVERY'),
      order(98, 'CONFIRMED', ago(50), 'SUPPLIER_DELIVERY'),
    ]);
    mount(<RestaurantHome />);
    await screen.findByText('1 on the way');
    expect(screen.getByText(/Active orders.*\(3\)/)).toBeTruthy();
  });

  it('only a collect-yourself order is "ready to collect"; a ready delivery order is not', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(4, 'READY_FOR_PICKUP', ago(2), 'SUPPLIER_DELIVERY')]);
    mount(<RestaurantHome />);
    await screen.findByText(/Active orders.*\(1\)/);
    expect(screen.queryByText('1 ready to collect')).toBeNull();
    expect(screen.getByText('Being prepared')).toBeTruthy();
  });

  it('a ready pickup order is counted as ready to collect', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(4, 'READY_FOR_PICKUP', ago(2), 'PICKUP')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('1 ready to collect')).toBeTruthy();
  });

  it('an answered request does not beat an order that is arriving (ETA 4 min)', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(1, 'OUT_FOR_DELIVERY', ago(1))]);
    (fetchDelivery as jest.Mock).mockResolvedValue({ ...transit, etaMinutes: 4 });
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T10:00:00Z')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('4 mins')).toBeTruthy();
    expect(screen.queryByText(/accepted your request/)).toBeNull();
  });

  it('an answered request still beats an order that is on the way but 14 minutes off', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(1, 'OUT_FOR_DELIVERY', ago(1))]);
    (fetchDelivery as jest.Mock).mockResolvedValue(transit);
    (fetchIntents as jest.Mock).mockResolvedValue([intent(12, 'RESPONSES_RECEIVED', '2026-01-01T10:00:00Z')]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Fresh Farms accepted your request')).toBeTruthy();
  });

  it('active order cards say Arranging delivery for a partner-delivery order that is ready', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(4, 'READY_FOR_PICKUP', ago(2))]);
    mount(<RestaurantHome />);
    await screen.findByText('Active orders');
    expect((await screen.findAllByText('Arranging delivery')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Ready for pickup')).toBeNull();
  });

  it('says finding a partner with no ETA badge when none is assigned', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(4, 'READY_FOR_PICKUP', ago(2))]);
    mount(<RestaurantHome />);
    expect(await screen.findByText('Assigning a delivery partner')).toBeTruthy();
    expect(screen.queryByText('arriving in')).toBeNull();
  });

  it('clears the floating pill by a fixed amount: the safe-area inset is not counted twice', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(3, 'OUT_FOR_DELIVERY', ago(1), 'SUPPLIER_DELIVERY')]);
    render(
      <SafeAreaProvider initialMetrics={{ ...metrics, insets: { ...metrics.insets, bottom: 34 } }}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
          <RestaurantHome />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    await waitFor(() => expect(pill()).toBeTruthy());
    // MandiScreen adds the inset itself, as a spacer under the scroller.
    const paddings = screen.UNSAFE_getAllByType(View).map((v) => StyleSheet.flatten(v.props.style)?.paddingBottom);
    expect(paddings).toContain(ACTIVE_PILL_CLEARANCE);
    expect(paddings).not.toContain(ACTIVE_PILL_CLEARANCE + 34);
  });

  it('orders tab shows the same pill and opens tracking', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(1, 'OUT_FOR_DELIVERY', ago(2))]);
    (fetchDelivery as jest.Mock).mockResolvedValue(transit);
    mount(<OrdersScreen />);
    expect(await screen.findByText('14 mins')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Order in progress/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/1');
  });

  it('orders tab has no pill when nothing is in flight', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(5, 'DELIVERED', ago(2))]);
    mount(<OrdersScreen />);
    await screen.findByText('No active orders');
    expect(pill()).toBeNull();
  });

  it('home and orders share one query key', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(1, 'OUT_FOR_DELIVERY', ago(2))]);
    (fetchDelivery as jest.Mock).mockResolvedValue(transit);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const home = mount(<RestaurantHome />, client);
    await screen.findByText('14 mins');
    // The Orders tab's Deliveries button adds its own radar read; the pill's reads must still be shared.
    const keys = () => client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey))
      .filter((k) => !k.includes('outlet-delivery-radar'));
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
