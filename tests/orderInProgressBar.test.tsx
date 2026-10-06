import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OrderInProgressBar } from '@/components/delivery/OrderInProgressBar';
import OrdersScreen from '@/app/restaurant/(tabs)/orders';
import { fetchDelivery } from '@/services/delivery';
import { fetchOutletOrders } from '@/services/procurement';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 1, loading: false }) }));
jest.mock('@/components/restaurant/RestaurantHeader', () => ({ RestaurantHeader: () => null }));
jest.mock('@/services/delivery', () => ({ fetchDelivery: jest.fn() }));
jest.mock('@/services/procurement', () => ({ fetchOutletOrders: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const order = (id: number, status: string, createdAt: string, deliveryMode = 'COSTONOMY_DELIVERY') => ({
  id, orderNumber: `ORD-${id}`, status, deliveryMode, supplierName: 'Fresh Farms', storeName: 'FF', outletName: 'Cafe',
  outletLocality: null, createdAt, totalAmount: '100.00', paymentMethod: 'PREPAID', items: [],
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><OrdersScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('OrderInProgressBar', () => {
  it('shows what is happening and opens the order on tap', () => {
    const onPress = jest.fn();
    render(<OrderInProgressBar view={{ headline: 'Arriving in 14 mins', subline: 'Ravi is on the way', stage: 'bicycle' }} onPress={onPress} />);
    expect(screen.getByText('Arriving in 14 mins')).toBeTruthy();
    expect(screen.getByText('Ravi is on the way')).toBeTruthy();
    expect(screen.getByText('Track ›')).toBeTruthy();
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('orders list bar', () => {
  beforeEach(() => {
    mockPush.mockClear();
    (fetchDelivery as jest.Mock).mockRejectedValue(new Error('none'));
  });

  it('floats for the most recent order Costonomy is delivering, and opens it', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([
      order(1, 'OUT_FOR_DELIVERY', '2026-01-01T08:00:00Z'),
      order(2, 'PREPARING', '2026-01-01T06:00:00Z'),
      // Newer, but the supplier's own van: not ours to track, so never the bar.
      order(3, 'OUT_FOR_DELIVERY', '2026-01-01T09:00:00Z', 'SUPPLIER_DELIVERY'),
    ]);
    (fetchDelivery as jest.Mock).mockResolvedValue({
      id: 9, status: 'IN_TRANSIT', mode: 'COSTONOMY', driverName: 'Ravi Kumar', trackable: true,
      etaMinutes: 14, estimatedArrivalAt: null, location: null,
    });
    setup();
    expect(await screen.findByText('Arriving in 14 mins')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/Order in progress/));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/orders/1');
  });

  it('says finding a delivery partner when none is assigned yet', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(4, 'READY_FOR_PICKUP', '2026-01-01T08:00:00Z')]);
    setup();
    expect(await screen.findByLabelText(/Order in progress: Finding a delivery partner/)).toBeTruthy();
  });

  it('has no bar when nothing is in flight', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([order(5, 'DELIVERED', '2026-01-01T08:00:00Z')]);
    setup();
    await screen.findByText('No active orders');
    expect(screen.queryByLabelText(/Order in progress/)).toBeNull();
  });
});
