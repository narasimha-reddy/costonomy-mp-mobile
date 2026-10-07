import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProductScreen from '@/app/restaurant/product/[id]';
import { MandiToastProvider } from '@/components/common';
import { fetchProduct, fetchRecommendations } from '@/services/catalog';
import { addIntentItem } from '@/services/intent';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '7' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 9 }) }));
jest.mock('@/hooks/useRequestBasket', () => ({
  useRequestBasket: () => ({ basket: null, drafts: [] }),
}));
jest.mock('@/services/catalog', () => ({
  fetchProduct: jest.fn(),
  fetchRecommendations: jest.fn(),
}));
jest.mock('@/services/intent', () => ({
  addIntentItem: jest.fn(),
  removeIntentItem: jest.fn(),
  updateIntentItem: jest.fn(),
}));

const offer = {
  offerId: 11, supplierSkuId: 77, supplierStoreId: 4, supplierName: 'Metro', storeName: 'Metro store',
  skuName: 'Paneer', brandName: 'Nandini', grade: null, packSize: '1', packUnit: 'KG', mrp: null,
  unitPrice: '410.00', discountAmount: null, discountPercent: null, gstRate: '5', itemTotal: '410.00',
  gstAmount: '20.50', effectiveTotal: '430.50', availability: 'AVAILABLE', availableQuantity: null,
  coversFullQuantity: true, etaMinutes: 40, distanceKm: '3.2', responseSlaSeconds: 600, explanations: [],
  score: '0.9', scoreComponents: {}, imageUrl: null, averageRating: null, ratingCount: 0,
  unitPriceInclusiveGst: '430.50', pricePerBaseUnit: '430.50', otherPackCount: 0, brandOptions: [],
};

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <ProductScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchProduct as jest.Mock).mockResolvedValue({ id: 7, name: 'Paneer', categoryName: 'Dairy', baseUnit: 'KG' });
  (fetchRecommendations as jest.Mock).mockResolvedValue({
    canonicalProductId: 7, productName: 'Paneer', requestedQuantity: '1', unit: 'KG',
    offers: [offer], unservedReason: null, hiddenByFilters: 0,
  });
  (addIntentItem as jest.Mock).mockResolvedValue({});
});

describe('the product screen quantity', () => {
  it('sends a tap that is still waiting when the screen is left, instead of dropping it', async () => {
    const view = setup();

    fireEvent.press(await screen.findByLabelText(/Increase quantity/));
    expect(addIntentItem).not.toHaveBeenCalled();
    view.unmount();

    // Straight away, not after the debounce: the screen is gone, and a timer would have gone with it.
    await act(async () => { await Promise.resolve(); });
    expect(addIntentItem).toHaveBeenCalledWith('token', 9, { supplierSkuId: 77, quantity: '1' });
  });

  it('sends one write for a burst of taps, with the last value', async () => {
    setup();
    const plus = await screen.findByLabelText(/Increase quantity/);

    fireEvent.press(plus);
    fireEvent.press(screen.getByLabelText(/Increase quantity/));
    fireEvent.press(screen.getByLabelText(/Increase quantity/));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });

    expect(addIntentItem).toHaveBeenCalledTimes(1);
    expect(addIntentItem).toHaveBeenCalledWith('token', 9, { supplierSkuId: 77, quantity: '3' });
  });
});
