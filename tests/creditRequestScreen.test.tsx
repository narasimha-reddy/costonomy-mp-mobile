import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditRequestScreen from '@/app/restaurant/credit/request';
import { ApiError } from '@/lib/api/errors';
import { requestErrorMessage, supplierCreditState } from '@/lib/credit/request';
import { fetchCreditSummary, requestCredit } from '@/services/credit';
import { fetchStorefrontHeader, searchSuppliers } from '@/services/catalog';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Ionicons: ({ name, color }: { name: string; color?: string }) => <Text testID={`glyph-${name}`} style={{ color }}>{`icon:${name}`}</Text>,
    MaterialCommunityIcons: ({ name, color }: { name: string; color?: string }) => <Text testID={`glyph-${name}`} style={{ color }}>{`mci:${name}`}</Text>,
  };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/restaurant/credit/request',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { name: 'Main' } }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchCreditSummary: jest.fn(),
  requestCredit: jest.fn(),
}));
jest.mock('@/services/catalog', () => ({ searchSuppliers: jest.fn(), fetchStorefrontHeader: jest.fn() }));

const summaryFn = fetchCreditSummary as jest.Mock;
const request = requestCredit as jest.Mock;
const search = searchSuppliers as jest.Mock;
const header = fetchStorefrontHeader as jest.Mock;

const supplier = (id: number, name: string) => ({
  supplierStoreId: id, supplierName: name, storeName: `${name} Store`, city: null, distanceKm: null,
  serviceable: true, productCount: 1, matchingProductCount: 0, averageRating: null, ratingCount: 0,
  openNow: true, opensAt: null,
});
const ag = (o: Record<string, unknown>) => ({
  id: 1, supplierStoreId: 10, status: 'ACTIVE', due: '0', overdue: '0', suspensionReason: null, ...o,
});
const AGREEMENTS = [
  ag({ id: 11, supplierStoreId: 11, status: 'ACTIVE' }),
  ag({ id: 12, supplierStoreId: 12, status: 'REQUESTED' }),
  ag({ id: 13, supplierStoreId: 13, status: 'APPROVED' }),
  ag({ id: 14, supplierStoreId: 14, status: 'SUSPENDED', suspensionReason: 'Pay your invoice' }),
  ag({ id: 15, supplierStoreId: 15, status: 'REJECTED' }),
];
const RESULTS = [
  supplier(11, 'Active Co'), supplier(12, 'Waiting Co'), supplier(13, 'Approved Co'),
  supplier(14, 'Paused Co'), supplier(15, 'Declined Co'), supplier(16, 'Brand New'),
];

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const clients: QueryClient[] = [];
let client: QueryClient;
let invalidate: jest.SpyInstance;

function renderScreen() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  clients.push(client);
  invalidate = jest.spyOn(client, 'invalidateQueries');
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <CreditRequestScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline = false;
  mockParams = {};
  summaryFn.mockResolvedValue({ outletId: 7, agreements: AGREEMENTS });
  search.mockResolvedValue({ suppliers: RESULTS, beyondRadius: 0 });
  header.mockResolvedValue({ storeName: 'Preset Store', supplierName: 'Preset Traders' });
  request.mockReset();
});
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

async function searchFor(term = 'co') {
  fireEvent.changeText(screen.getByPlaceholderText('Supplier name'), term);
  await screen.findByTestId('supplier-row-16');
}
async function fillAndPick(storeId = 16) {
  await searchFor();
  fireEvent.press(screen.getByTestId(`supplier-row-${storeId}`));
  fireEvent.changeText(screen.getByTestId('limit-field'), '20000');
}
const has = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const sendBtn = () => screen.getByTestId('send-request');
const errors = (status: number, code: string, message = 'server said so') =>
  new ApiError({ code, message, status });

