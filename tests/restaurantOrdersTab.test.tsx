import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import OrdersScreen from '@/app/restaurant/(tabs)/orders';
import { fetchOutletDeliveryRadar } from '@/services/delivery';
import { fetchOutletOrders } from '@/services/procurement';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), setParams: jest.fn() }),
  usePathname: () => '/restaurant/orders',
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' }, outletId: 7, loading: false }),
}));
jest.mock('@/components/restaurant/RestaurantHeader', () => ({ RestaurantHeader: () => null }));
jest.mock('@/services/procurement', () => ({ fetchOutletOrders: jest.fn() }));
jest.mock('@/services/intent', () => ({ fetchIntents: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/delivery', () => ({ fetchDelivery: jest.fn(), fetchOutletDeliveryRadar: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const done = (over: Record<string, unknown> = {}) => ({
  id: 1, orderNumber: 'ORD-1', status: 'COMPLETED', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Cafe', outletLocality: null, createdAt: '2026-10-08T10:00:00Z', totalAmount: '201.24',
  acceptedAmount: '201.24', paymentMethod: 'PREPAID', items: [], ...over,
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><OrdersScreen /></QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchOutletDeliveryRadar as jest.Mock).mockResolvedValue({
    outletId: 7, summary: { totalActive: 3 }, items: [],
  });
});

describe('Restaurant Orders tab', () => {
  it('shows the final payable after a check-in refund on a completed card, not the accepted total', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([done({ finalPayableAmount: '175.24' })]);
    mount();
    fireEvent.press(await screen.findByText('Completed'));
    expect(await screen.findByText('₹175.24')).toBeTruthy();
    expect(screen.queryByText('₹201.24')).toBeNull();
  });

  it('falls back to the order total when the server has no final payable', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([done({ status: 'DELIVERED', acceptedAmount: null })]);
    mount();
    fireEvent.press(await screen.findByText('Completed'));
    expect(await screen.findByText('₹201.24')).toBeTruthy();
  });

  it('has a Deliveries button with the active count that opens the deliveries screen', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([]);
    mount();
    const button = await screen.findByLabelText('Deliveries, 3 active');
    fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith('/restaurant/deliveries');
  });

  it('still offers Deliveries when the count is not known', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([]);
    (fetchOutletDeliveryRadar as jest.Mock).mockRejectedValue(new Error('down'));
    mount();
    await waitFor(() => expect(screen.getByLabelText('Deliveries')).toBeTruthy());
  });
});
