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

  it('renders filter controls and sends active filters and sort to searchSuppliers', async () => {
    setup();
    await openSuppliers();

    expect(await screen.findByText('5 km')).toBeTruthy();
    expect(screen.getByText('10 km')).toBeTruthy();
    expect(screen.getByText('25 km')).toBeTruthy();
    expect(screen.getByText('Open now')).toBeTruthy();
    expect(screen.getByText('4+ stars')).toBeTruthy();
    expect(screen.getByText('Nearest')).toBeTruthy();

    // Toggle 10 km distance chip
    fireEvent.press(screen.getByText('10 km'));
    await waitFor(() => {
      const lastCall = (searchSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[3]).toBe(10);
    });

    // Toggle Open now
    fireEvent.press(screen.getByText('Open now'));
    await waitFor(() => {
      const lastCall = (searchSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[5]?.openNow).toBe(true);
    });

    // Toggle 4+ stars
    fireEvent.press(screen.getByText('4+ stars'));
    await waitFor(() => {
      const lastCall = (searchSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[5]?.minRating).toBe(4);
    });

    // Toggle sort to Rating
    fireEvent.press(screen.getByText('Nearest'));
    await waitFor(() => {
      const lastCall = (searchSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[5]?.sort).toBe('rating');
    });
  });

  it('shows empty state naming active filters with Clear filters button that resets filters', async () => {
    (searchSuppliers as jest.Mock).mockImplementation((_token, _term, _outlet, radius) =>
      radius === 5
        ? Promise.resolve({ suppliers: [], beyondRadius: 0, total: 0, nextOffset: null })
        : Promise.resolve({ suppliers: [supplier(1)], beyondRadius: 0, total: 1, nextOffset: null }),
    );

    setup();
    await openSuppliers();

    // Select 5 km chip which yields empty list
    fireEvent.press(screen.getByText('5 km'));

    expect(await screen.findByText('No supplier has "sup"')).toBeTruthy();
    expect(screen.getByText(/within 5 km/)).toBeTruthy();
    expect(screen.getByText('Clear filters')).toBeTruthy();

    // Press Clear filters
    fireEvent.press(screen.getByText('Clear filters'));

    // Returns to suppliers list with unfiltered data
    expect(await screen.findByText('Supplier 1')).toBeTruthy();
  });
});

