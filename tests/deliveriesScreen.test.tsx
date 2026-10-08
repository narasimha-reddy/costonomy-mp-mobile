import React from 'react';
import { ScrollView } from 'react-native';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeliveriesScreen from '@/app/restaurant/deliveries';
import { fetchOutletDeliveries, fetchOutletDeliveryRadar } from '@/services/delivery';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/restaurant/deliveries',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar' } }),
}));
jest.mock('@/services/delivery', () => ({
  ...jest.requireActual('@/services/delivery'),
  fetchOutletDeliveryRadar: jest.fn(),
  fetchOutletDeliveries: jest.fn(),
}));

const radar = fetchOutletDeliveryRadar as jest.Mock;
const clients: QueryClient[] = [];
afterEach(() => { mockPush.mockClear(); cleanup(); clients.splice(0).forEach((c) => c.clear()); });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}><DeliveriesScreen /></QueryClientProvider>,
  );
}

beforeEach(() => {
  radar.mockResolvedValue({
    outletId: 7,
    summary: {
      totalActive: 5, atDoorCount: 1, approachingCount: 1, enRouteCount: 3,
      delayedCount: 2, pendingCheckInCount: 4, requiresEscalationCount: 0,
    },
    items: [],
  });
});

describe('DeliveriesScreen filters', () => {
  it('renders four pills in one horizontal row', async () => {
    const { UNSAFE_getAllByType } = renderScreen();
    await waitFor(() => expect(screen.getByText('Active 5')).toBeTruthy());
    const scrolls = UNSAFE_getAllByType(ScrollView).filter((s) => s.props.horizontal === true);
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].props.contentContainerStyle).not.toEqual(expect.objectContaining({ flexWrap: 'wrap' }));
    expect(screen.getAllByRole('button').filter((b) => b.props.accessibilityState?.selected !== undefined)).toHaveLength(4);
  });

  it('labels are Active, Late, Needs check-in, All', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Active 5')).toBeTruthy());
    expect(screen.getByText('Late 2')).toBeTruthy();
    expect(screen.getByText('Needs check-in 4')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
  });

  it('count shows from summary', async () => {
    renderScreen();
    expect(screen.getByText('Active')).toBeTruthy(); // before the summary arrives: no count
    await waitFor(() => expect(screen.getByText('Active 5')).toBeTruthy());
    expect(screen.getByLabelText('Late, 2')).toBeTruthy();
    expect(screen.getByLabelText('Needs check-in, 4')).toBeTruthy();
    expect(screen.queryByText(/^All \d/)).toBeNull();
  });
});

function item(over: Record<string, unknown> = {}) {
  return {
    deliveryId: 1, supplierOrderId: 42, orderNumber: 'ORD-42', status: 'IN_TRANSIT',
    arrivalStage: 'EN_ROUTE', arrivalRank: 0, scheduleStatus: 'ON_SCHEDULE', minutesOverdue: null,
    etaMinutes: 12, estimatedArrivalAt: null, supplier: { supplierStoreName: 'Fresh Mandi' },
    driver: { name: null, phone: null, vehicle: null }, recommendedAction: null, actionReason: '',
    isCheckedIn: false, locationStale: false, locationAgeSeconds: null,
    ...over,
  };
}
function withItems(items: unknown[]) {
  radar.mockResolvedValue({
    outletId: 7,
    summary: { totalActive: 1, atDoorCount: 0, approachingCount: 0, enRouteCount: 1, delayedCount: 0, pendingCheckInCount: 0, requiresEscalationCount: 0 },
    items,
  });
}

describe('DeliveriesScreen cards', () => {
  it('live card shows Arriving in N mins and Track', async () => {
    withItems([item()]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('Arriving in 12 mins')).toBeTruthy());
    expect(screen.getByText('Fresh Mandi')).toBeTruthy();
    expect(screen.getByText('Order ORD-42')).toBeTruthy();
    expect(screen.getByLabelText('Track order ORD-42')).toBeTruthy();
  });

  it('late card shows N mins past slot', async () => {
    withItems([item({ scheduleStatus: 'RUNNING_LATE', minutesOverdue: 17, etaMinutes: 5 })]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('17 mins past slot')).toBeTruthy());
    expect(screen.queryByText(/Arriving in/)).toBeNull();
    expect(screen.queryByText(/5 mins/)).toBeNull();
  });

  it('Track opens tracking', async () => {
    withItems([item()]);
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText('Track order ORD-42')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Track order ORD-42'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/tracking/42');
  });

  it('empty filter one-line state', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('No active deliveries right now')).toBeTruthy());
    expect(screen.queryByText(/New deliveries will appear/)).toBeNull();
    fireEvent.press(screen.getByText('Late 2'));
    await waitFor(() => expect(screen.getByText('No deliveries are running late')).toBeTruthy());
    expect(screen.queryByText(/All incoming deliveries are on schedule/)).toBeNull();
  });

  it('card without eta shows the expected slot, not a made-up arrival', async () => {
    withItems([item({ etaMinutes: null, estimatedArrivalAt: null })]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('Order ORD-42')).toBeTruthy());
    expect(screen.queryByText(/Arriving in/)).toBeNull();
    expect(screen.getByText('Slot to be confirmed')).toBeTruthy();
  });
});

