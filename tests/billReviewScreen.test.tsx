import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ReviewScreen from '@/app/restaurant/wallet/transaction/bill-review';
import { MandiToastProvider } from '@/components/common';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { walletInvoiceKey } from '@/lib/queryKeys';
import { addDaysISO } from '@/components/wallet/review/DateSheet';
import { todayIST } from '@/lib/wallet/billReview';
import { fetchSkuLookup, fetchSupplierLookup, fetchWalletInvoice, saveWalletInvoiceReview } from '@/services/wallet';
import type { InvoiceReviewPayload, WalletInvoice } from '@/models/wallet';
import { kostaDraft, kostaInvoice, kostaLines } from './fixtures/billReview';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDispatch = jest.fn();
const mockSetOptions = jest.fn();
let mockFocused = true;
type Listener = (e: { preventDefault: () => void; data: { action: unknown } }) => void;
const mockListeners: Record<string, Listener | null> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '184' }),
  useNavigation: () => ({
    addListener: (event: string, fn: Listener) => {
      mockListeners[event] = fn;
      return () => { if (mockListeners[event] === fn) mockListeners[event] = null; };
    },
    dispatch: mockDispatch,
    setOptions: mockSetOptions,
    isFocused: () => mockFocused,
  }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/wallet', () => ({
  fetchWalletInvoice: jest.fn(),
  saveWalletInvoiceReview: jest.fn(),
  fetchSupplierLookup: jest.fn(),
  fetchSkuLookup: jest.fn(),
  LOOKUP_MAX_QUERY: 60,
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/components/wallet/bill/ZoomableImage', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    MAX_SCALE: 4,
    MIN_SCALE: 1,
    // Pressing the stand-in image plays a failed load (an expired link).
    ZoomableImage: ({ uri, zoom, rotation, onError }: { uri: string; zoom?: number; rotation?: number; onError?: () => void }) => (
      <Text testID="zoom-image" onPress={onError}>{`${uri} zoom:${zoom ?? 1} rot:${rotation ?? 0}`}</Text>
    ),
  };
});
// Count each card's renders by position, through a memo with the same comparison as the real card's.
const mockRenders: Record<number, number> = {};
jest.mock('@/components/wallet/review/ReviewLineCard', () => {
  const actual = jest.requireActual('@/components/wallet/review/ReviewLineCard');
  const ReactMod = jest.requireActual('react');
  const Counted = ReactMod.memo((props: { position: number }) => {
    mockRenders[props.position] = (mockRenders[props.position] ?? 0) + 1;
    return ReactMod.createElement(actual.ReviewLineCard.type, props);
  });
  return { ...actual, ReviewLineCard: Counted };
});

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const fetchInvoice = fetchWalletInvoice as jest.Mock;
const saveReview = saveWalletInvoiceReview as jest.Mock;

function setup(invoice: WalletInvoice = kostaInvoice(), client?: QueryClient) {
  fetchInvoice.mockResolvedValue(invoice);
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } } });
  const view = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={qc}>
        <MandiToastProvider>
          <ReviewScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...view, client: qc };
}

const loaded = async () => { await screen.findByTestId('review-details'); };
const saveButton = () => screen.getByTestId('save-review');
const disabled = (el: ReturnType<typeof screen.getByTestId>) => el.props.accessibilityState?.disabled === true;
const statusOf = (position: number) => screen.getByTestId(`line-${position}-status`, { includeHiddenElements: true }).props.accessibilityLabel;
const footerStatus = () => screen.getByTestId('footer-status').props.children;
/** Let a refetch that has been asked for land inside act. */
const settle = (ms = 0) => act(async () => { await new Promise((r) => { setTimeout(r, ms); }); });
const sentBody = (call = 0) => saveReview.mock.calls[call][2] as InvoiceReviewPayload;

/** Sign the date off and ignore the 16/20 deviation, so the draft can be saved as it is. */
async function makeReady() {
  fireEvent.press(screen.getByTestId('confirm-date'));
  fireEvent.press(screen.getByTestId('line-1-ignore'));
  await waitFor(() => expect(disabled(saveButton())).toBe(false));
}

