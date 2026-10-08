import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common/MandiToast';
import { BuyerTrackingLayout } from '@/components/delivery/BuyerTrackingLayout';
import { ApiError } from '@/lib/api/errors';
import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockStatusBar = jest.fn();
jest.mock('expo-status-bar', () => ({ StatusBar: (p: unknown) => { mockStatusBar(p); return null; } }));
const mockMap = jest.fn();
jest.mock('@/components/delivery/MandiMap', () => {
  const { View } = jest.requireActual('react-native');
  return { MandiMap: (props: any) => { mockMap(props); return <View accessibilityLabel={props.accessibilityLabel} />; } };
});
const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
const mockApi = jest.fn();
jest.mock('@/lib/api/client', () => ({ ...jest.requireActual('@/lib/api/client'), apiRequest: (...a: unknown[]) => mockApi(...a) }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));

const NOW = Date.parse('2026-01-01T10:00:00Z');
const OUTLET = { latitude: 12.9, longitude: 77.6 };
const base = {
  id: 5, orderNumber: 'ORD-5', status: 'OUT_FOR_DELIVERY', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Cafe Mocha', outletId: 1, supplierStoreId: 2, totalAmount: '1180.00',
  createdAt: '2026-01-01T09:30:00', items: [{ id: 1, productName: 'Paneer', requestedQuantity: '10', acceptedQuantity: '10', unit: 'KG' }],
};
const baseDelivery = {
  id: 9, status: 'IN_TRANSIT', mode: 'COSTONOMY', driverName: 'Ravi Kumar', driverPhone: '999', driverVehicle: 'Bike',
  trackable: true, trackingUrl: null,
  location: { latitude: '12.92', longitude: '77.6', bearing: null, recordedAt: '2026-01-01T09:59:30Z' },
  locationStale: false, locationAgeSeconds: 30, etaMinutes: 12, estimatedArrivalAt: null, pickupAddress: 'Store',
  dropAddress: '12 MG Road, Bengaluru', failureReason: null, timeline: [],
};

