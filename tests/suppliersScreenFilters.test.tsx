import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SuppliersScreen from '@/app/restaurant/suppliers';
import { MandiToastProvider } from '@/components/common';
import { fetchCategories, fetchPopularSuppliers } from '@/services/catalog';

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
jest.mock('@/hooks/useOutletCredit', () => ({ useOutletCredit: () => ({ creditFor: () => null }) }));
jest.mock('@/services/catalog', () => ({
  fetchCategories: jest.fn(),
  fetchPopularSuppliers: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

const mockSupplier = (id: number, name: string) => ({
  supplierStoreId: id,
  supplierName: name,
  storeName: `${name} Store`,
  city: 'Hyderabad',
  distanceKm: 2.5,
  averageRating: 4.5,
  ratingCount: 12,
  skuCount: 20,
  openNow: true,
  directOrdersEnabled: false,
  categories: [],
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <SuppliersScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchCategories as jest.Mock).mockResolvedValue([
    { id: 1, name: 'Dairy', slug: 'dairy', productCount: 10 },
  ]);
  (fetchPopularSuppliers as jest.Mock).mockResolvedValue([
    mockSupplier(1, 'Alpha Dairy'),
  ]);
});

describe('SuppliersScreen filter and sort bar', () => {
  it('renders filter controls and sends options to fetchPopularSuppliers', async () => {
    setup();

    expect(await screen.findByText('Alpha Dairy Store')).toBeTruthy();
    expect(screen.getByText('5 km')).toBeTruthy();
    expect(screen.getByText('10 km')).toBeTruthy();
    expect(screen.getByText('25 km')).toBeTruthy();
    expect(screen.getByText('Open now')).toBeTruthy();
    expect(screen.getByText('4+ stars')).toBeTruthy();
    expect(screen.getByText('Nearest')).toBeTruthy();

    // Toggle 5 km
    fireEvent.press(screen.getByText('5 km'));
    await waitFor(() => {
      const lastCall = (fetchPopularSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[4]?.radiusKm).toBe(5);
    });

    // Toggle Open now
    fireEvent.press(screen.getByText('Open now'));
    await waitFor(() => {
      const lastCall = (fetchPopularSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[4]?.openNow).toBe(true);
    });

    // Toggle 4+ stars
    fireEvent.press(screen.getByText('4+ stars'));
    await waitFor(() => {
      const lastCall = (fetchPopularSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[4]?.minRating).toBe(4);
    });

    // Toggle Sort
    fireEvent.press(screen.getByText('Nearest'));
    await waitFor(() => {
      const lastCall = (fetchPopularSuppliers as jest.Mock).mock.calls.at(-1);
      expect(lastCall[4]?.sort).toBe('rating');
    });
  });

  it('shows empty state naming active filters with Clear filters button', async () => {
    (fetchPopularSuppliers as jest.Mock).mockImplementation((_t, _outlet, _limit, _cat, opts) =>
      opts?.radiusKm === 5
        ? Promise.resolve([])
        : Promise.resolve([mockSupplier(1, 'Alpha Dairy')]),
    );

    setup();
    expect(await screen.findByText('Alpha Dairy Store')).toBeTruthy();

    // Apply 5 km filter to get empty state
    fireEvent.press(screen.getByText('5 km'));

    expect(await screen.findByText('No suppliers found')).toBeTruthy();
    expect(screen.getByText(/within 5 km/)).toBeTruthy();
    expect(screen.getByText('Clear filters')).toBeTruthy();

    // Clear filters
    fireEvent.press(screen.getByText('Clear filters'));

    expect(await screen.findByText('Alpha Dairy Store')).toBeTruthy();
  });
});
