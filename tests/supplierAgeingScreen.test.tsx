import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AgeingScreen from '@/app/supplier/credit/ageing';
import { ApiError } from '@/lib/api/errors';
import { fetchAgeing } from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/supplier/credit/ageing',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/components/supplier/StoreSelector', () => ({ StoreSelector: () => null }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
jest.mock('@/services/credit', () => ({ ...jest.requireActual('@/services/credit'), fetchAgeing: jest.fn() }));
const ageingM = fetchAgeing as jest.Mock;

const top = (id: number, amount: number, over: Record<string, unknown> = {}) =>
  ({ agreementId: id, outletName: `Outlet ${id}`, restaurantName: `Restaurant ${id}`, amount, invoiceCount: 2, ...over });
const data = (over: Record<string, unknown> = {}) => ({
  asOf: '2026-10-06', total: 1000,
  buckets: [
    { bucket: 'CURRENT', amount: 500, invoiceCount: 1, restaurantCount: 1, topRestaurants: [top(1, 500)] },
    { bucket: 'D1_7', amount: 250, invoiceCount: 9, restaurantCount: 2, topRestaurants: [top(2, 200), top(3, 50)] },
    { bucket: 'D8_30', amount: 250, invoiceCount: 4, restaurantCount: 1, topRestaurants: [top(4, 250)] },
    { bucket: 'D30_PLUS', amount: 0, invoiceCount: 0, restaurantCount: 0, topRestaurants: [] },
  ],
  ...over,
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockOffline = false; });
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AgeingScreen /></QueryClientProvider>);
}
beforeEach(() => { jest.clearAllMocks(); ageingM.mockResolvedValue(data()); });

describe('Ageing screen', () => {
  it('draws the stacked bar from server amounts, not counts', async () => {
    renderScreen();
    await screen.findByTestId('ageing-bar');
    const widths = (['CURRENT', 'D1_7', 'D8_30', 'D30_PLUS'] as const)
      .map((b) => screen.getByTestId(`ageing-segment-${b}`).props.style.width ?? screen.getByTestId(`ageing-segment-${b}`).props.style.flexBasis);
    expect(widths).toEqual(['50%', '25%', '25%', '0%']);
  });

  it('shows a card per bucket in order with amount, counts, and plain explanation', async () => {
    renderScreen();
    const current = await screen.findByTestId('ageing-card-CURRENT');
    expect(within(current).getByText('Not due yet')).toBeTruthy();
    expect(within(current).getAllByText('₹500.00').length).toBe(2);
    expect(within(current).getByText('1 invoice · 1 restaurant')).toBeTruthy();
    const d17 = screen.getByTestId('ageing-card-D1_7');
    expect(within(d17).getByText('1 to 7 days late')).toBeTruthy();
    expect(within(d17).getByText('9 invoices · 2 restaurants')).toBeTruthy();
    expect(within(screen.getByTestId('ageing-card-D8_30')).getByText('8 to 30 days late')).toBeTruthy();
    expect(within(screen.getByTestId('ageing-card-D30_PLUS')).getByText('More than 30 days late')).toBeTruthy();
    expect(within(screen.getByTestId('ageing-total')).getByText('₹1,000.00')).toBeTruthy();
  });

  it('opens a top restaurant', async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId('ageing-top-D1_7-3'));
    expect(mockPush).toHaveBeenCalledWith('/supplier/credit/3');
  });

  it('says nothing to collect when the total is zero', async () => {
    ageingM.mockResolvedValue(data({ total: 0, buckets: data().buckets.map((b) => ({ ...b, amount: 0, invoiceCount: 0, restaurantCount: 0, topRestaurants: [] })) }));
    renderScreen();
    expect(await screen.findByText('Nothing to collect right now')).toBeTruthy();
    expect(screen.queryByTestId('ageing-bar')).toBeNull();
  });

  it('shows a huge amount in full and a long name on at most two lines', async () => {
    const long = 'An extremely long outlet name that will not fit on a single line of a small phone screen';
    ageingM.mockResolvedValue(data({
      total: 999999999.99,
      buckets: [
        { bucket: 'CURRENT', amount: 999999999.99, invoiceCount: 5, restaurantCount: 1, topRestaurants: [top(1, 999999999.99, { outletName: long })] },
        ...data().buckets.slice(1).map((b) => ({ ...b, amount: 0, invoiceCount: 0, restaurantCount: 0, topRestaurants: [] })),
      ],
    }));
    renderScreen();
    const card = await screen.findByTestId('ageing-card-CURRENT');
    expect(within(card).getAllByText('₹99,99,99,999.99').length).toBeGreaterThan(0);
    expect(within(card).getByText(long).props.numberOfLines).toBe(2);
  });

  it('shows loading, error with retry, and the offline banner', async () => {
    ageingM.mockRejectedValueOnce(new ApiError({ code: 'X', message: 'bad', status: 500 }));
    mockOffline = true;
    renderScreen();
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    fireEvent.press(await screen.findByText('Try Again'));
    expect(await screen.findByTestId('ageing-bar')).toBeTruthy();
    expect(ageingM).toHaveBeenCalledTimes(2);
  });

  it('gives the bar a spoken summary', async () => {
    renderScreen();
    const bar = await screen.findByTestId('ageing-bar');
    expect(bar.props.accessibilityLabel).toContain('Not due yet ₹500.00');
    expect(bar.props.accessibilityLabel).toContain('More than 30 days late ₹0.00');
  });
});