describe('Request credit: supplier search states', () => {
  it('asks for two letters first and does not search under two', async () => {
    renderScreen();
    expect(screen.getByText('Type at least two letters.')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Supplier name'), 'a');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
    expect(search).not.toHaveBeenCalled();
  });

  it('shows each supplier its credit state; only free ones can be selected', async () => {
    renderScreen();
    await searchFor();
    await waitFor(() => expect(screen.getByText('You already have credit here')).toBeTruthy());
    expect(screen.getByText('Request waiting for supplier')).toBeTruthy();
    expect(screen.getByText('Terms ready: review and accept')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText('Pay your invoice')).toBeTruthy();
    for (const id of [11, 12, 14]) {
      expect(screen.getByTestId(`supplier-row-${id}`).props.accessibilityState.disabled).toBe(true);
    }
    for (const id of [13, 15, 16]) {
      expect(screen.getByTestId(`supplier-row-${id}`).props.accessibilityState.disabled).toBe(false);
    }
  });

  it('an ACTIVE supplier cannot be selected, and has an Open link', async () => {
    renderScreen();
    await searchFor();
    await waitFor(() => expect(screen.getByTestId('supplier-open-11')).toBeTruthy());
    fireEvent.press(screen.getByTestId('supplier-row-11'));
    fireEvent.changeText(screen.getByTestId('limit-field'), '5000');
    expect(sendBtn().props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByTestId('request-summary')).toBeNull();
    fireEvent.press(screen.getByTestId('supplier-open-11'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/credit/11');
  });

  it('a waiting or paused supplier cannot be selected either', async () => {
    renderScreen();
    await searchFor();
    await waitFor(() => expect(screen.getByText('Paused')).toBeTruthy());
    fireEvent.press(screen.getByTestId('supplier-row-12'));
    fireEvent.press(screen.getByTestId('supplier-row-14'));
    fireEvent.changeText(screen.getByTestId('limit-field'), '5000');
    expect(sendBtn().props.accessibilityState?.disabled).toBe(true);
  });

  it('an APPROVED supplier opens its credit page to accept the terms', async () => {
    renderScreen();
    await searchFor();
    await waitFor(() => expect(screen.getByText('Terms ready: review and accept')).toBeTruthy());
    fireEvent.press(screen.getByTestId('supplier-row-13'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/credit/13');
  });

  it('a declined or unknown supplier is selectable', async () => {
    renderScreen();
    await fillAndPick(15);
    expect(sendBtn().props.accessibilityState?.disabled).toBeFalsy();
  });

  it('a closed line that still owes money is not selectable; one that owes nothing is', () => {
    expect(supplierCreditState(ag({ status: 'CLOSED', due: '100' }) as never).block).not.toBeNull();
    expect(supplierCreditState(ag({ status: 'EXPIRED', overdue: '5' }) as never).block).not.toBeNull();
    expect(supplierCreditState(ag({ status: 'CLOSED' }) as never).block).toBeNull();
    expect(supplierCreditState(undefined).block).toBeNull();
  });

  it('a supplier arriving preselected with live credit is blocked and says so', async () => {
    mockParams = { storeId: '11' };
    renderScreen();
    expect(await screen.findByTestId('chosen-blocked')).toHaveTextContent('You already have credit here');
    fireEvent.changeText(screen.getByTestId('limit-field'), '5000');
    expect(sendBtn().props.accessibilityState?.disabled).toBe(true);
  });
});

describe('Request credit: form', () => {
  it('uses plain-English labels', () => {
    renderScreen();
    expect(screen.getByText('Supplier')).toBeTruthy();
    expect(screen.getByLabelText('Credit limit you need (₹)')).toBeTruthy();
    expect(screen.getByText('Days to pay')).toBeTruthy();
    expect(screen.getByLabelText('What will you buy? (optional)')).toBeTruthy();
    for (const d of [7, 15, 30, 45]) expect(screen.getByLabelText(`${d} days`)).toBeTruthy();
  });

  it('shows the summary line before sending, following the days chip', async () => {
    renderScreen();
    await fillAndPick();
    expect(screen.getByTestId('request-summary'))
      .toHaveTextContent('You are asking Brand New for ₹20,000 credit, to pay within 30 days.');
    fireEvent.press(screen.getByTestId('days-45'));
    expect(screen.getByTestId('request-summary')).toHaveTextContent(has('to pay within 45 days.'));
  });

  it('accepts whole rupees and 2 decimals; rejects under ₹1 and 3 decimals', async () => {
    renderScreen();
    await searchFor();
    fireEvent.press(screen.getByTestId('supplier-row-16'));
    fireEvent.changeText(screen.getByTestId('limit-field'), '0.5');
    expect(screen.getByText('Enter at least ₹1.')).toBeTruthy();
    expect(sendBtn().props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('limit-field'), '12.345');
    expect(screen.getByText('Use a number with at most 2 decimal places.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('limit-field'), '12.34');
    expect(sendBtn().props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.changeText(screen.getByTestId('limit-field'), '1');
    expect(sendBtn().props.accessibilityState?.disabled).toBeFalsy();
  });

  it('sends the typed values as two-decimal money', async () => {
    request.mockResolvedValue({});
    renderScreen();
    await fillAndPick();
    fireEvent.changeText(screen.getByTestId('purpose-field'), ' Vegetables ');
    fireEvent.press(screen.getByTestId('days-15'));
    fireEvent.press(sendBtn());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('tok', {
      supplierStoreId: 16, outletId: 7, requestedLimit: '20000.00', requestedDays: 15, purpose: 'Vegetables',
    });
  });

  it('puts the form in a scroll view that keeps taps, inside a keyboard-avoiding wrapper', () => {
    const { UNSAFE_getByType } = renderScreen();
    const scroll = UNSAFE_getByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    const avoid = UNSAFE_getByType(KeyboardAvoidingView);
    expect(avoid.props.testID).toBe('request-keyboard-avoiding');
    expect(avoid.props.behavior).toBe('padding');
    expect(StyleSheet.flatten(avoid.props.style).flex).toBe(1);
    // The scroll area and the submit button are both inside it.
    expect(avoid.findByProps({ testID: 'send-request' })).toBeTruthy();
    expect(avoid.findByType(ScrollView)).toBeTruthy();
  });

  it('disables Send while offline', async () => {
    mockOffline = true;
    renderScreen();
    await fillAndPick();
    expect(sendBtn().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    fireEvent.press(sendBtn());
    expect(request).not.toHaveBeenCalled();
  });

  it('Send is the orange primary, not purple', async () => {
    renderScreen();
    await fillAndPick();
    expect(StyleSheet.flatten(sendBtn().props.style).backgroundColor).toBe(Colors.primary);
  });
});

describe('Request credit: sending', () => {
  it('shows a confirmation, refreshes the credit overview, and goes back to Credit', async () => {
    request.mockResolvedValue({});
    renderScreen();
    await fillAndPick();
    fireEvent.press(sendBtn());
    expect(await screen.findByText('Request sent to Brand New')).toBeTruthy();
    expect(screen.getByText("They usually reply within a day. We'll notify you.")).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['outlet', 7, 'credit'] });
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('back-to-credit'));
    expect(mockReplace).toHaveBeenCalledWith('/restaurant/credit');
  });

  it('says nothing about success before the server answers, and a double tap sends once', async () => {
    const pending = deferred<unknown>();
    request.mockReturnValue(pending.promise);
    renderScreen();
    await fillAndPick();
    fireEvent.press(sendBtn());
    fireEvent.press(sendBtn());
    fireEvent.press(sendBtn());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Request sent/)).toBeNull();
    await act(async () => { pending.resolve({}); });
    expect(await screen.findByText('Request sent to Brand New')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });

  const CASES: [string, ApiError, string][] = [
    ['store does not offer credit', errors(422, 'CREDIT_AGREEMENT_NOT_ACTIVE', "This supplier doesn't offer credit terms."),
      "This supplier doesn't offer credit yet."],
    ['already active', errors(422, 'VALIDATION_ERROR', 'You already have credit with this supplier. Ask them to review the limit.'),
      'You already have credit with this supplier.'],
    ['already pending', errors(422, 'VALIDATION_ERROR', 'A request to this supplier is already waiting for a response.'),
      'A request to this supplier is already waiting for a response.'],
    ['no permission', errors(403, 'FORBIDDEN', 'Forbidden'),
      "You don't have permission to ask for credit. Ask the account owner to do it."],
    ['unknown supplier', errors(404, 'NOT_FOUND', 'SupplierStore 5 not found'),
      "We couldn't find that supplier. Search for it again."],
    ['owes money on a closed line', errors(422, 'VALIDATION_ERROR', 'You still have an outstanding balance.'),
      'You still owe this supplier. Pay what you owe first.'],
    ['suspended', errors(422, 'VALIDATION_ERROR', 'This line is suspended.'),
      'Your credit with this supplier is paused. Open it to see why.'],
    ['throttled', errors(429, 'RATE_LIMITED', 'slow'), 'Too many tries. Wait a moment, then try again.'],
    ['a bare code', errors(500, 'SOME_INTERNAL_CODE', 'SOME_INTERNAL_CODE'), "We couldn't send that request. Please try again."],
  ];

  it.each(CASES)('maps a refusal (%s) to a friendly message, never the code, and keeps the form filled', async (_n, error, expected) => {
    request.mockRejectedValue(error);
    renderScreen();
    await fillAndPick();
    fireEvent.changeText(screen.getByTestId('purpose-field'), 'Veg');
    fireEvent.press(sendBtn());
    const note = await screen.findByTestId('request-error');
    expect(note).toHaveTextContent(has(expected));
    expect(JSON.stringify(screen.toJSON())).not.toContain(error.code);
    expect(screen.getByTestId('limit-field').props.value).toBe('20000');
    expect(screen.getByTestId('purpose-field').props.value).toBe('Veg');
    expect(screen.getByTestId('request-summary')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    // After a refusal the form can be sent again.
    expect(sendBtn().props.accessibilityState?.disabled).toBeFalsy();
  });

  it('a network failure says so in words', async () => {
    request.mockRejectedValue(new Error('Network request failed'));
    renderScreen();
    await fillAndPick();
    fireEvent.press(sendBtn());
    expect(await screen.findByTestId('request-error'))
      .toHaveTextContent(has("We couldn't reach the server. Check your connection and try again."));
  });

  it('clears the message when something is edited', async () => {
    request.mockRejectedValue(errors(500, 'X', 'Something broke here.'));
    renderScreen();
    await fillAndPick();
    fireEvent.press(sendBtn());
    await screen.findByTestId('request-error');
    fireEvent.changeText(screen.getByTestId('limit-field'), '25000');
    expect(screen.queryByTestId('request-error')).toBeNull();
  });
});

describe('requestErrorMessage', () => {
  it('keeps a plain server sentence it does not know', () => {
    expect(requestErrorMessage(errors(422, 'VALIDATION_ERROR', 'Limit is too high for this store.')))
      .toBe('Limit is too high for this store.');
  });
});
