import React from 'react';
import { ScrollView } from 'react-native';
import { cleanup, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeliveriesScreen from '@/app/restaurant/deliveries';
import { fetchOutletDeliveryRadar } from '@/services/delivery';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
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
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

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
