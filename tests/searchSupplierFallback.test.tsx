import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SearchScreen from '@/app/restaurant/search';
import { MandiToastProvider } from '@/components/common';
import { searchProducts, searchSuppliers } from '@/services/catalog';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 9 }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/hooks/useRecentSearches', () => ({
  useRecentSearches: () => ({ recent: [], remember: jest.fn(), clear: jest.fn() }),
}));
jest.mock('@/hooks/useAddToRequest', () => ({ useAddToRequest: () => ({}) }));
jest.mock('@/services/catalog', () => ({
  searchProducts: jest.fn(), searchSkus: jest.fn(), searchSuppliers: jest.fn(),
}));

const supplier = (id: number) => ({
  supplierStoreId: id, supplierName: `Sri Balaji Traders`, storeName: `Store ${id}`, categories: [],
});
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><SearchScreen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (searchProducts as jest.Mock).mockResolvedValue([]);
  (searchSuppliers as jest.Mock).mockResolvedValue({ suppliers: [supplier(1)], beyondRadius: 0, total: 1, nextOffset: null });
});

describe('search: a supplier name typed on the Products tab', () => {
  it('says how many suppliers match and View suppliers switches to that tab', async () => {
    setup();
    fireEvent.changeText(screen.getByLabelText('Search for products'), 'Balaji');
    expect(await screen.findByText('1 supplier matches')).toBeTruthy();
    fireEvent.press(screen.getByText('View suppliers'));
    expect(await screen.findByText(/^Matching suppliers/)).toBeTruthy();
    expect(screen.getByText('Store 1')).toBeTruthy();
  });

  it('keeps the plain empty state when no supplier matches either', async () => {
    (searchSuppliers as jest.Mock).mockResolvedValue({ suppliers: [], beyondRadius: 0, total: 0, nextOffset: null });
    setup();
    fireEvent.changeText(screen.getByLabelText('Search for products'), 'zzzz');
    expect(await screen.findByText('Nothing for "zzzz"')).toBeTruthy();
    expect(screen.queryByText('View suppliers')).toBeNull();
  });
});

describe('search field focus', () => {
  it('the web focus ring is off on the input and the pill shows its own focus style', async () => {
    setup();
    const input = screen.getByLabelText('Search for products');
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ outlineStyle: 'none' });
    fireEvent(input, 'focus');
    const pill = screen.getByTestId('search-field-container');
    expect(StyleSheet.flatten(pill.props.style).borderColor).toBeDefined();
  });
});
