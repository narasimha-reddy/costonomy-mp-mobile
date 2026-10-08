import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SupplierHome from '@/app/supplier/(tabs)/index';
import { orderInbox } from '@/lib/supplier/orderInbox';
import { fetchActiveOrders } from '@/services/supplier';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 3 }) }));
jest.mock('@/components/supplier/SupplierHeader', () => ({ SupplierHeader: () => null }));
jest.mock('@/components/supplier/RequestCarousel', () => ({ RequestCarousel: () => null }));
jest.mock('@/services/supplier', () => ({ fetchActiveOrders: jest.fn() }));

const mk = (id: number, status: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id, orderNumber: `MP-${id}`, status, createdAt, outletId: 1, outletName: 'Indiranagar', restaurantName: 'Spice Garden',
  outletLocality: 'Main Road', outletCity: 'Bengaluru', distanceKm: null, totalAmount: '100.00', acceptedAmount: '100.00',
  subtotal: '100.00', gstAmount: '0.00', paymentMethod: 'PREPAID', items: [], acceptanceDeadline: null,
  responseSlaSeconds: null, secondsRemaining: 0, ...extra,
});

describe('order inbox sections', () => {
  const orders = [
    mk(1, 'DELIVERED', '2026-10-01T10:00:00Z'),
    mk(2, 'PREPARING', '2026-10-06T10:00:00Z'),
    mk(3, 'CONFIRMED', '2026-10-06T11:00:00Z'),
    mk(4, 'CONFIRMED', '2026-10-08T11:00:00Z'),
    mk(5, 'OUT_FOR_DELIVERY', '2026-10-07T11:00:00Z'),
    mk(6, 'READY_FOR_PICKUP', '2026-10-07T12:00:00Z', { deliveryMode: 'COSTONOMY_DELIVERY' }),
  ] as never;

  it('orders sections as an action inbox and each section newest first', () => {
    const sections = orderInbox(orders);
    expect(sections.map((section) => section.title)).toEqual([
      'New orders to start', 'Packing', 'Waiting for rider', 'Out for delivery',
    ]);
    expect(sections[0]?.orders.map((order) => order.id)).toEqual([4, 3]);
  });

  const ready = (id: number, deliveryMode: string | null) =>
    mk(id, 'READY_FOR_PICKUP', '2026-10-07T12:00:00Z', { deliveryMode });

  it('a Ready order for a Costonomy rider waits for the rider', () => {
    const sections = orderInbox([ready(1, 'COSTONOMY_DELIVERY')] as never);
    expect(sections.map((section) => section.title)).toEqual(['Waiting for rider']);
  });

  it('a Ready order the supplier delivers is an action ("Ready to send out"), not waiting', () => {
    const sections = orderInbox([ready(1, 'SUPPLIER_DELIVERY')] as never);
    expect(sections.map((section) => section.title)).toEqual(['Ready to send out']);
  });

  it('a Ready order the restaurant collects waits for pickup', () => {
    const sections = orderInbox([ready(1, 'PICKUP')] as never);
    expect(sections.map((section) => section.title)).toEqual(['Waiting for pickup']);
  });

  it('puts "Ready to send out" above the waiting sections', () => {
    const sections = orderInbox([ready(1, 'PICKUP'), ready(2, 'COSTONOMY_DELIVERY'), ready(3, 'SUPPLIER_DELIVERY')] as never);
    const titles = sections.map((section) => section.title);
    expect(titles).toEqual(['Ready to send out', 'Waiting for rider', 'Waiting for pickup']);
  });

  it('shows a Ready order with no delivery mode (older API) as plain "Ready", not as waiting on anyone', () => {
    const sections = orderInbox([ready(1, null)] as never);
    expect(sections.map((section) => section.title)).toEqual(['Ready']);
  });

  it('keeps an order with a status outside the sections reachable under "Other"', () => {
    const sections = orderInbox([
      mk(1, 'PREPARING', '2026-10-06T10:00:00Z'), mk(2, 'ON_HOLD', '2026-10-06T11:00:00Z'),
      mk(3, 'ON_HOLD', '2026-10-05T10:00:00Z'), mk(4, 'DELIVERED', '2026-10-01T10:00:00Z'),
    ] as never);
    expect(sections.map((section) => section.title)).toEqual(['Packing', 'Other']);
    expect(sections[1]?.orders.map((order) => order.id)).toEqual([2, 3]);
  });

  it('hides empty sections and leaves finished orders out', () => {
    const sections = orderInbox([mk(1, 'DELIVERED', '2026-10-01T10:00:00Z'), mk(2, 'PREPARING', '2026-10-06T10:00:00Z')] as never);
    expect(sections.map((section) => section.title)).toEqual(['Packing']);
  });
});

describe('supplier home', () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <QueryClientProvider client={client}><SupplierHome /></QueryClientProvider>
      </SafeAreaProvider>,
    );
  }

  it('shows the newest new order first, not the oldest five', async () => {
    (fetchActiveOrders as jest.Mock).mockResolvedValue([
      ...[1, 2, 3, 4, 5, 6].map((n) => mk(n, 'CONFIRMED', `2026-10-0${n}T10:00:00Z`)),
      mk(99, 'CONFIRMED', '2026-10-08T10:00:00Z'),
    ]);
    setup();
    expect(await screen.findByText(/New orders to start/)).toBeTruthy();
    expect(screen.getByText('MP-99')).toBeTruthy();
    expect(screen.getByText('See all orders')).toBeTruthy();
    fireEvent.press(screen.getByText('See all orders'));
    expect(mockPush).toHaveBeenCalledWith('/supplier/(tabs)/orders');
  });

  it('shows an order with an unknown status under "Other"', async () => {
    (fetchActiveOrders as jest.Mock).mockResolvedValue([mk(55, 'ON_HOLD', '2026-10-08T10:00:00Z')]);
    setup();
    expect(await screen.findByText(/^Other/)).toBeTruthy();
    expect(screen.getByText('MP-55')).toBeTruthy();
  });
});
