import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RestaurantHome from '@/app/restaurant/(tabs)/index';
import { fetchPopularSuppliers, fetchCategories } from '@/services/catalog';
import { fetchOutletOrders } from '@/services/procurement';
import { fetchDelivery } from '@/services/delivery';
import { MandiToastProvider } from '@/components/common/MandiToast';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/restaurant',
  useIsFocused: () => true,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/contexts/SessionProvider', () => ({
  useSession: () => ({
    accessToken: 'token',
    me: { memberships: [{ scopeType: 'RESTAURANT', scopeId: 5, permissions: ['CREDIT_VIEW'] }] },
  }),
}));
jest.mock('@/contexts/OutletProvider', () => {
  const outlet = { id: 7, restaurantId: 5, name: 'Gachibowli Kitchen', addressLine1: '12 Main Road', city: 'Hyderabad' };
  return {
    useOutlet: () => ({
      outlet, outlets: [outlet], outletId: 7, restaurantName: 'Sri Foods', select: jest.fn(), loading: false,
    }),
  };
});
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/hooks/useRequestBasket', () => ({ useRequestBasket: () => ({ itemCount: 0 }) }));
jest.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
jest.mock('@/hooks/useChat', () => ({ useChatThreads: () => ({ unreadCount: 0, enabled: true }) }));
jest.mock('@/hooks/useCreditAttention', () => ({ useCreditAttention: () => ({ overdue: false, dueSoon: false }) }));
jest.mock('@/hooks/useOutletCredit', () => ({ useOutletCredit: () => ({ creditFor: () => null }) }));
jest.mock('@/services/catalog', () => ({ fetchCategories: jest.fn(), fetchPopularSuppliers: jest.fn() }));
jest.mock('@/services/procurement', () => ({ fetchOutletOrders: jest.fn() }));
jest.mock('@/services/intent', () => ({ fetchIntents: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/quickscan', () => ({ fetchQuickScanConfig: jest.fn().mockResolvedValue({ enabled: true }) }));
jest.mock('@/services/delivery', () => ({ fetchDelivery: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const supplier = (id: number, name: string, extra: object = {}) => ({
  supplierStoreId: id, supplierName: `${name} Pvt`, storeName: name, locality: null, city: null,
  distanceKm: '2.5', averageRating: null, ratingCount: 0, skuCount: 10, openNow: true,
  directOrdersEnabled: false, categories: [], ...extra,
});
const LONG = 'Maharaja Wholesale Fresh Vegetables and Dairy Distributors Hyderabad';

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}><MandiToastProvider><RestaurantHome /></MandiToastProvider></QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  (fetchCategories as jest.Mock).mockReset().mockResolvedValue([
    { id: 1, parentId: null, name: 'Dairy', slug: null, imageUrl: null, displayOrder: 1 },
    { id: 2, parentId: null, name: 'Vegetables', slug: null, imageUrl: null, displayOrder: 2 },
  ]);
  (fetchPopularSuppliers as jest.Mock).mockReset().mockResolvedValue([
    supplier(1, LONG), supplier(2, 'Green Farm'), supplier(3, 'Metro Fresh'), supplier(4, 'Dairy Hub'),
  ]);
  (fetchOutletOrders as jest.Mock).mockReset().mockResolvedValue([]);
  (fetchDelivery as jest.Mock).mockReset().mockRejectedValue(new Error('none'));
});

describe('home restyle', () => {
  it('grid renders three columns', async () => {
    mount();
    const cells = await screen.findAllByTestId('recommended-cell');
    expect(cells).toHaveLength(4);
    const widths = cells.map((c) => StyleSheet.flatten(c.props.style).width);
    // Three cells (plus two gaps) must fit one row: each at most a third.
    expect(parseFloat(String(widths[0]))).toBeLessThanOrEqual(33.3);
    expect(parseFloat(String(widths[0]))).toBeGreaterThan(25);
    expect(screen.getByText('RECOMMENDED FOR YOU')).toBeTruthy();
  });

  it('supplier name wraps to two lines with ellipsis', async () => {
    mount();
    const name = await screen.findByText(LONG);
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode ?? 'tail').toBe('tail');
    const cell = screen.getAllByTestId('recommended-cell')[0];
    expect(StyleSheet.flatten(cell.props.style).height).toBeUndefined();
  });

  it('supplier names shrink to fit two lines on a narrow phone', async () => {
    mount();
    const name = await screen.findByText(LONG);
    expect(name.props.adjustsFontSizeToFit).toBe(true);
    expect(name.props.minimumFontScale).toBeLessThan(1);
  });

  it('category scroller marks the selected category', async () => {
    mount();
    const dairy = await screen.findByLabelText('Dairy');
    expect(screen.queryByTestId('category-underline')).toBeNull();
    fireEvent.press(dairy);
    expect(mockPush).toHaveBeenCalledWith('/restaurant/category/1');
    const selected = screen.getByLabelText('Dairy');
    expect(selected.props.accessibilityState).toMatchObject({ selected: true });
    const line = within(selected).getByTestId('category-underline');
    const flat = StyleSheet.flatten(line.props.style);
    expect(flat.height).toBe(2);
    expect(flat.backgroundColor).toBe(Colors.primary);
    expect(screen.getByLabelText('Vegetables').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('location header shows outlet name and address', async () => {
    mount();
    expect(await screen.findByText('Gachibowli Kitchen')).toBeTruthy();
    expect(screen.getByText('12 Main Road, Hyderabad')).toBeTruthy();
  });

  it('chips row filters the grid', async () => {
    (fetchPopularSuppliers as jest.Mock).mockResolvedValue([
      supplier(1, 'Open One'), supplier(2, 'Shut One', { openNow: false }),
    ]);
    mount();
    await screen.findByText('Shut One');
    fireEvent.press(screen.getByLabelText('Open now'));
    expect(screen.queryByText('Shut One')).toBeNull();
    expect(screen.getByText('Open One')).toBeTruthy();
  });

  it('pill and credit/wallet tiles still render', async () => {
    (fetchOutletOrders as jest.Mock).mockResolvedValue([{
      id: 1, orderNumber: 'ORD-1', status: 'OUT_FOR_DELIVERY', deliveryMode: 'COSTONOMY_DELIVERY',
      supplierName: 'Fresh Farms', storeName: 'FF', outletName: 'Cafe', outletLocality: null,
      createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), totalAmount: '100.00', paymentMethod: 'PREPAID', items: [],
    }]);
    (fetchDelivery as jest.Mock).mockResolvedValue({
      id: 9, status: 'IN_TRANSIT', mode: 'COSTONOMY', driverName: 'Ravi', trackable: true,
      etaMinutes: 14, estimatedArrivalAt: null, location: null,
    });
    mount();
    expect(await screen.findByLabelText(/Order in progress/)).toBeTruthy();
    expect(screen.getByLabelText('Wallet')).toBeTruthy();
    expect(screen.getByLabelText('Credit')).toBeTruthy();
    expect(screen.getByText('Money Transfers')).toBeTruthy();
    expect(screen.getByText('Open Requests')).toBeTruthy();
  });
});