// Whatever a test set off last (a refetch, a toast) lands inside act, before the screen is unmounted.
afterEach(async () => { await settle(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  for (const k of Object.keys(mockListeners)) mockListeners[k] = null;
  for (const k of Object.keys(mockRenders)) delete mockRenders[Number(k)];
  (fetchSupplierLookup as jest.Mock).mockResolvedValue([]);
  (fetchSkuLookup as jest.Mock).mockResolvedValue([]);
});

describe('Review bill screen', () => {
  it('shows skeletons while loading, then the draft: three Resolved lines, the 16/20 deviation, one footer status', async () => {
    setup();
    expect(screen.getByTestId('review-loading')).toBeTruthy();
    await loaded();
    expect(screen.getByText('Review bill')).toBeTruthy();
    expect(screen.queryByText('Check what was read, fix anything wrong, then save')).toBeNull(); // no subtitle
    expect([statusOf(1), statusOf(2), statusOf(3)]).toEqual(['Resolved', 'Resolved', 'Resolved']);
    expect(screen.getAllByText('FROM INVOICE')).toHaveLength(3);
    expect(screen.getByTestId('line-1-name').props.children).toBe('16/20 prawns');
    expect(screen.getByText('₹360.00/KG')).toBeTruthy();
    expect(within(screen.getByTestId('line-1-deviation')).getByText('₹560.00')).toBeTruthy();
    expect(within(screen.getByTestId('line-1-deviation')).getByText('· deviates from ₹360.00')).toBeTruthy();
    expect(screen.queryByTestId('line-2-deviation')).toBeNull();
    expect(screen.getByTestId('line-2-price').props.children).toBe('₹450.00');
    expect(screen.getByTestId('footer-total').props.children).toBe('₹2,820.00');
    expect(screen.getByTestId('sku-count')).toHaveTextContent('SKUs (3)', { exact: false });
    // The read date waits for a sign-off, as in the cost app: the footer's one status says so, and links there.
    expect(disabled(saveButton())).toBe(true);
    expect(footerStatus()).toBe('Confirm the invoice date');
    expect(screen.getByTestId('footer-status-link')).toBeTruthy();
    // Start over lives in the header's menu, not the footer.
    expect(within(screen.getByTestId('review-footer')).queryByText('Start over')).toBeNull();
  });

  it('the line card header reads the item, its source and its status in one stop', async () => {
    setup();
    await loaded();
    const header = screen.getByLabelText('Item 1, from the bill: 16/20 prawns, Resolved');
    expect(header.props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('line-1-status', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it('Ignore clears the deviation warning; the footer says All items ready and Save is enabled', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('confirm-date'));
    fireEvent.press(screen.getByTestId('line-1-ignore'));
    expect(screen.getByTestId('line-1-ignore').props.accessibilityLabel).toBe('Ignored. Tap to flag the price again');
    expect(screen.getByText('Ignored')).toBeTruthy();
    expect(footerStatus()).toBe('All items ready');
    expect(screen.queryByTestId('footer-status-link')).toBeNull();
    expect(disabled(saveButton())).toBe(false);
  });

  it('editing an amount updates the line total, the item price and the summary preview, and renders only that card', async () => {
    setup();
    await loaded();
    const before = { ...mockRenders };
    fireEvent.changeText(screen.getByTestId('line-2-amount'), '1000');
    expect(screen.getByTestId('line-2-total').props.children).toBe('₹1,000.00');
    expect(screen.getByTestId('line-2-deviation')).toBeTruthy(); // 500 vs 300: now over +50%
    expect(screen.getByTestId('summary-subtotal').props.children).toBe('₹2,920.00');
    expect(screen.getByTestId('summary-total').props.children).toBe('₹2,920.00');
    expect(screen.getByTestId('footer-total').props.children).toBe('₹2,920.00');
    fireEvent.changeText(screen.getByTestId('line-2-tax'), '45.50');
    expect(screen.getByTestId('line-2-total').props.children).toBe('₹1,045.50');
    expect(screen.getByTestId('summary-tax').props.placeholder).toBe('45.50');
    expect(mockRenders[1]).toBe(before[1]);
    expect(mockRenders[3]).toBe(before[3]);
    expect(mockRenders[2]).toBeGreaterThan(before[2] ?? 0);
  });

  it('number fields: never read a typed comma, read pasted grouping only when unambiguous and say so, group only after editing', async () => {
    setup();
    await loaded();
    const amount = () => screen.getByTestId('line-3-amount');
    // Typing "1" then "," : the comma is refused, the value stays 1.
    fireEvent(amount(), 'focus');
    fireEvent.changeText(amount(), '1');
    fireEvent.changeText(amount(), '1,');
    expect(amount().props.value).toBe('1');
    expect(screen.getByTestId('line-3-amount-note').props.children).toBe('Use a dot for decimals');
    fireEvent.changeText(amount(), '15');
    expect(screen.queryByTestId('line-3-amount-note')).toBeNull();
    // Pasted with grouping: read, and the field says how.
    fireEvent.changeText(amount(), '1,500');
    expect(amount().props.value).toBe('1500');
    expect(screen.getByTestId('line-3-amount-note').props.children).toBe('Read as 1,500');
    // Ambiguous: refused.
    fireEvent.changeText(amount(), '1,23');
    expect(amount().props.value).toBe('1500');
    expect(screen.getByTestId('line-3-amount-note').props.children).toBe('Use a dot for decimals');
    // Grouping is shown once the field is left, and the money is what was read.
    fireEvent(amount(), 'blur');
    expect(amount().props.value).toBe('1,500');
    expect(screen.getByTestId('line-3-total').props.children).toBe('₹1,500.00');
    // A word pasted with a figure is refused, never dropped (a "k" or "L" would change it 1000x or more);
    // a third decimal on money is refused, not cut.
    const qtyBefore = screen.getByTestId('line-1-quantity').props.value;
    fireEvent.changeText(screen.getByTestId('line-1-quantity'), '2.5kg');
    expect(screen.getByTestId('line-1-quantity').props.value).toBe(qtyBefore);
    expect(screen.getByTestId('line-1-quantity-note').props.children).toBe('Use digits only');
    fireEvent.changeText(screen.getByTestId('line-1-quantity'), '1.5k');
    expect(screen.getByTestId('line-1-quantity').props.value).toBe(qtyBefore);
    expect(screen.getByTestId('line-1-quantity-note').props.children).toBe('Type the full amount');
    fireEvent.changeText(screen.getByTestId('line-1-amount'), '12.345');
    expect(screen.getByTestId('line-1-amount').props.value).toBe('1,120');
    expect(screen.getByTestId('line-1-amount-note').props.children).toBe('Use at most 2 decimals');
    const qty = screen.getByTestId('line-1-quantity');
    expect(qty.props.keyboardType).toBe('decimal-pad');
    expect(qty.props.selectTextOnFocus).toBe(true);
    expect(qty.props.returnKeyType).toBe('next');
    expect(screen.getByTestId('line-1-tax').props.returnKeyType).toBe('done');
  });

  it('a line with no SKU needs attention; the footer counts it, links to it, and Save stays disabled', async () => {
    const draft = kostaDraft();
    draft.items[0] = { ...draft.items[0]!, sku: null };
    setup(kostaInvoice({ draft }));
    await loaded();
    expect(statusOf(1)).toBe('Needs attention');
    expect(screen.getByTestId('line-1-hint')).toHaveTextContent('Choose the SKU for this item.', { exact: false });
    expect(footerStatus()).toBe('1 item needs attention');
    expect(screen.getByTestId('footer-status-link')).toBeTruthy();
    fireEvent.press(screen.getByTestId('confirm-date'));
    expect(disabled(saveButton())).toBe(true);
  });

  it('shows the empty state when there are no lines', async () => {
    setup(kostaInvoice({ draft: kostaDraft({ items: [] }) }));
    await loaded();
    expect(screen.getByText('No items yet. Add one.')).toBeTruthy();
    expect(footerStatus()).toBe('Add at least one item');
  });

  it('says so while the bill is still being read', async () => {
    setup(kostaInvoice({ status: 'READING', draft: null }));
    expect(await screen.findByText('The bill is still being read')).toBeTruthy();
  });

  it('a READ bill sent without a draft says it cannot be reviewed yet; Try again loads it once the draft comes', async () => {
    setup(kostaInvoice({ draft: null }));
    expect(await screen.findByText('This bill cannot be reviewed yet. Try again in a moment.')).toBeTruthy();
    fetchInvoice.mockResolvedValue(kostaInvoice());
    fireEvent.press(screen.getByText('Try Again'));
    await loaded();
    expect(screen.getByTestId('line-3')).toBeTruthy();
  });

  it('a load error offers Try again', async () => {
    fetchInvoice.mockRejectedValue(new ApiError({ code: 'X', message: 'x', status: 500 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: 0 } } });
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={client}><MandiToastProvider><ReviewScreen /></MandiToastProvider></QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(await screen.findByText('Something went wrong on our side. Please try again in a moment.')).toBeTruthy();
  });

  it('the invoice panel’s own header hides and shows it; the controls zoom and rotate', async () => {
    setup();
    await loaded();
    expect(screen.getByText('bill-1.jpg')).toBeTruthy();
    fireEvent.press(screen.getByTestId('zoom-in'));
    expect(screen.getByTestId('zoom-level').props.children).toEqual([150, '%']);
    fireEvent.press(screen.getByTestId('rotate'));
    const toggle = () => screen.getByTestId('toggle-invoice');
    expect(within(screen.getByTestId('invoice-panel')).getByTestId('toggle-invoice')).toBeTruthy();
    fireEvent.press(toggle());
    expect(screen.queryByTestId('zoom-in')).toBeNull();
    expect(screen.getByText('bill-1.jpg')).toBeTruthy(); // the header row stays
    expect(toggle().props.accessibilityLabel).toBe('Show invoice');
    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    fireEvent.press(toggle());
    expect(screen.getByTestId('zoom-in')).toBeTruthy();
    fireEvent.press(screen.getByTestId('panel-open'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/wallet/transaction/invoice', params: { id: '184' } });
  });

  it('expired page links: fetched again on a failure, at most once a minute, then Try again (L9)', async () => {
    const now = jest.spyOn(Date, 'now');
    try {
      setup();
      await loaded();
      const layOut = () => fireEvent(screen.getByTestId('panel-viewport'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 326, height: 260 } } });
      layOut();
      const calls = fetchInvoice.mock.calls.length;
      fireEvent.press(screen.getByTestId('zoom-image'));
      await waitFor(() => expect(fetchInvoice).toHaveBeenCalledTimes(calls + 1));
      await settle();
      fireEvent.press(screen.getByTestId('zoom-image'));
      expect(await screen.findByText('We could not load the bill photo.')).toBeTruthy();
      expect(fetchInvoice).toHaveBeenCalledTimes(calls + 1);
      // Try again fetches fresh links; a failure more than a minute later is fetched again, not given up on.
      fireEvent.press(screen.getByText('Try again'));
      await waitFor(() => expect(fetchInvoice).toHaveBeenCalledTimes(calls + 2));
      await settle();
      layOut();
      now.mockReturnValue(Date.now() + 61_000);
      fireEvent.press(await screen.findByTestId('zoom-image'));
      await waitFor(() => expect(fetchInvoice).toHaveBeenCalledTimes(calls + 3));
      await settle();
      expect(screen.queryByText('We could not load the bill photo.')).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it('filters the lines by the name on the bill or the SKU', async () => {
    setup();
    await loaded();
    expect(screen.getByTestId('line-search').props.maxLength).toBe(60);
    fireEvent.changeText(screen.getByTestId('line-search'), '21/25');
    expect(screen.getByTestId('line-2')).toBeTruthy();
    expect(screen.queryByTestId('line-1')).toBeNull();
    fireEvent.changeText(screen.getByTestId('line-search'), 'prawns 30/40');
    expect(screen.getByTestId('line-3')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('line-search'), 'crab');
    expect(screen.getByText('No items match “crab”.')).toBeTruthy();
  });

  it('Add SKU appends a blank line at the end (others keep their numbers) and opens the SKU list for it', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('add-sku'));
    expect(screen.getByTestId('line-4')).toBeTruthy();
    expect(statusOf(4)).toBe('Needs attention');
    expect(statusOf(1)).toBe('Resolved'); // line 1 is still the 16/20 line
    expect(screen.getByTestId('line-1-name').props.children).toBe('16/20 prawns');
    expect(screen.getByText('ADDED BY YOU')).toBeTruthy();
    expect(screen.getByTestId('sku-count')).toHaveTextContent('SKUs (4)', { exact: false });
    expect(footerStatus()).toBe('1 item needs attention');
    expect(await screen.findByText('Choose SKU')).toBeTruthy();
    expect(await screen.findByText('Type to search your SKUs.')).toBeTruthy(); // the lookup has answered
    await settle(100); // the sheet's list renders in batches
  });

  it('Add SKU, then closing the list without a choice, takes the blank line away again', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('add-sku'));
    await screen.findByText('Choose SKU');
    fireEvent.press(screen.getByLabelText('Close the SKU list'));
    await waitFor(() => expect(screen.queryByTestId('line-4')).toBeNull());
    expect(screen.getByTestId('sku-count')).toHaveTextContent('SKUs (3)', { exact: false });
  });

  it('an added line is saved with lineNo null, after the bill lines (C1)', async () => {
    (fetchSkuLookup as jest.Mock).mockResolvedValue([{ id: 777, name: 'Ice cubes', unit: 'KG', unitPrice: '20.00', categoryName: null }]);
    saveReview.mockResolvedValue(kostaInvoice({ version: 4 }));
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('add-sku'));
    fireEvent.press(await screen.findByTestId('sku-option-777'));
    expect(screen.getByTestId('line-4-sku')).toHaveTextContent('Ice cubes', { exact: false });
    fireEvent.changeText(screen.getByTestId('line-4-quantity'), '2');
    fireEvent.changeText(screen.getByTestId('line-4-amount'), '40');
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(sentBody().items.map((i) => i.lineNo)).toEqual([1, 2, 3, null]);
    expect(sentBody().items[3]).toEqual({
      lineNo: null, sku: { id: 777, name: 'Ice cubes', unit: 'KG', unitPrice: '20.00' }, quantity: '2', unit: 'KG', amount: '40.00', tax: null, ignoredDeviation: false,
    });
  });

  it('deletes a line only after confirming', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('line-3-delete'));
    expect(screen.getByText('Remove this item?')).toBeTruthy();
    expect(screen.getByText('“30/50 prawns” is taken off this review. Start over brings it back.')).toBeTruthy();
    fireEvent.press(screen.getByText('Keep item'));
    expect(screen.getByTestId('line-3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('line-3-delete'));
    fireEvent.press(screen.getByText('Remove item'));
    expect(screen.queryByTestId('line-3')).toBeNull();
    expect(screen.getByTestId('summary-subtotal').props.children).toBe('₹2,020.00');
  });

  it('delivery: the bill’s figure with its hint; Reset shows only once it differs, and puts it back', async () => {
    setup(kostaInvoice({ draft: kostaDraft({ delivery: '50.00', total: '2870.00' }) }));
    await loaded();
    expect(screen.getByText('Delivery charge on the bill. Edit if it is different.')).toBeTruthy();
    expect(screen.queryByTestId('summary-delivery-reset')).toBeNull();
    expect(screen.getByTestId('summary-total').props.children).toBe('₹2,870.00');
    fireEvent.changeText(screen.getByTestId('summary-delivery'), '60');
    expect(screen.getByTestId('summary-total').props.children).toBe('₹2,880.00');
    fireEvent.press(screen.getByTestId('summary-delivery-reset'));
    expect(screen.getByTestId('summary-delivery').props.value).toBe('50');
    expect(screen.queryByTestId('summary-delivery-reset')).toBeNull();
    // No delivery on the bill: the field is empty, not "0".
  });

  it('no delivery on the bill shows an empty field', async () => {
    setup();
    await loaded();
    expect(screen.getByTestId('summary-delivery').props.value).toBe('');
  });

  it('tax: the bill-level tax from the draft is shown, counted, and can be changed and reset; it is sent as typed', async () => {
    const draft = kostaDraft({ taxOverride: '180.00' });
    saveReview.mockResolvedValue(kostaInvoice({ version: 4 }));
    setup(kostaInvoice({ draft }));
    await loaded();
    expect(screen.getByTestId('summary-tax').props.value).toBe('180');
    expect(screen.getByText('Tax on the bill. Edit if it is different.')).toBeTruthy();
    expect(screen.getByTestId('summary-total').props.children).toBe('₹3,000.00');
    expect(screen.queryByTestId('summary-tax-reset')).toBeNull();
    fireEvent.changeText(screen.getByTestId('summary-tax'), '200');
    expect(screen.getByTestId('summary-total').props.children).toBe('₹3,020.00');
    fireEvent.press(screen.getByTestId('summary-tax-reset'));
    expect(screen.getByTestId('summary-tax').props.value).toBe('180');
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(saveReview).toHaveBeenCalled());
    expect(sentBody().taxOverride).toBe('180.00');
  });

  it('tax without a bill-level figure: the items’ sum shows as the placeholder and nothing is sent', async () => {
    saveReview.mockResolvedValue(kostaInvoice({ version: 4 }));
    setup();
    await loaded();
    expect(screen.getByTestId('summary-tax').props.value).toBe('');
    expect(screen.getByText('Added up from the items. Edit if the bill’s tax is different.')).toBeTruthy();
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(saveReview).toHaveBeenCalled());
    expect(sentBody().taxOverride).toBeNull();
  });

  it('picking the invoice date fills the stock-in date and signs the date off', async () => {
    setup();
    await loaded();
    expect(screen.getByTestId('invoice-date')).toHaveTextContent('1 Sep 2026', { exact: false });
    fireEvent.press(screen.getByTestId('invoice-date'));
    expect(await screen.findByText('September 2026')).toBeTruthy();
    fireEvent.press(screen.getByTestId('day-2026-09-02'));
    expect(screen.getByTestId('invoice-date')).toHaveTextContent('2 Sep 2026', { exact: false });
    expect(screen.getByTestId('stock-in-date')).toHaveTextContent('2 Sep 2026', { exact: false });
    expect(screen.queryByTestId('confirm-date-bar')).toBeNull();
  });

  it('the stock-in date cannot be picked after tomorrow (India time)', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('stock-in-date'));
    await screen.findByText('Stock-in date');
    const late = addDaysISO(todayIST(), 2);
    const lateMonth = late.slice(0, 7);
    if (lateMonth !== todayIST().slice(0, 7)) fireEvent.press(screen.getByTestId('date-next'));
    const day = screen.getByTestId(`day-${late}`);
    expect(day.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('Payment status is a two-way choice', async () => {
    setup();
    await loaded();
    expect(screen.getByTestId('payment-status-PENDING').props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('payment-status-COMPLETED'));
    expect(screen.getByTestId('payment-status-COMPLETED').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('supplier picker: the bill’s supplier first, search after 300 ms (60 characters at most), choose a result', async () => {
    (fetchSupplierLookup as jest.Mock).mockResolvedValue([{ id: 77, name: 'Fresh Catch' }]);
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('supplier-field'));
    expect(await screen.findByText('Choose supplier')).toBeTruthy();
    expect(screen.getByTestId('supplier-option-41')).toBeTruthy();
    expect(screen.getByTestId('supplier-search').props.maxLength).toBe(60);
    fireEvent.changeText(screen.getByTestId('supplier-search'), 'fresh');
    await waitFor(() => expect(fetchSupplierLookup).toHaveBeenCalledWith(7, 'fresh', 'token', expect.anything()));
    fireEvent.press(await screen.findByText('Fresh Catch'));
    expect(screen.getByTestId('supplier-field')).toHaveTextContent('Fresh Catch', { exact: false });
  });

  it('supplier picker: Create supplier names a New supplier for this review only', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('supplier-field'));
    fireEvent.press(await screen.findByTestId('supplier-create'));
    expect(screen.getByText('Only used in this review. No supplier is added to your account.')).toBeTruthy();
    expect(screen.getByTestId('new-supplier-name').props.value).toBe('KOSTA Delights');
    fireEvent.changeText(screen.getByTestId('new-supplier-name'), '');
    fireEvent.press(screen.getByTestId('new-supplier-save'));
    expect(screen.getByText('Enter the supplier’s name')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('new-supplier-name'), 'Kosta Fresh');
    fireEvent.press(screen.getByTestId('new-supplier-save'));
    const field = screen.getByTestId('supplier-field');
    expect(field).toHaveTextContent('Kosta Fresh', { exact: false });
    expect(within(field).getByText('New')).toBeTruthy();
  });

  it('supplier picker keeps working when the lookups are not available for this restaurant (403)', async () => {
    (fetchSupplierLookup as jest.Mock).mockRejectedValue(new ApiError({ code: 'INVOICE_LOOKUP_NOT_AVAILABLE', message: 'x', status: 403 }));
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('supplier-field'));
    expect(await screen.findByText('Supplier list not available for this restaurant')).toBeTruthy();
    expect(screen.getByTestId('supplier-option-41')).toBeTruthy();
    expect(screen.getByTestId('supplier-create')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('lookup-loading')).toBeNull());
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
  });

  it('SKU picker: the reading’s match is Suggested, SKUs on other lines are Added; another SKU resolves the line', async () => {
    (fetchSkuLookup as jest.Mock).mockResolvedValue([
      { id: 502, name: 'PRAWNS 21/25', unit: 'KG', unitPrice: '300.00', categoryName: 'Seafood' },
      { id: 601, name: 'Prawns 16/20 (cleaned)', unit: 'KG', unitPrice: '540.00', categoryName: 'Seafood' },
    ]);
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('line-1-sku'));
    expect(await screen.findByText('On the bill: 16/20 prawns')).toBeTruthy();
    await waitFor(() => expect(fetchSkuLookup).toHaveBeenCalledWith(7, '', 'token', expect.objectContaining({ signal: expect.anything() })));
    expect((fetchSkuLookup as jest.Mock).mock.calls[0][3]).not.toHaveProperty('supplierId');
    expect(within(screen.getByTestId('sku-option-501')).getByText('Suggested')).toBeTruthy();
    const taken = await screen.findByTestId('sku-option-502');
    expect(taken.props.accessibilityState).toMatchObject({ disabled: true });
    expect(within(taken).getByText('Added')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sku-option-601'));
    expect(screen.getByTestId('line-1-sku')).toHaveTextContent('Prawns 16/20 (cleaned)', { exact: false });
    expect(screen.queryByTestId('line-1-deviation')).toBeNull(); // 560 against 540 is fine
  });

  it('the SKU suggestion after a save is still the bill’s match, not the owner’s own earlier choice (M2)', async () => {
    const items = kostaLines().map((l) => (l.lineNo === 1 ? { ...l, sku: { id: 888, name: 'My choice', unit: 'KG', unitPrice: '560.00' } } : l));
    setup(kostaInvoice({ review: kostaDraft({ items, reviewedAt: '2026-10-03T04:00:00Z' }) }));
    await loaded();
    fireEvent.press(screen.getByTestId('line-1-sku'));
    await screen.findByText('On the bill: 16/20 prawns');
    expect(within(screen.getByTestId('sku-option-501')).getByText('Suggested')).toBeTruthy();
    expect(screen.queryByTestId('sku-option-888')).toBeNull();
    await waitFor(() => expect(fetchSkuLookup).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('lookup-loading')).toBeNull());
  });

  it('Create SKU opens the form with the line’s name and unit; the line becomes New', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('line-2-create-sku'));
    expect(await screen.findByText('New SKU')).toBeTruthy();
    expect(screen.getByTestId('new-sku-name').props.value).toBe('21/25 prawns');
    expect(screen.getByTestId('new-sku-unit-KG').props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('new-sku-unit-PCS'));
    fireEvent.changeText(screen.getByTestId('new-sku-price'), '0');
    fireEvent.press(screen.getByTestId('new-sku-save'));
    expect(screen.getByText('Enter a price above zero, or leave it blank')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('new-sku-price'), '420');
    fireEvent.press(screen.getByTestId('new-sku-save'));
    expect(screen.getByTestId('line-2-sku')).toHaveTextContent('21/25 prawns', { exact: false });
    expect(statusOf(2)).toBe('New');
    expect(screen.getByText('QTY (PCS)')).toBeTruthy();
  });

  it('Save stops on an un-ignored deviation and says why on that line', async () => {
    setup();
    await loaded();
    fireEvent.press(screen.getByTestId('confirm-date'));
    fireEvent.press(saveButton());
    expect(await screen.findByTestId('line-1-price-error')).toHaveTextContent('Check the price of “Prawns 16/20”, or tap Ignore if it is right.', { exact: false });
    expect(saveReview).not.toHaveBeenCalled();
  });

  it('Save sends exactly the review (no totals, no fromInvoice) with the version, then says so and goes back', async () => {
    saveReview.mockResolvedValue(kostaInvoice({ version: 4, review: { ...kostaDraft(), reviewedAt: '2026-10-03T04:00:00Z' } }));
    setup();
    await loaded();
    fireEvent.changeText(screen.getByTestId('invoice-number'), '1631A');
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    const [outletId, entryId, body, token, opts] = saveReview.mock.calls[0];
    expect([outletId, entryId, token]).toEqual([7, '184', 'token']);
    expect(body).toMatchObject({ version: 3, invoiceNumber: '1631A', delivery: null, taxOverride: null });
    expect(body).not.toHaveProperty('total');
    expect(body).not.toHaveProperty('deliveryOverridden');
    expect(body.items.map((i: { lineNo: number }) => i.lineNo)).toEqual([1, 2, 3]);
    expect(body.items[0]).not.toHaveProperty('fromInvoice');
    expect(body.items[0].ignoredDeviation).toBe(true);
    expect(typeof opts.idempotencyKey).toBe('string');
    expect(screen.getByText('Review saved')).toBeTruthy();
    // Leaving after a save is not stopped by the unsaved-changes guard.
    const preventDefault = jest.fn();
    mockListeners.beforeRemove?.({ preventDefault, data: { action: { type: 'GO_BACK' } } });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('a 400 puts each server message on its input and says so in the footer', async () => {
    saveReview.mockRejectedValue(new ApiError({
      code: 'VALIDATION_ERROR', message: 'Check the review', status: 400,
      details: { fields: { 'items[1].quantity': 'Enter a quantity above 0.', 'supplier.name': "Enter the supplier's name.", version: "Send the bill's version." } },
    }));
    setup();
    await loaded();
    await makeReady();
    fireEvent.press(saveButton());
    expect(await screen.findByText('Enter a quantity above 0.')).toBeTruthy();
    expect(screen.getByText("Enter the supplier's name.")).toBeTruthy();
    expect(screen.getByTestId('other-errors')).toHaveTextContent("Send the bill's version.", { exact: false });
    expect(footerStatus()).toBe('Some details need fixing. They are marked in red.');
    expect(screen.getByTestId('line-2-quantity').props['aria-invalid']).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    // Fixing the field clears its message.
    fireEvent.changeText(screen.getByTestId('line-2-quantity'), '3');
    expect(screen.queryByText('Enter a quantity above 0.')).toBeNull();
  });

  it('a 400 without field details (MALFORMED_REQUEST) shows its plain message at the top', async () => {
    saveReview.mockRejectedValue(new ApiError({ code: 'MALFORMED_REQUEST', message: 'The request could not be read.', status: 400 }));
    setup();
    await loaded();
    await makeReady();
    fireEvent.press(saveButton());
    expect(await screen.findByTestId('other-errors')).toHaveTextContent('The request could not be read.', { exact: false });
    expect(footerStatus()).toBe('Could not save. See the message at the top.');
  });

  it('409 INVOICE_CHANGED from another device: the dialog says so and Reload loads the latest', async () => {
    saveReview.mockRejectedValue(new ApiError({ code: 'INVOICE_CHANGED', message: 'Changed', status: 409 }));
    setup();
    await loaded();
    await makeReady();
    fetchInvoice.mockResolvedValue(kostaInvoice({
      version: 5, review: kostaDraft({ invoiceNumber: '7777', reviewedAt: '2026-10-03T05:00:00Z' }),
    }));
    fireEvent.press(saveButton());
    expect(await screen.findByText('This bill changed on another device')).toBeTruthy();
    expect(screen.getByText('It was saved or changed after you opened it. Reload to see the latest version. Your edits on this screen will be replaced.')).toBeTruthy();
    fireEvent.press(screen.getByText('Reload'));
    await waitFor(() => expect(screen.getByTestId('invoice-number').props.value).toBe('7777'));
    expect(screen.getByText('Loaded the latest version of this bill')).toBeTruthy();
  });

  it('409 INVOICE_CHANGED but the bill holds exactly this save (its answer was lost): Review saved', async () => {
    saveReview.mockRejectedValue(new ApiError({ code: 'INVOICE_CHANGED', message: 'Changed', status: 409 }));
    setup();
    await loaded();
    await makeReady();
    const items = kostaLines().map((l, i) => (i === 0 ? { ...l, ignoredDeviation: true } : l));
    fetchInvoice.mockResolvedValue(kostaInvoice({
      version: 4, review: kostaDraft({ items, invoiceDate: '2026-09-01', reviewedAt: '2026-10-03T05:00:00Z' }),
    }));
    fireEvent.press(saveButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Review saved')).toBeTruthy();
    expect(screen.queryByText('This bill changed on another device')).toBeNull();
  });

  it('409 INVOICE_STILL_READING keeps the edits and offers Try again', async () => {
    saveReview.mockRejectedValue(new ApiError({ code: 'INVOICE_STILL_READING', message: 'x', status: 409 }));
    setup();
    await loaded();
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(footerStatus()).toBe('The bill is still being read. Try again in a moment.'));
    expect(saveButton()).toHaveTextContent('Try again', { exact: false });
  });

  it('422 IDEMPOTENCY_KEY_REUSED is our bug: a plain error and Try again', async () => {
    saveReview.mockRejectedValue(new ApiError({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'x', status: 422 }));
    setup();
    await loaded();
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(footerStatus()).toBe('Something went wrong on our side. Your changes are kept.'));
    expect(saveButton()).toHaveTextContent('Try again', { exact: false });
  });

  it('offline: one quiet repeat, then it keeps the edits and says so; Try again saves them with the same key', async () => {
    saveReview
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce(kostaInvoice({ version: 4 }));
    setup();
    await loaded();
    fireEvent.changeText(screen.getByTestId('line-3-amount'), '810');
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(footerStatus()).toBe('You seem to be offline. Your changes are kept.'), { timeout: 3000 });
    expect(saveReview).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('line-3-amount').props.value).toBe('810');
    expect(saveButton()).toHaveTextContent('Try again', { exact: false });
    fireEvent.press(saveButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const calls = saveReview.mock.calls;
    expect(calls[2][2]).toEqual(calls[0][2]);
    expect(calls[2][4].idempotencyKey).toBe(calls[0][4].idempotencyKey);
  });

  it('while a save is in flight: Saving…, no second tap, back and the swipe are blocked, and it goes back once when done (M4)', async () => {
    let finish: (v: WalletInvoice) => void = () => {};
    saveReview.mockReturnValue(new Promise((r) => { finish = r; }));
    setup();
    await loaded();
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(saveButton()).toHaveTextContent('Saving…', { exact: false }));
    expect(disabled(saveButton())).toBe(true);
    fireEvent.press(saveButton());
    expect(saveReview).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('review-back').props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
    // Android back / header back mid-save: held, and no Discard question.
    const preventDefault = jest.fn();
    act(() => { mockListeners.beforeRemove?.({ preventDefault, data: { action: { type: 'GO_BACK' } } }); });
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
    await act(async () => { finish(kostaInvoice({ version: 4 })); });
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('a save that lands after the screen lost focus does not navigate', async () => {
    let finish: (v: WalletInvoice) => void = () => {};
    saveReview.mockReturnValue(new Promise((r) => { finish = r; }));
    setup();
    await loaded();
    await makeReady();
    fireEvent.press(saveButton());
    await waitFor(() => expect(saveButton()).toHaveTextContent('Saving…', { exact: false }));
    mockFocused = false;
    await act(async () => { finish(kostaInvoice({ version: 4 })); });
    await waitFor(() => expect(screen.getByText('Review saved')).toBeTruthy());
    await waitFor(() => expect(saveButton()).toHaveTextContent('Save review', { exact: false })); // the save has settled
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('leaving with unsaved edits asks first; Discard changes leaves', async () => {
    setup();
    await loaded();
    const untouched = jest.fn();
    mockListeners.beforeRemove?.({ preventDefault: untouched, data: { action: { type: 'GO_BACK' } } });
    expect(untouched).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('invoice-number'), '1632');
    const preventDefault = jest.fn();
    act(() => { mockListeners.beforeRemove?.({ preventDefault, data: { action: { type: 'GO_BACK' } } }); });
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByText('Discard changes?')).toBeTruthy();
    fireEvent.press(screen.getByText('Keep editing'));
    expect(mockDispatch).not.toHaveBeenCalled();
    act(() => { mockListeners.beforeRemove?.({ preventDefault, data: { action: { type: 'GO_BACK' } } }); });
    fireEvent.press(screen.getByText('Discard changes'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('Start over (header menu) after a saved review goes back to the draft, i.e. what was read (M2)', async () => {
    setup(kostaInvoice({ review: kostaDraft({ invoiceNumber: '1631-R', items: kostaLines().slice(0, 2), reviewedAt: '2026-10-03T04:00:00Z' }) }));
    await loaded();
    expect(screen.getByTestId('invoice-number').props.value).toBe('1631-R');
    expect(screen.queryByTestId('line-3')).toBeNull();
    fireEvent.press(screen.getByTestId('review-more'));
    fireEvent.press(screen.getByTestId('start-over'));
    expect(screen.getByText('Your changes are replaced with what was read from the bill.')).toBeTruthy();
    fireEvent.press(screen.getAllByText('Start over').slice(-1)[0]!);
    expect(screen.getByTestId('invoice-number').props.value).toBe('1631');
    expect(screen.getByTestId('line-3')).toBeTruthy();
    expect(screen.getByTestId('confirm-date-bar')).toBeTruthy(); // the read date waits for a sign-off again
  });

  it('after a saved review, Reset delivery goes to the bill’s figure, not the saved one (M2)', async () => {
    setup(kostaInvoice({
      draft: kostaDraft({ delivery: '50.00' }),
      review: kostaDraft({ delivery: '30.00', deliveryOverridden: true, total: '2850.00', reviewedAt: '2026-10-03T04:00:00Z' }),
    }));
    await loaded();
    expect(screen.getByTestId('summary-delivery').props.value).toBe('30');
    fireEvent.press(screen.getByTestId('summary-delivery-reset'));
    expect(screen.getByTestId('summary-delivery').props.value).toBe('50');
  });

  it('a saved review shows the server’s totals until something is changed', async () => {
    setup(kostaInvoice({ review: kostaDraft({ delivery: '30.00', deliveryOverridden: true, total: '2850.00', reviewedAt: '2026-10-03T04:00:00Z' }) }));
    await loaded();
    expect(screen.getByTestId('summary-total').props.children).toBe('₹2,850.00');
    expect(screen.getByText('As saved. Totals are worked out by Costonomy.')).toBeTruthy();
    expect(screen.queryByTestId('confirm-date-bar')).toBeNull();
    fireEvent.changeText(screen.getByTestId('line-1-amount'), '1000');
    expect(screen.getByTestId('summary-total').props.children).toBe('₹2,730.00');
    expect(screen.getByText('Preview as you type. Costonomy works out the saved totals.')).toBeTruthy();
  });

  describe('fresh data (M1)', () => {
    it('a cached copy of the bill is not used to build the form: the skeleton stays until the fresh one is in', async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 60_000 }, mutations: { retry: false, gcTime: 0 } } });
      client.setQueryData(walletInvoiceKey(7, '184'), kostaInvoice({ version: 3, draft: kostaDraft({ invoiceNumber: 'OLD' }) }));
      let answer: (v: WalletInvoice) => void = () => {};
      fetchInvoice.mockReturnValue(new Promise((r) => { answer = r; }));
      render(
        <SafeAreaProvider initialMetrics={metrics}>
          <QueryClientProvider client={client}><MandiToastProvider><ReviewScreen /></MandiToastProvider></QueryClientProvider>
        </SafeAreaProvider>,
      );
      expect(screen.getByTestId('review-loading')).toBeTruthy();
      await waitFor(() => expect(fetchInvoice).toHaveBeenCalledTimes(1)); // asked again although the cache was fresh
      expect(screen.getByTestId('review-loading')).toBeTruthy();
      await act(async () => {
        answer(kostaInvoice({ version: 5, review: kostaDraft({ invoiceNumber: 'NEW', reviewedAt: '2026-10-03T05:00:00Z' }) }));
      });
      await loaded();
      expect(screen.getByTestId('invoice-number').props.value).toBe('NEW');
      saveReview.mockResolvedValue(kostaInvoice({ version: 6 }));
      fireEvent.press(screen.getByTestId('line-1-ignore'));
      fireEvent.press(saveButton());
      await waitFor(() => expect(saveReview).toHaveBeenCalled());
      expect(sentBody().version).toBe(5);
    });

    it('nothing edited and the bill changed elsewhere: coming back to the screen rebuilds the form quietly', async () => {
      setup();
      await loaded();
      fetchInvoice.mockResolvedValue(kostaInvoice({ version: 4, review: kostaDraft({ invoiceNumber: 'THEIRS', reviewedAt: '2026-10-03T05:00:00Z' }) }));
      await act(async () => { mockListeners.focus?.({ preventDefault: () => {}, data: { action: null } }); });
      await waitFor(() => expect(screen.getByTestId('invoice-number').props.value).toBe('THEIRS'));
      expect(screen.queryByText('This bill changed on another device')).toBeNull();
    });

    it('edited and the bill changed elsewhere: the edits stay; Save meets the 409 and offers to reload', async () => {
      setup();
      await loaded();
      fireEvent.changeText(screen.getByTestId('invoice-number'), 'MINE');
      const theirs = kostaInvoice({ version: 4, review: kostaDraft({ invoiceNumber: 'THEIRS', reviewedAt: '2026-10-03T05:00:00Z' }) });
      fetchInvoice.mockResolvedValue(theirs);
      await act(async () => { mockListeners.focus?.({ preventDefault: () => {}, data: { action: null } }); });
      await waitFor(() => expect(fetchInvoice).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('invoice-number').props.value).toBe('MINE');
      saveReview.mockRejectedValue(new ApiError({ code: 'INVOICE_CHANGED', message: 'Changed', status: 409 }));
      await makeReady();
      fireEvent.press(saveButton());
      expect(await screen.findByText('This bill changed on another device')).toBeTruthy();
      expect(sentBody().version).toBe(3);
    });
  });
});
