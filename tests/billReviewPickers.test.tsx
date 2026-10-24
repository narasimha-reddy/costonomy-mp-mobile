import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SkuPicker, SupplierPicker, lookupProblem, LOOKUP_DEBOUNCE_MS } from '@/components/wallet/review/pickers';
import { ApiError } from '@/lib/api/errors';
import { fetchSkuLookup, fetchSupplierLookup } from '@/services/wallet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/services/wallet', () => ({
  LOOKUP_MAX_QUERY: 60,
  fetchSupplierLookup: jest.fn(),
  fetchSkuLookup: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const supplierMock = fetchSupplierLookup as jest.Mock;
const skuMock = fetchSkuLookup as jest.Mock;

const apiError = (status: number, code: string, extra: { details?: Record<string, unknown>; retryAfterSeconds?: number } = {}) =>
  new ApiError({ code, message: code, status, ...extra });

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const supplierPicker = () => wrap(
  <SupplierPicker
    visible
    onClose={jest.fn()}
    current={{ id: null, name: '' }}
    readName="Kosta"
    suggestion={{ id: 41, name: 'Kosta Delights' }}
    onChoose={jest.fn()}
  />,
);

const skuPicker = () => wrap(
  <SkuPicker
    visible
    onClose={jest.fn()}
    current={null}
    suggestion={{ id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360' }}
    lineName="Prawns"
    lineUnit="KG"
    lockedIds={new Set()}
    onChoose={jest.fn()}
  />,
);

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const settle = () => advance(0);
const type = (testID: string, text: string) => act(async () => { fireEvent.changeText(screen.getByTestId(testID), text); });
const callsFor = (mock: jest.Mock, q: string) => mock.mock.calls.filter((c) => c[1] === q);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  supplierMock.mockReset().mockResolvedValue([]);
  skuMock.mockReset().mockResolvedValue([]);
});
afterEach(() => { jest.useRealTimers(); });

describe('search boxes', () => {
  it('cap the query at 60 characters', async () => {
    supplierPicker();
    await settle();
    expect(screen.getByTestId('supplier-search').props.maxLength).toBe(60);
  });

  it('cap the SKU query at 60 characters', async () => {
    skuPicker();
    await settle();
    expect(screen.getByTestId('sku-search').props.maxLength).toBe(60);
  });

  it('wait 300 ms after the typing stops, then ask once', async () => {
    supplierPicker();
    await settle();
    await type('supplier-search', 'fr');
    await advance(LOOKUP_DEBOUNCE_MS - 1);
    expect(callsFor(supplierMock, 'fr')).toHaveLength(0);
    await advance(1);
    expect(callsFor(supplierMock, 'fr')).toHaveLength(1);
    await advance(1000);
    expect(callsFor(supplierMock, 'fr')).toHaveLength(1);
  });

  it('never pass a supplier id when asking for SKUs', async () => {
    skuPicker();
    await settle();
    await type('sku-search', 'pra');
    await advance(LOOKUP_DEBOUNCE_MS);
    expect(skuMock).toHaveBeenCalledWith(7, 'pra', 'token', expect.objectContaining({ signal: expect.anything() }));
    for (const call of skuMock.mock.calls) {
      expect(call).toHaveLength(4);
      expect(call[3]).not.toHaveProperty('supplierId');
    }
  });
});

describe('a slow answer for an older query', () => {
  it('never replaces the current one', async () => {
    let resolveFr: (rows: { id: number; name: string }[]) => void = () => {};
    supplierMock.mockImplementation((_o: number, q: string) => {
      if (q === 'fr') return new Promise((resolve) => { resolveFr = resolve; });
      if (q === 'fresh') return Promise.resolve([{ id: 12, name: 'Fresh Catch' }]);
      return Promise.resolve([]);
    });
    supplierPicker();
    await settle();
    await type('supplier-search', 'fr');
    await advance(LOOKUP_DEBOUNCE_MS);
    expect(callsFor(supplierMock, 'fr')).toHaveLength(1);
    await type('supplier-search', 'fresh');
    await advance(LOOKUP_DEBOUNCE_MS);
    await advance(50);
    expect(screen.getByText('Fresh Catch')).toBeTruthy();
    await act(async () => { resolveFr([{ id: 13, name: 'Frozen Foods' }]); });
    await settle();
    expect(screen.queryByText('Frozen Foods')).toBeNull();
    expect(screen.getByText('Fresh Catch')).toBeTruthy();
  });
});

describe('lookup problems', () => {
  const notAvailable = () => apiError(403, 'INVOICE_LOOKUP_NOT_AVAILABLE');

  it('403: a quiet hint for suppliers, the suggestion and Create still work, and no more asking', async () => {
    supplierMock.mockRejectedValue(notAvailable());
    supplierPicker();
    await settle();
    expect(screen.getByText('Supplier list not available for this restaurant')).toBeTruthy();
    expect(screen.getByTestId('lookup-note').props.accessibilityRole).toBeUndefined();
    expect(screen.queryByTestId('lookup-retry')).toBeNull();
    expect(screen.getByTestId('supplier-option-41')).toBeTruthy();
    expect(screen.getByTestId('supplier-create')).toBeTruthy();
    const before = supplierMock.mock.calls.length;
    await type('supplier-search', 'kos');
    await advance(LOOKUP_DEBOUNCE_MS * 2);
    await type('supplier-search', 'kost');
    await advance(LOOKUP_DEBOUNCE_MS * 2);
    expect(supplierMock.mock.calls.length).toBe(before);
    expect(screen.getByText('Supplier list not available for this restaurant')).toBeTruthy();
    expect(screen.getByTestId('supplier-create')).toBeTruthy();
  });

  it('403: a quiet hint for SKUs, the suggestion and Create still work, and no more asking', async () => {
    skuMock.mockRejectedValue(notAvailable());
    skuPicker();
    await settle();
    expect(screen.getByText('SKU list not available for this restaurant')).toBeTruthy();
    expect(screen.getByTestId('lookup-note').props.accessibilityRole).toBeUndefined();
    expect(screen.queryByTestId('lookup-retry')).toBeNull();
    expect(screen.getByTestId('sku-option-501')).toBeTruthy();
    expect(screen.getByTestId('sku-create')).toBeTruthy();
    const before = skuMock.mock.calls.length;
    await type('sku-search', 'pra');
    await advance(LOOKUP_DEBOUNCE_MS * 2);
    expect(skuMock.mock.calls.length).toBe(before);
  });

  it('429: says how long to wait, from details.retryAfterSeconds', async () => {
    supplierMock.mockRejectedValue(apiError(429, 'RATE_LIMITED', { details: { retryAfterSeconds: 12 }, retryAfterSeconds: 5 }));
    supplierPicker();
    await settle();
    expect(screen.getByText('Too many searches, try again in 12 s')).toBeTruthy();
    expect(screen.getByTestId('lookup-retry')).toBeTruthy();
    expect(screen.getByTestId('lookup-note').props.accessibilityRole).toBe('alert');
  });

  it('503: says it is down and offers Create and Try again', async () => {
    supplierMock.mockRejectedValue(apiError(503, 'PROVIDER_UNAVAILABLE'));
    skuMock.mockRejectedValue(apiError(503, 'PROVIDER_UNAVAILABLE'));
    const supplier = supplierPicker();
    await settle();
    expect(screen.getByText('Supplier search is not available right now. You can still create one.')).toBeTruthy();
    expect(screen.getByTestId('lookup-retry')).toBeTruthy();
    supplier.unmount();
    skuPicker();
    await settle();
    expect(screen.getByText('SKU search is not available right now. You can still create one.')).toBeTruthy();
  });

  it('lookupProblem maps every case', () => {
    expect(lookupProblem(apiError(429, 'RATE_LIMITED', { retryAfterSeconds: 7.2 }), 'skus').text).toBe('Too many searches, try again in 8 s');
    expect(lookupProblem(apiError(429, 'RATE_LIMITED'), 'skus').text).toBe('Too many searches, try again in 30 s');
    expect(lookupProblem(apiError(400, 'BAD_REQUEST'), 'suppliers')).toEqual({
      text: 'Could not load your suppliers. Use the one on the bill or create one.', retry: true, quiet: false,
    });
    expect(lookupProblem(new Error('boom'), 'skus')).toEqual({
      text: 'Could not load your SKUs. Use the suggestion or create one.', retry: true, quiet: false,
    });
    expect(lookupProblem(apiError(403, 'INVOICE_LOOKUP_NOT_AVAILABLE'), 'skus')).toEqual({
      text: 'SKU list not available for this restaurant', retry: false, quiet: true,
    });
  });
});
