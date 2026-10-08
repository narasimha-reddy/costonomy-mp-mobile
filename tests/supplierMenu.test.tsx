import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SupplierCatalogScreen from '@/app/restaurant/supplier/[id]';
import { MandiToastProvider } from '@/components/common';
import { CART_BAR_HEIGHT, MENU_BOTTOM_CLEARANCE } from '@/components/restaurant/CartBar';
import { fetchStoreCatalog, fetchStorefrontHeader } from '@/services/catalog';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '4' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 9 }) }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn() }));
jest.mock('@/services/intent', () => ({
  addIntentItem: jest.fn(), removeIntentItem: jest.fn(), updateIntentItem: jest.fn(),
}));
const mockDrafts: { current: unknown[] } = { current: [] };
jest.mock('@/hooks/useRequestBasket', () => ({
  useRequestBasket: () => ({ basket: null, drafts: mockDrafts.current }),
}));
jest.mock('@/services/catalog', () => ({
  fetchStoreCatalog: jest.fn(),
  fetchStorefrontHeader: jest.fn(),
}));

const row = (id: number, name: string) => ({
  offerId: id, supplierSkuId: id, skuName: name, brandName: 'Nandini', packSize: '1', packUnit: 'KG',
  sellingPrice: '410.00', gstRate: '5', availability: 'AVAILABLE', availableQuantity: null, imageUrl: null,
  canonicalProductId: id, canonicalProductName: name, supplierStoreId: 4, supplierName: 'Metro',
  storeName: 'Metro store', distanceKm: '3.2', openNow: true, opensAt: null, preparationMinutes: 20,
  averageRating: null, ratingCount: 0, categoryId: 1, categoryName: 'Dairy', measureValue: null, measureUnit: null,
});

const header = (ratingCount: number, averageRating: string | null) => ({
  supplierStoreId: 4, storeName: 'Metro store', supplierName: 'Metro', city: 'Bengaluru', distanceKm: '3.2',
  openNow: true, opensAt: null, etaMinutes: 40, averageRating, ratingCount, skuCount: 2,
  directOrdersEnabled: false, credit: null, otherStores: [],
});

const draftItem = (id: number, skuId: number) => ({
  id, supplierSkuId: skuId, requestedQuantity: '1', agreedLineTotal: '410.00',
});

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <SupplierCatalogScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDrafts.current = [];
  (fetchStoreCatalog as jest.Mock).mockResolvedValue([row(1, 'Paneer'), row(2, 'Curd')]);
  (fetchStorefrontHeader as jest.Mock).mockResolvedValue(header(0, null));
});

describe('the supplier menu', () => {
  it('rating badge hidden with zero ratings', async () => {
    setup();
    await screen.findByText('Paneer');
    await waitFor(() => expect(fetchStorefrontHeader).toHaveBeenCalled());
    await screen.findByText('3.2 km · Bengaluru');
    expect(screen.queryByLabelText(/^Rated /)).toBeNull();
  });

  it('rating badge shows with ratings', async () => {
    (fetchStorefrontHeader as jest.Mock).mockResolvedValue(header(18, '4.2'));
    setup();
    expect(await screen.findByLabelText('Rated 4.2 from 18 ratings')).toBeTruthy();
  });

  it('Continue bar count equals the cart count', async () => {
    mockDrafts.current = [{ supplierStoreId: 4, agreedTotal: '820.00', items: [draftItem(1, 1), draftItem(2, 2)] }];
    setup();
    await screen.findByText('Paneer');
    expect(screen.getByText('2 items added')).toBeTruthy();
    expect(screen.getByLabelText('Continue ›')).toBeTruthy();
  });

  it('Continue bar counts only this supplier and reads singular for one', async () => {
    mockDrafts.current = [
      { supplierStoreId: 4, agreedTotal: '410.00', items: [draftItem(1, 1)] },
      { supplierStoreId: 5, agreedTotal: '10.00', items: [draftItem(3, 9), draftItem(4, 8)] },
    ];
    setup();
    await screen.findByText('Paneer');
    expect(screen.getByText('1 item added')).toBeTruthy();
  });

  it('list bottom padding clears the bar', async () => {
    setup();
    await screen.findByText('Paneer');
    const pad = StyleSheet.flatten(screen.getByTestId('mandi-screen-scroll').props.contentContainerStyle)?.paddingBottom;
    expect(pad).toBeGreaterThanOrEqual(CART_BAR_HEIGHT + MENU_BOTTOM_CLEARANCE);
  });
});

describe('the supplier menu header and cart bar', () => {
  it('does not repeat the supplier name under the store name', async () => {
    (fetchStorefrontHeader as jest.Mock).mockResolvedValue({ ...header(0, null), storeName: 'Metro', supplierName: 'Metro' });
    setup();
    await screen.findByText('3.2 km · Bengaluru');
    expect(screen.getAllByText('Metro')).toHaveLength(1);
  });

  it('still names the supplier when the store has its own name', async () => {
    setup();
    await screen.findByText('3.2 km · Bengaluru');
    expect(screen.getByText('Metro')).toBeTruthy();
  });

  it('labels the ETA', async () => {
    setup();
    expect(await screen.findByText('Delivery in ~40 min')).toBeTruthy();
    expect(screen.queryByText('~40 min')).toBeNull();
  });

  it('Continue is inert with an empty cart and says what to do', async () => {
    setup();
    await screen.findByText('Paneer');
    expect(screen.getByText('Add items to continue')).toBeTruthy();
    expect(screen.getByLabelText('Continue ›').props.accessibilityState.disabled).toBe(true);
  });

  it('keeps the way to the cart when only other suppliers have items in it', async () => {
    mockDrafts.current = [{ supplierStoreId: 5, agreedTotal: '10.00', items: [draftItem(3, 9)] }];
    setup();
    await screen.findByText('Paneer');
    expect(screen.getByLabelText('Continue ›').props.accessibilityState.disabled).toBeFalsy();
  });
});