function setup(orderOver: object = {}, deliveryOver: object | null = {}) {
  const order = { ...base, ...orderOver } as any;
  const delivery = deliveryOver == null ? null : ({ ...baseDelivery, ...deliveryOver } as any);
  const view = orderTrackingView({ audience: 'buyer', order, delivery, nowMs: NOW });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <BuyerTrackingLayout
            order={order}
            delivery={delivery}
            view={view}
            nowMs={NOW}
            outlet={OUTLET}
            onRefresh={jest.fn()}
            refreshing={false}
            onBack={jest.fn()}
            help={null}
          />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const notRated = () => mockApi.mockRejectedValue(new ApiError({ code: 'NOT_FOUND', message: 'No rating', status: 404 }));
beforeEach(() => { mockStatusBar.mockClear(); mockPush.mockClear(); mockNavigate.mockClear(); mockMap.mockClear(); mockApi.mockReset(); notRated(); });

describe('BuyerTrackingLayout', () => {
  it('buyer IN_TRANSIT renders green header, ETA pill, map, partner card', () => {
    setup();
    expect(screen.getByTestId('tracking-header')).toBeTruthy();
    expect(screen.getByText('Order is on the way')).toBeTruthy();
    expect(screen.getByTestId('eta-pill')).toBeTruthy();
    expect(screen.getByLabelText(/^Map\. Delivery partner .* away from Cafe Mocha/)).toBeTruthy();
    expect(screen.getByText('Ravi Kumar')).toBeTruthy();
    expect(screen.getByText('Delivery partner')).toBeTruthy();
    expect(screen.getByLabelText('Call Ravi Kumar')).toBeTruthy();
    // The cards under it.
    expect(screen.getByText('Delivery at Cafe Mocha')).toBeTruthy();
    expect(screen.getByText('12 MG Road, Bengaluru')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Order ORD-5, 1 item · ₹1,180.00'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/orders/5');
  });

  it('PROVIDER_SELECTED renders Assigning a delivery partner and the placeholder with progress', () => {
    setup({ status: 'READY_FOR_PICKUP' }, { status: 'PROVIDER_SELECTED', driverName: null, driverPhone: null, trackable: false, location: null });
    expect(screen.getByText('Assigning a delivery partner')).toBeTruthy();
    expect(screen.getByText('Finding a partner near Fresh Farms')).toBeTruthy();
    expect(screen.getByText('We will show your delivery partner here as soon as one accepts.')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Finding a delivery partner' })).toBeTruthy();
    expect(screen.queryByLabelText(/^Call /)).toBeNull();
    // The old panel's wording is gone for the buyer.
    expect(screen.queryByText('Assigning a partner')).toBeNull();
  });

  it('CONFIRMED renders the placed hero, no header', () => {
    setup({ status: 'CONFIRMED' }, null);
    expect(screen.getByText(/^Order placed at /)).toBeTruthy();
    expect(screen.getByTestId('placed-tick', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('tracking-header')).toBeNull();
    expect(screen.queryByTestId('eta-pill')).toBeNull();
  });

  it('CONFIRMED placed hero says what happens next, the total, the credit line and has View order / Back to Home', () => {
    setup({ status: 'CONFIRMED', paymentMethod: 'CREDIT', creditDueDate: '2026-11-07', totalAmount: '1180.00' }, null);
    expect(screen.getByText('Fresh Farms will start packing soon')).toBeTruthy();
    expect(screen.queryByText('Waiting for supplier confirmation')).toBeNull();
    expect(screen.getByText('₹1,180.00')).toBeTruthy();
    expect(screen.getByText(/^On credit, due /)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'View order' }));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/orders/5');
    fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
    // Navigate back to the existing Home rather than stacking a second Home on top of the tracking screen.
    expect(mockNavigate).toHaveBeenCalledWith('/restaurant/(tabs)');
    expect(mockPush).not.toHaveBeenCalledWith('/restaurant');
  });

  it('the placed screen names the supplier twice at most: the header and the "will start packing" line', () => {
    setup({ status: 'CONFIRMED' }, null);
    expect(screen.getAllByText(/Fresh Farms/)).toHaveLength(2);
  });

  it('the buyer placed screen lists what happens next, three short lines', () => {
    setup({ status: 'CONFIRMED', deliveryMode: 'COSTONOMY_DELIVERY' }, null);
    expect(screen.getByText('What happens next')).toBeTruthy();
    expect(screen.getByText('The supplier packs your order')).toBeTruthy();
    expect(screen.getByText('A delivery partner is assigned')).toBeTruthy();
    expect(screen.getByText('You get a notification at each step')).toBeTruthy();
  });

  it('a self-collect order is not told a delivery partner is coming', () => {
    setup({ status: 'CONFIRMED', deliveryMode: 'PICKUP' }, null);
    expect(screen.getByText('What happens next')).toBeTruthy();
    expect(screen.queryByText('A delivery partner is assigned')).toBeNull();
  });

  it('a prepaid CONFIRMED order says Paid on the placed hero', () => {
    setup({ status: 'CONFIRMED', paymentMethod: 'PREPAID', paymentStatus: 'CAPTURED' }, null);
    expect(screen.getByText('Paid')).toBeTruthy();
  });

  it('own READY has no map and no partner', () => {
    setup({ status: 'READY_FOR_PICKUP', deliveryMode: 'SUPPLIER_DELIVERY' }, null);
    expect(screen.getByText('Packed and ready')).toBeTruthy();
    expect(screen.getByText('Fresh Farms is delivering this. No live tracking.')).toBeTruthy();
    expect(screen.queryByLabelText(/^Map/)).toBeNull();
    expect(screen.queryByText('Delivery partner')).toBeNull();
    expect(screen.queryByText(/Assigning|Finding a partner/)).toBeNull();
  });

  it('own PREPARING shows no partner line either', () => {
    setup({ status: 'PREPARING', deliveryMode: 'PICKUP' }, null);
    expect(screen.getByText('Packing your order')).toBeTruthy();
    expect(screen.queryByText("We'll assign a delivery partner soon")).toBeNull();
    expect(screen.queryByText('Assigning delivery partner shortly')).toBeNull();
    expect(screen.queryByLabelText(/^Map/)).toBeNull();
  });

  it('pickup READY says Ready to collect', () => {
    setup({ status: 'READY_FOR_PICKUP', deliveryMode: 'PICKUP' }, null);
    expect(screen.getByText('Ready to collect')).toBeTruthy();
    expect(screen.getByText('Pick up from FF')).toBeTruthy();
    expect(screen.queryByLabelText(/^Map/)).toBeNull();
  });

  it('cancelled has a neutral header', () => {
    setup({ status: 'CANCELLED', cancellationReason: 'Out of stock' }, null);
    expect(screen.getByText('Order cancelled')).toBeTruthy();
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('tracking-header').props.style).backgroundColor).toBe(Colors.surface);
    expect(screen.queryByLabelText(/^Map/)).toBeNull();
  });

  it('passes the pickup to the map only before pickup', () => {
    const coords = {
      pickupLocation: { latitude: '12.95', longitude: '77.55' }, dropLocation: { latitude: '12.91', longitude: '77.61' },
    };
    const last = () => mockMap.mock.calls[mockMap.mock.calls.length - 1][0];
    setup({ status: 'READY_FOR_PICKUP' },
      { ...coords, status: 'PROVIDER_SELECTED', driverName: null, trackable: false, location: null });
    expect(last()).toMatchObject({ mode: 'pending', driver: null, pickup: { latitude: 12.95, longitude: 77.55 },
      destination: { latitude: 12.91, longitude: 77.61 } });
    screen.unmount();

    setup({}, { ...coords, status: 'DRIVER_ASSIGNED' });
    expect(last()).toMatchObject({ mode: 'live', pickup: { latitude: 12.95, longitude: 77.55 } });
    screen.unmount();

    setup({}, { ...coords, status: 'PICKED_UP' });
    expect(last()).toMatchObject({ mode: 'live', pickup: null, destination: { latitude: 12.91, longitude: 77.61 } });
    screen.unmount();

    // Without the server's drop the outlet the app knows is used.
    setup({}, { status: 'IN_TRANSIT' });
    expect(last()).toMatchObject({ pickup: null, destination: OUTLET });
  });

  describe('receipt (DELIVERED and COMPLETED)', () => {
    const delivered = { status: 'DELIVERED', deliveredAt: '2026-01-01T10:10:00' };
    const rateRow = () => screen.queryByText('Rate this order');

    it('DELIVERED shows the receipt with Delivered at time', () => {
      setup({ status: 'DELIVERED' }, delivered);
      expect(screen.getByText('Order delivered at Cafe Mocha')).toBeTruthy();
      expect(screen.getByText(/^Delivered at \d{1,2}:\d{2} (AM|PM)$/)).toBeTruthy();
      expect(screen.getByTestId('receipt-zigzag', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByText('Delivered by Ravi Kumar')).toBeTruthy();
      expect(screen.queryByLabelText('Call Ravi Kumar')).toBeNull();
      expect(screen.queryByTestId('tracking-header')).toBeNull();
      expect(screen.queryByLabelText(/^Map/)).toBeNull();
      expect(screen.getByText('FF')).toBeTruthy();
      expect(screen.getByText('Delivery at Cafe Mocha')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Order ORD-5, 1 item · ₹1,180.00'));
      expect(mockPush).toHaveBeenCalledWith('/restaurant/orders/5');
      fireEvent.press(screen.getByText('Report an issue'));
      expect(mockPush).toHaveBeenCalledWith('/restaurant/dispute/5');
    });

    it('DELIVERED shows Check in to rate', () => {
      setup({ status: 'DELIVERED' }, delivered);
      expect(screen.getByText('Check in the delivery to rate it')).toBeTruthy();
      expect(rateRow()).toBeNull();
      // Nothing to press: the sticky Check in delivery bar (screen body) is the action.
      fireEvent.press(screen.getByTestId('detail-row-checkin'));
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockApi).not.toHaveBeenCalled();
    });

    it('hides the partner card when there is no driver name', () => {
      setup({ status: 'DELIVERED' }, { ...delivered, driverName: null });
      expect(screen.queryByText(/^Delivered by/)).toBeNull();
    });

    it('COMPLETED unrated shows Rate this order', async () => {
      setup({ status: 'COMPLETED' }, delivered);
      expect(await screen.findByText('Rate this order')).toBeTruthy();
      expect(screen.getByText('Quality, packaging and delivery')).toBeTruthy();
      expect(screen.queryByText('Check in the delivery to rate it')).toBeNull();
      fireEvent.press(screen.getByTestId('detail-row-rate'));
      expect(mockPush).toHaveBeenCalledWith('/restaurant/rating/5');
    });

    it('COMPLETED rated hides it', async () => {
      mockApi.mockResolvedValue({ id: 1, overall: 5 });
      setup({ status: 'COMPLETED' }, delivered);
      await waitFor(() => expect(mockApi).toHaveBeenCalled());
      await screen.findByText('Order delivered at Cafe Mocha');
      await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));
      expect(rateRow()).toBeNull();
      expect(screen.queryByText('Check in the delivery to rate it')).toBeNull();
    });

    it('does not offer Rate while the rating is still loading', () => {
      mockApi.mockReturnValue(new Promise(() => {}));
      setup({ status: 'COMPLETED' }, delivered);
      expect(rateRow()).toBeNull();
    });

    it('no rating API call is a POST', async () => {
      setup({ status: 'COMPLETED' }, delivered);
      await screen.findByText('Rate this order');
      fireEvent.press(screen.getByTestId('detail-row-rate'));
      expect(mockApi).toHaveBeenCalled();
      for (const [path, options] of mockApi.mock.calls) {
        expect(path).toBe('/api/v1/supplier-orders/5/rating');
        expect((options?.method ?? 'GET')).toBe('GET');
      }
    });
  });

  describe('white header layouts (T15 items 1 and 6)', () => {
    const lastStyles = () => mockStatusBar.mock.calls.map((c) => (c[0] as { style: string }).style);

    it('receipt uses dark status bar icons on the white bar', () => {
      setup({ status: 'DELIVERED' }, { status: 'DELIVERED', deliveredAt: '2026-01-01T09:58:00Z' });
      expect(lastStyles()).toContain('dark');
      expect(lastStyles()).not.toContain('light');
    });

    it('placed uses dark status bar icons on the white bar', () => {
      setup({ status: 'CONFIRMED' }, null);
      expect(lastStyles()).toContain('dark');
    });

    it('live keeps the light icons on the green header', () => {
      setup();
      expect(lastStyles()).toContain('light');
      expect(lastStyles()).not.toContain('dark');
    });

    it('receipt header title is the supplier name', () => {
      setup({ status: 'DELIVERED' }, { status: 'DELIVERED', deliveredAt: '2026-01-01T09:58:00Z' });
      expect(screen.getByText('Fresh Farms')).toBeTruthy();
      expect(screen.queryByText('Tracking')).toBeNull();
    });

    it('placed header title is the supplier name', () => {
      setup({ status: 'CONFIRMED' }, null);
      expect(screen.getAllByText('Fresh Farms').length).toBeGreaterThan(0);
      expect(screen.queryByText('Tracking')).toBeNull();
    });
  });
});
