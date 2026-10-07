import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RestaurantHome from '@/app/restaurant/(tabs)/index';
import SearchScreen from '@/app/restaurant/search';
import { HINT_INTERVAL_MS, HINT_TRANSITION_MS } from '@/lib/search/hints';

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
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' }, outletId: 7 }),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/components/restaurant/RestaurantHeader', () => ({ RestaurantHeader: () => null }));
jest.mock('@/components/restaurant/PopularSuppliersCarousel', () => ({ PopularSuppliersCarousel: () => null }));
jest.mock('@/hooks/useAddToRequest', () => ({ useAddToRequest: () => jest.fn() }));
jest.mock('@/hooks/useRecentSearches', () => ({
  useRecentSearches: () => ({ recent: [], remember: jest.fn(), clear: jest.fn() }),
}));
jest.mock('@/services/catalog', () => ({
  fetchCategories: jest.fn().mockResolvedValue([]),
  searchProducts: jest.fn().mockResolvedValue([]),
  searchSkus: jest.fn().mockResolvedValue([]),
  searchSuppliers: jest.fn().mockResolvedValue({ items: [] }),
}));
jest.mock('@/services/procurement', () => ({ fetchOutletOrders: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/intent', () => ({ fetchIntents: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/quickscan', () => ({ fetchQuickScanConfig: jest.fn().mockResolvedValue(null) }));

const hint = () => screen.queryByText(/^Search "/, { includeHiddenElements: true });

function mount(el: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>{el}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('search bars rotate their hint', () => {
  it('Home shows the hint, rotates it, and still navigates on press', () => {
    mount(<RestaurantHome />);
    expect(hint()).toHaveTextContent('Search "paneer"');
    act(() => { jest.advanceTimersByTime(HINT_INTERVAL_MS + HINT_TRANSITION_MS); });
    expect(hint()).toHaveTextContent('Search "rice"');
    fireEvent.press(screen.getByRole('search'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/search');
  });

  it('Search screen shows the hint while empty and drops it on the first character', () => {
    mount(<SearchScreen />);
    expect(hint()).toHaveTextContent('Search "paneer"');
    const input = screen.getByLabelText('Search for products');
    expect(input.props.placeholder).toBe('');
    fireEvent.changeText(input, 'r');
    expect(hint()).toBeNull();
    fireEvent.changeText(input, '');
    expect(hint()).toHaveTextContent('Search "paneer"');
  });
});