describe('DeliveriesScreen duplicates removed', () => {
  it('has no second filter strip: the pills carry the counts', async () => {
    withItems([item()]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('Arriving in 12 mins')).toBeTruthy());
    for (const label of ['At Door', 'Approaching', 'Delayed', 'Check-in']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('a delivered, unchecked order shows one status chip, its delivered time, and no slot placeholder', async () => {
    withItems([item({
      status: 'DELIVERED', arrivalStage: 'DELIVERED_UNCHECKED', etaMinutes: null, deliveredAt: '2026-10-07T13:21:00Z',
      recommendedAction: 'CHECK_IN', actionReason: 'Check the delivery in',
    })]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('Order ORD-42')).toBeTruthy());
    expect(screen.queryByText('Slot to be confirmed')).toBeNull();
    expect(screen.queryByText('Delivered (Unchecked)')).toBeNull();
    expect(screen.getAllByText('Delivered')).toHaveLength(1);
    expect(screen.getByText(/^Delivered at /)).toBeTruthy();
  });

  it('the arrival rank is labelled, and hidden when it is the only delivery', async () => {
    withItems([item({ arrivalRank: 3 }), item({ deliveryId: 2, supplierOrderId: 43, orderNumber: 'ORD-43', arrivalRank: 1 })]);
    renderScreen();
    expect(await screen.findByText('Arrival #3')).toBeTruthy();
    expect(screen.queryByText('#3')).toBeNull();
  });

  it('a lone delivery has no arrival badge', async () => {
    withItems([item({ arrivalRank: 1 })]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('Order ORD-42')).toBeTruthy());
    expect(screen.queryByText(/Arrival #/)).toBeNull();
  });

  it('the arrival rank follows the list as shown: a search that leaves one delivery hides it', async () => {
    withItems([item({ arrivalRank: 3 }), item({ deliveryId: 2, supplierOrderId: 43, orderNumber: 'ORD-43', arrivalRank: 1 })]);
    renderScreen();
    expect(await screen.findByText('Arrival #3')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search order, supplier, or delivery partner'), 'ORD-42');
    await waitFor(() => expect(screen.queryByText('Order ORD-43')).toBeNull());
    expect(screen.getByText('Order ORD-42')).toBeTruthy();
    expect(screen.queryByText(/Arrival #/)).toBeNull();
  });
});

describe('finished deliveries carry no live hints (All)', () => {
  const finished = (over: Record<string, unknown> = {}) => item({
    status: 'DELIVERED', arrivalStage: 'DELIVERED_UNCHECKED', etaMinutes: null, deliveredAt: '2026-10-07T13:21:00Z',
    isCheckedIn: true, scheduleStatus: 'RUNNING_LATE', recommendedAction: 'MONITOR',
    actionReason: 'Order progressing normally on schedule.', ...over,
  });
  async function openAll(items: unknown[]) {
    (fetchOutletDeliveries as jest.Mock).mockResolvedValue({ items });
    renderScreen();
    await waitFor(() => expect(screen.getByText('All')).toBeTruthy());
    fireEvent.press(screen.getByText('All'));
  }

  it('a delivered, checked-in order shows its delivered time and no recommended-action text', async () => {
    await openAll([finished({ actionReason: 'Driver running late or GPS stale. Call driver', recommendedAction: 'CALL_DRIVER' })]);
    expect(await screen.findByText(/^Delivered at /)).toBeTruthy();
    expect(screen.queryByText(/progressing normally/)).toBeNull();
    expect(screen.queryByText(/running late/i)).toBeNull();
  });

  it('shows the delivered time in 12-hour form, like the rest of the app', async () => {
    await openAll([finished()]);
    expect(await screen.findByText(/^Delivered at \d{1,2}:\d{2} (AM|PM)$/)).toBeTruthy();
  });

  const ravi = { name: 'Ravi', phone: '999', vehicle: null };

  it('offers Call on a delivery that is still moving', async () => {
    withItems([item({ driver: ravi })]);
    renderScreen();
    expect(await screen.findByText('Call')).toBeTruthy();
  });

  it('hides Call on a delivered one', async () => {
    await openAll([finished({ driver: ravi })]);
    await screen.findByText(/^Delivered at /);
    expect(screen.queryByText('Call')).toBeNull();
  });

  it('hides Call on a cancelled one', async () => {
    await openAll([finished({ status: 'CANCELLED', arrivalStage: 'EN_ROUTE', deliveredAt: null, driver: ravi })]);
    await screen.findByText('Order ORD-42');
    expect(screen.queryByText('Call')).toBeNull();
  });

  it('a delivered order still waiting for its check-in keeps the Check-in prompt', async () => {
    await openAll([finished({ isCheckedIn: false, recommendedAction: 'CHECK_IN', actionReason: 'Check the delivery in' })]);
    expect(await screen.findByText('Check the delivery in')).toBeTruthy();
    expect(screen.getByText('Check-in')).toBeTruthy();
  });

  it('an active delivery keeps its hint', async () => {
    withItems([item({ recommendedAction: 'MONITOR', actionReason: 'Order progressing normally on schedule.' })]);
    renderScreen();
    expect(await screen.findByText('Order progressing normally on schedule.')).toBeTruthy();
  });
});

describe('delivery wording says delivery partner, not driver', () => {
  it('stages and server hints are reworded', async () => {
    withItems([item({
      arrivalStage: 'AWAITING_DRIVER', status: 'DELIVERY_REQUESTED', recommendedAction: 'CALL_DRIVER',
      actionReason: 'Driver running late or GPS stale. Call driver', driver: { name: 'Ravi', phone: null, vehicle: null },
    })]);
    renderScreen();
    expect(await screen.findByText('Awaiting Delivery Partner')).toBeTruthy();
    expect(screen.getByText('Delivery partner running late or GPS stale. Call delivery partner')).toBeTruthy();
    expect(screen.queryByText(/driver/i)).toBeNull();
  });

  it('the search finds a delivery by its hint in the new words', async () => {
    withItems([item({ actionReason: 'Driver running late' })]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('Order ORD-42')).toBeTruthy());
    expect(screen.getByLabelText('Search order, supplier, or delivery partner')).toBeTruthy();
  });
});
