import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SkuPicker, SupplierPicker } from '@/components/wallet/review/pickers';
import { formatUnitPrice } from '@/lib/wallet/pickerFormat';
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
const supplierPicker = (props: Record<string, unknown> = {}) => wrap(
  <SupplierPicker visible onClose={jest.fn()} current={{ id: null, name: '' }} readName={null} suggestion={null} onChoose={jest.fn()} {...props} />,
);
const skuPicker = (props: Record<string, unknown> = {}) => wrap(
  <SkuPicker visible onClose={jest.fn()} current={null} suggestion={null} lineName={null} lineUnit="KG" lockedIds={new Set()} onChoose={jest.fn()} {...props} />,
);
const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const settle = () => advance(0);
const type = (testID: string, text: string) => act(async () => { fireEvent.changeText(screen.getByTestId(testID), text); });

beforeEach(() => {
  jest.useFakeTimers();
  supplierMock.mockReset().mockResolvedValue([]);
  skuMock.mockReset().mockResolvedValue([]);
});
afterEach(() => { jest.useRealTimers(); });

describe('L6 empty text only without an error note', () => {
  it('supplier: no empty text beside a 503 note', async () => {
    supplierMock.mockRejectedValue(apiError(503, 'PROVIDER_UNAVAILABLE'));
    supplierPicker();
    await settle();
    await type('supplier-search', 'zzz');
    await advance(400);
    await advance(50);
    expect(screen.getByTestId('lookup-note')).toBeTruthy();
    expect(screen.queryByText(/No supplier matches/)).toBeNull();
  });
  it('supplier: shows the empty text with no error', async () => {
    supplierPicker();
    await settle();
    await type('supplier-search', 'zzz');
    await advance(400);
    await advance(50);
    expect(screen.getByText(/No supplier matches/)).toBeTruthy();
  });
  it('sku: no empty text beside a 403 note or 429', async () => {
    skuMock.mockRejectedValue(apiError(429, 'RATE_LIMITED', { retryAfterSeconds: 5 }));
    skuPicker();
    await settle();
    expect(screen.getByTestId('lookup-note')).toBeTruthy();
    expect(screen.queryByText(/Type to search your SKUs|No SKU matches/)).toBeNull();
  });
  it('sku: shows the empty text with no error', async () => {
    skuPicker();
    await settle();
    expect(screen.getByText('Type to search your SKUs.')).toBeTruthy();
  });
});

describe('L7 create name length', () => {
  it('supplier: maxLength 150 and 200-char prefill cut to 150', async () => {
    supplierPicker();
    await settle();
    await type('supplier-search', 'x'.repeat(50));
    fireEvent.press(screen.getByTestId('supplier-create'));
    const input = screen.getByTestId('new-supplier-name');
    expect(input.props.maxLength).toBe(150);
    expect(input.props.value).toHaveLength(50);
  });
  it('supplier: long readName prefill is cut', async () => {
    supplierPicker({ readName: 'y'.repeat(200) });
    await settle();
    fireEvent.press(screen.getByTestId('supplier-create'));
    const input = screen.getByTestId('new-supplier-name');
    expect(input.props.maxLength).toBe(150);
    expect(input.props.value).toHaveLength(150);
  });
  it('sku: maxLength 150 and 200-char prefill cut to 150', async () => {
    skuPicker({ startInCreate: true, lineName: 'z'.repeat(200) });
    await settle();
    const input = screen.getByTestId('new-sku-name');
    expect(input.props.maxLength).toBe(150);
    expect(input.props.value).toHaveLength(150);
  });
});

describe('L8 unit price format', () => {
  it.each([
    ['0.4525', 'GM', '₹0.4525/GM'],
    ['0.36', 'GM', '₹0.36/GM'],
    ['0.3600', 'GM', '₹0.36/GM'],
    ['120', 'KG', '₹120.00/KG'],
    ['1200.5', null, '₹1,200.50'],
    ['0.45259', 'GM', '₹0.4526/GM'],
    ['100000', 'KG', '₹1,00,000.00/KG'],
  ])('%s %s -> %s', (price, unit, out) => {
    expect(formatUnitPrice(price, unit)).toBe(out);
  });
  it('null price -> null', () => { expect(formatUnitPrice(null, 'KG')).toBeNull(); });
  it('renders in the SKU row', async () => {
    skuMock.mockResolvedValue([{ id: 9, name: 'Saffron', unit: 'GM', unitPrice: '0.4525' }]);
    skuPicker();
    await settle();
    expect(screen.getByText('₹0.4525/GM')).toBeTruthy();
  });
});

describe('L9a searching indicator', () => {
  it('shows Searching… while pending and hides it after', async () => {
    let resolve: (v: unknown[]) => void = () => {};
    supplierMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    supplierPicker();
    await settle();
    const el = screen.getByText('Searching…');
    expect(el).toBeTruthy();
    expect(el.props.accessibilityLiveRegion).toBe('polite');
    await act(async () => { resolve([]); });
    await settle();
    expect(screen.queryByText('Searching…')).toBeNull();
  });
});

describe('L9b 429 countdown', () => {
  it('counts down, keeps search and retry disabled, then re-enables', async () => {
    supplierMock.mockRejectedValue(apiError(429, 'RATE_LIMITED', { details: { retryAfterSeconds: 3 } }));
    supplierPicker();
    await settle();
    expect(screen.getByText('Too many searches, try again in 3 s')).toBeTruthy();
    expect(screen.getByTestId('supplier-search').props.editable).toBe(false);
    expect(screen.getByTestId('lookup-retry').props.accessibilityState?.disabled).toBe(true);
    await advance(1000);
    expect(screen.getByText('Too many searches, try again in 2 s')).toBeTruthy();
    await advance(1000);
    expect(screen.getByText('Too many searches, try again in 1 s')).toBeTruthy();
    expect(screen.getByTestId('supplier-search').props.editable).toBe(false);
    await advance(1000);
    expect(screen.queryByText(/try again in/)).toBeNull();
    expect(screen.getByTestId('supplier-search').props.editable).not.toBe(false);
    expect(screen.getByTestId('lookup-retry').props.accessibilityState?.disabled).toBeFalsy();
  });
  it('clears its timer on unmount', async () => {
    supplierMock.mockRejectedValue(apiError(429, 'RATE_LIMITED', { retryAfterSeconds: 3 }));
    const r = supplierPicker();
    await settle();
    const clear = jest.spyOn(global, 'clearTimeout');
    r.unmount();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
    await advance(5000);
  });
});
