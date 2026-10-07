import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import { TrackingScreenBody } from '@/components/delivery/TrackingScreenBody';
import { fetchDelivery, reassignDelivery, switchToOwnDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { ApiError } from '@/lib/api/errors';

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
jest.mock('@/contexts/OutletProvider', () => ({ useOptionalOutlet: () => ({ outlet: { latitude: '12.9', longitude: '77.6' } }) }));
jest.mock('@/contexts/RealtimeProvider', () => ({ useRealtime: () => ({ transport: 'poll' }) }));
jest.mock('@/services/delivery', () => ({ fetchDelivery: jest.fn(), reassignDelivery: jest.fn(), switchToOwnDelivery: jest.fn() }));
jest.mock('@/services/procurement', () => ({ fetchSupplierOrder: jest.fn() }));

const order = {
  id: 5, orderNumber: 'ORD-5', status: 'OUT_FOR_DELIVERY', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Cafe', outletId: 1, supplierStoreId: 2, totalAmount: '1180.00', items: [
    { id: 1, productName: 'Paneer', requestedQuantity: '10', acceptedQuantity: '10', unit: 'KG' },
  ],
};
const delivery = {
  id: 9, status: 'IN_TRANSIT', mode: 'COSTONOMY', driverName: 'Ravi Kumar', driverPhone: '999', driverVehicle: 'Bike',
  trackable: true, trackingUrl: null, location: null, locationStale: false, locationAgeSeconds: null,
  etaMinutes: 12, estimatedArrivalAt: null, pickupAddress: 'Store', dropAddress: 'Outlet', failureReason: 'secret', timeline: [],
};
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup(audience: 'buyer' | 'supplier') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><TrackingScreenBody audience={audience} orderId={5} /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  (fetchSupplierOrder as jest.Mock).mockResolvedValue(order);
  (fetchDelivery as jest.Mock).mockResolvedValue(delivery);
});

describe('TrackingScreenBody', () => {
  it('shows the buyer the ETA headline, partner card and a waiting line with no location', async () => {
    setup('buyer');
    expect(await screen.findByText('Arriving in 12 mins')).toBeTruthy();
    expect(screen.getByLabelText('Call Ravi Kumar')).toBeTruthy();
    expect(screen.getByText("Waiting for the partner's location")).toBeTruthy();
    expect(screen.getByText('1 item · ₹1,180.00')).toBeTruthy();
    expect(screen.getByText('Ravi is on the way')).toBeTruthy();
    expect(screen.getByText('Step 4 of 5 · On the way')).toBeTruthy();
  });

  it('has a call button with the partner number, and no partner chat, share or masked-number line', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    setup('buyer');
    fireEvent.press(await screen.findByLabelText('Call Ravi Kumar'));
    expect(open).toHaveBeenCalledWith('tel:999');
    expect(screen.queryByLabelText(/chat with ravi/i)).toBeNull();
    expect(screen.queryByLabelText(/share/i)).toBeNull();
    expect(screen.queryByText(/masked/i)).toBeNull();
    expect(screen.queryByText(/handover code/i)).toBeNull();
    expect(screen.queryByText(/delivery instructions/i)).toBeNull();
    // Help goes to the supplier, never to the partner.
    expect(screen.getAllByLabelText('Message this supplier').length).toBeGreaterThan(0);
  });

  it('has no call button when the partner has no number', async () => {
    (fetchDelivery as jest.Mock).mockResolvedValue({ ...delivery, driverPhone: null });
    setup('buyer');
    await screen.findByText('Ravi Kumar');
    expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
  });

  it('never shows the buyer the failure reason, and offers no action', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    (fetchDelivery as jest.Mock).mockResolvedValue({
      ...delivery, status: 'QUOTE_FAILED', driverName: null, trackable: false, canSwitchToOwn: true,
    });
    setup('buyer');
    expect(await screen.findByText('Still arranging delivery')).toBeTruthy();
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryByText('I will deliver it myself')).toBeNull();
  });

  it('tells the buyer the partner changed, without the reason', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    (fetchDelivery as jest.Mock).mockResolvedValue({
      ...delivery, status: 'DRIVER_CANCELLED', driverName: null, trackable: false,
    });
    setup('buyer');
    expect(await screen.findByText('Finding a new delivery partner')).toBeTruthy();
    expect(screen.getByText('Partner changed')).toBeTruthy();
    expect(screen.getByText('Assigning a partner')).toBeTruthy();
    expect(screen.queryByText(/secret/)).toBeNull();
  });

  it('after delivery: Delivered by, Check in delivery to the receiving route, Report an issue to the dispute route', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'DELIVERED' });
    (fetchDelivery as jest.Mock).mockResolvedValue({ ...delivery, status: 'DELIVERED', deliveredAt: '2026-01-01T10:10:00' });
    setup('buyer');
    expect(await screen.findByText('Delivered by Ravi Kumar')).toBeTruthy();
    expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
    fireEvent.press(screen.getByText('Check in delivery'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/receiving/5');
    fireEvent.press(screen.getByText('Report an issue'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/dispute/5');
    expect(screen.queryByText(/rate/i)).toBeNull();
  });

  it('does not offer Check in delivery before delivery', async () => {
    setup('buyer');
    await screen.findByText('Ravi Kumar');
    expect(screen.queryByText('Check in delivery')).toBeNull();
    expect(screen.queryByText('Report an issue')).toBeNull();
  });

  it('wires the supplier Try again and I will deliver it myself to the existing mutations', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    (fetchDelivery as jest.Mock).mockResolvedValue({
      ...delivery, status: 'QUOTE_FAILED', driverName: null, trackable: false, canSwitchToOwn: true,
    });
    (reassignDelivery as jest.Mock).mockResolvedValue({ ...delivery, status: 'DELIVERY_REQUESTED', mode: 'COSTONOMY' });
    (switchToOwnDelivery as jest.Mock).mockResolvedValue({ ...delivery, mode: 'SUPPLIER_OWN' });
    setup('supplier');
    expect(await screen.findByText('No partner found yet')).toBeTruthy();
    expect(screen.getByText('Search finished')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(reassignDelivery).toHaveBeenCalledWith('token', 9, expect.any(String)));
    // Switching asks first; the server is only called once the supplier confirms.
    fireEvent.press(screen.getByText('I will deliver it myself'));
    expect(switchToOwnDelivery).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Yes, I'll deliver"));
    await waitFor(() => expect(switchToOwnDelivery).toHaveBeenCalledWith('token', 9, expect.any(String)));
  });

  it('offers the supplier Try again now while a partner is being found', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    (fetchDelivery as jest.Mock).mockResolvedValue({
      ...delivery, status: 'PROVIDER_SELECTED', driverName: null, trackable: false,
      searchStartedAt: new Date(Date.now() - 12 * 60000).toISOString(),
      retryUntil: new Date(Date.now() + 18 * 60000).toISOString(),
    });
    (reassignDelivery as jest.Mock).mockResolvedValue({ ...delivery, status: 'PROVIDER_SELECTED', mode: 'COSTONOMY' });
    setup('supplier');
    expect(await screen.findByText('Searching for a partner')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again now'));
    await waitFor(() => expect(reassignDelivery).toHaveBeenCalled());
    expect(screen.queryByText('Assigning a partner')).toBeNull();
  });

  it('drives the hero from the order alone when no delivery exists yet', async () => {
    (fetchDelivery as jest.Mock).mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'none' }));
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...order, status: 'READY_FOR_PICKUP' });
    setup('supplier');
    expect(await screen.findByText('Ready to send')).toBeTruthy();
    expect(screen.getByText('Back to order')).toBeTruthy();
  });
});
