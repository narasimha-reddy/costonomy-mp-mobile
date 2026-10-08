import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SupplierOrdersScreen from '@/app/supplier/(tabs)/orders';
import { fetchActiveOrders, fetchOrderHistory, fetchPendingOrders } from '@/services/supplier';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 3 }) }));
jest.mock('@/components/supplier/SupplierHeader', () => ({ SupplierHeader: () => null }));
jest.mock('@/services/supplier', () => ({
  fetchPendingOrders: jest.fn(), fetchActiveOrders: jest.fn(), fetchOrderHistory: jest.fn(),
}));

const mk = (id: number, createdAt: string, restaurantName: string) => ({
  id, orderNumber: `MP-${id}`, status: 'PLACED', createdAt, outletId: 1, outletName: null, restaurantName,
  outletLocality: null, outletCity: null, distanceKm: null, totalAmount: '100.00', acceptedAmount: '0.00',
  subtotal: '100.00', gstAmount: '0.00', paymentMethod: 'PREPAID', items: [], acceptanceDeadline: null,
  responseSlaSeconds: null, secondsRemaining: 0,
});
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

describe('Supplier Orders tab', () => {
  it('lists the New orders newest first, whatever order the server sent them in', async () => {
    (fetchPendingOrders as jest.Mock).mockResolvedValue([
      mk(1, '2026-10-06T10:00:00Z', 'Oldest Kitchen'),
      mk(3, '2026-10-08T10:00:00Z', 'Newest Kitchen'),
      mk(2, '2026-10-07T10:00:00Z', 'Middle Kitchen'),
    ]);
    (fetchActiveOrders as jest.Mock).mockResolvedValue([]);
    (fetchOrderHistory as jest.Mock).mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={client}><SupplierOrdersScreen /></QueryClientProvider>
      </SafeAreaProvider>,
    );
    await screen.findByText('Newest Kitchen');
    const shown = screen.getAllByText(/ Kitchen$/).map((node) => node.props.children as string);
    expect(shown).toEqual(['Newest Kitchen', 'Middle Kitchen', 'Oldest Kitchen']);
  });
});
