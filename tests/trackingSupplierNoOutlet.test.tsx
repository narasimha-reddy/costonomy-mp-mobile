import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import { TrackingScreenBody } from '@/components/delivery/TrackingScreenBody';
import { fetchDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { ApiError } from '@/lib/api/errors';

// Regression (found by the delivery e2e run): the supplier's tracking route has no OutletProvider above it, and the
// shared screen called useOutlet(), which throws outside one, so /supplier/tracking/:id crashed on open. This file
// deliberately does NOT mock '@/contexts/OutletProvider'.
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('@/lib/preferences', () => ({ getPreference: jest.fn(), setPreference: jest.fn(), removePreference: jest.fn() }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/RealtimeProvider', () => ({ useRealtime: () => ({ transport: 'poll' }) }));
jest.mock('@/services/delivery', () => ({ fetchDelivery: jest.fn(), reassignDelivery: jest.fn(), switchToOwnDelivery: jest.fn() }));
jest.mock('@/services/procurement', () => ({ fetchSupplierOrder: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

it('renders the supplier tracking screen with no OutletProvider above it', async () => {
  (fetchSupplierOrder as jest.Mock).mockResolvedValue({
    id: 5, orderNumber: 'ORD-5', status: 'CONFIRMED', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
    storeName: 'FF', outletName: 'Cafe', outletId: 1, supplierStoreId: 2, totalAmount: '1180.00', items: [],
  });
  (fetchDelivery as jest.Mock).mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'none' }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><TrackingScreenBody audience="supplier" orderId={5} /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  expect(await screen.findByText('New order to prepare')).toBeTruthy();
});
