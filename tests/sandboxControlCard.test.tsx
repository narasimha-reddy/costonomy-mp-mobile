import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import { SandboxControlCard } from '@/components/delivery/SandboxControlCard';
import { TrackingScreenBody } from '@/components/delivery/TrackingScreenBody';
import { sandboxNextStepLabel } from '@/lib/delivery/sandbox';
import { advanceSandboxDelivery, fetchDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOptionalOutlet: () => ({ outlet: { latitude: '12.9', longitude: '77.6' } }) }));
jest.mock('@/contexts/RealtimeProvider', () => ({ useRealtime: () => ({ transport: 'poll' }) }));
jest.mock('@/services/delivery', () => ({
  fetchDelivery: jest.fn(), reassignDelivery: jest.fn(), switchToOwnDelivery: jest.fn(), advanceSandboxDelivery: jest.fn(),
}));
jest.mock('@/services/procurement', () => ({ fetchSupplierOrder: jest.fn() }));

const order = {
  id: 5, orderNumber: 'ORD-5', status: 'READY_FOR_PICKUP', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Cafe', outletId: 1, supplierStoreId: 2, totalAmount: '1180.00', items: [
    { id: 1, productName: 'Paneer', requestedQuantity: '10', acceptedQuantity: '10', unit: 'KG' },
  ],
};
const delivery = {
  id: 9, status: 'PROVIDER_SELECTED', mode: 'COSTONOMY', driverName: null, driverPhone: null, driverVehicle: null,
  trackable: false, trackingUrl: null, location: null, locationStale: false, locationAgeSeconds: null,
  etaMinutes: null, estimatedArrivalAt: null, pickupAddress: 'Store', dropAddress: 'Outlet', failureReason: null,
  timeline: [], sandboxControls: true,
};
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup(audience: 'buyer' | 'supplier') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <TrackingScreenBody audience={audience} orderId={5} />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('sandbox rider control (test only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue(order);
    (fetchDelivery as jest.Mock).mockResolvedValue(delivery);
    (advanceSandboxDelivery as jest.Mock).mockResolvedValue({ ...delivery, status: 'DRIVER_ASSIGNED' });
  });

  it('shows the Test mode card to the supplier and the button calls the service', async () => {
    setup('supplier');
    expect(await screen.findByText('Test mode')).toBeTruthy();
    expect(screen.getByText('Pidge sandbox has no real riders. Move the rider to the next step to see the flow.')).toBeTruthy();
    fireEvent.press(screen.getByText('Assign a rider'));
    await waitFor(() => expect(advanceSandboxDelivery).toHaveBeenCalledWith('token', 9, expect.any(String)));
    // The delivery and order are fetched again so the screen follows the server.
    await waitFor(() => expect((fetchDelivery as jest.Mock).mock.calls.length).toBeGreaterThan(1));
  });

  it('never renders it for the buyer', async () => {
    setup('buyer');
    await screen.findByText('Assigning a partner');
    expect(screen.queryByText('Test mode')).toBeNull();
    expect(screen.queryByText('Assign a rider')).toBeNull();
  });

  it('is absent when the API does not offer it', async () => {
    (fetchDelivery as jest.Mock).mockResolvedValue({ ...delivery, sandboxControls: false });
    setup('supplier');
    await screen.findByText('Assigning a partner').catch(() => undefined);
    await waitFor(() => expect(fetchDelivery).toHaveBeenCalled());
    expect(screen.queryByText('Test mode')).toBeNull();
  });

  it('labels each step', () => {
    expect(['PROVIDER_SELECTED', 'DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DESTINATION']
      .map((s) => sandboxNextStepLabel(s as never))).toEqual([
      'Assign a rider', 'Rider reached your store', 'Rider picked up', 'Rider on the way', 'Rider arrived', 'Mark delivered',
    ]);
    expect(sandboxNextStepLabel('DELIVERED')).toBeNull();
  });

  it('renders nothing for a delivery with no next step', () => {
    render(<SandboxControlCard delivery={{ id: 1, status: 'DELIVERED', sandboxControls: true }} onAdvance={jest.fn()} />);
    expect(screen.queryByText('Test mode')).toBeNull();
  });
});
