import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SearchScreen from '@/app/restaurant/search';
import { MandiToastProvider } from '@/components/common';
import { searchSuppliers } from '@/services/catalog';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
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
  supplierStoreId: id, supplierName: `Supplier ${id}`, storeName: `Store ${id}`, categories: [],
});

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <SearchScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

async function openSuppliers() {
  fireEvent.changeText(screen.getByLabelText('Search for paneer, rice, oil and more'), 'sup');
  fireEvent.press(await screen.findByText('Suppliers'));
}

beforeEach(() => {
  jest.clearAllMocks();
  (searchSuppliers as jest.Mock).mockImplementation(
    (_token, _term, _outlet, _radius, _signal, options) => Promise.resolve(
      options?.offset ? { suppliers: [supplier(3)], beyondRadius: 0, total: 3, nextOffset: null }
        : { suppliers: [supplier(1), supplier(2)], beyondRadius: 0, total: 3, nextOffset: 2 }),
  );
});

describe('the suppliers tab', () => {
  it('shows the first page, and Load more fetches the next from nextOffset, then goes away', async () => {
    setup();
    await openSuppliers();

    expect(await screen.findByText('Supplier 1')).toBeTruthy();
    expect(screen.queryByText('Supplier 3')).toBeNull();

    fireEvent.press(screen.getByLabelText('Load more suppliers'));

    expect(await screen.findByText('Supplier 3')).toBeTruthy();
    // The earlier page stays, and the next was asked for at the offset the server gave.
    expect(screen.getByText('Supplier 1')).toBeTruthy();
    const offsets = (searchSuppliers as jest.Mock).mock.calls.map((call) => call[5]?.offset);
    expect(offsets).toEqual([0, 2]);
    await waitFor(() => expect(screen.queryByLabelText('Load more suppliers')).toBeNull());
  });
});
