import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RequestDetailScreen from '@/app/restaurant/requests/[id]';
import { MandiToastProvider } from '@/components/common';
import { createOrderFromIntent, fetchIntent, previewOrder, quoteDelivery } from '@/services/intent';
import { fetchWallet } from '@/services/wallet';
import { fetchOutletAgreements } from '@/services/credit';
import { getJsonPreference } from '@/lib/preferences';
import { ApiError } from '@/lib/api/errors';
import { istDay } from '@/lib/delivery/deliveryDay';

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
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/intent', () => ({
  fetchIntent: jest.fn(), previewOrder: jest.fn(), createOrderFromIntent: jest.fn(), cancelIntent: jest.fn(),
  cloneIntent: jest.fn(), removeIntentItem: jest.fn(), updateIntentItem: jest.fn(), quoteDelivery: jest.fn(),
}));
jest.mock('@/services/delivery', () => ({ fetchAvailableSlots: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn() }));
jest.mock('@/services/credit', () => ({ fetchOutletAgreements: jest.fn() }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
const mockStore = new Map<string, string>();
jest.mock('@/lib/preferences', () => ({
  getPreference: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setPreference: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removePreference: jest.fn(async (key: string) => { mockStore.delete(key); }),
  getJsonPreference: jest.fn(async (key: string, fallback: unknown) => {
    const raw = mockStore.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  }),
  setJsonPreference: jest.fn(async (key: string, value: unknown) => { mockStore.set(key, JSON.stringify(value)); }),
}));
// Behaves like the real picker where it matters here: it starts a chosen day on a slot of its own choosing (id 5).
jest.mock('@/components/request/DeliverySlotPicker', () => {
  const { Text } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return {
    DeliverySlotPicker: ({ selectedSlotId, selectedDate, onSelect }: {
      selectedSlotId: number | null; selectedDate: string | null; onSelect: (s: number | null, d: string | null) => void;
    }) => {
      R.useEffect(() => {
        if (selectedDate != null && selectedSlotId == null) onSelect(5, selectedDate);
      }, [selectedDate, selectedSlotId]);
      return <Text>{`slot picker ${selectedDate ?? 'asap'} ${selectedSlotId ?? 'none'}`}</Text>;
    },
  };
});

const request = {
  id: 7, reference: 'RQ-7', outletId: 9, outletName: 'Cafe One', outletLocality: 'Indiranagar', outletCity: 'Bengaluru',
  supplierStoreId: 4, storeName: 'Metro', supplierName: 'Metro', status: 'RESPONSES_RECEIVED', fulfilment: 'FULFILLED',
  deliveryPreference: 'DELIVERY', withinOrderWindow: true, quantityEditable: false, editable: false,
  preferredDeliveryDate: null, sentAt: '2026-10-07T05:00:00Z', createdAt: '2026-10-07T05:00:00Z', orderCreationDeadline: null,
  items: [{ id: 501, supplierSkuId: 77, sku: null, requestedQuantity: '3', offeredQuantity: '3', unit: 'KG', agreedLineTotal: '100.00' }],
  acceptance: {
    offeredValue: '1000.00', offeredGst: '50.00', offeredTotal: '1050.00', deliveryFee: '0',
    deliveryModes: 'PICKUP,COSTONOMY_DELIVERY', deliveryOffer: 'COSTONOMY', notes: null,
  },
  agreedValue: null, agreedGst: null, agreedTotal: null,
};

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><RequestDetailScreen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const radio = (name: RegExp) => screen.getByRole('radio', { name });
const save = (choices: object) => mockStore.set('checkout:request:7', JSON.stringify(choices));
const placeDisabled = () => screen.getByLabelText('Place order').props.accessibilityState?.disabled === true;
const sent = (n = 0) => (createOrderFromIntent as jest.Mock).mock.calls[n][2];

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  (fetchIntent as jest.Mock).mockResolvedValue(request);
  (quoteDelivery as jest.Mock).mockResolvedValue({ fee: '55.00', quoteReference: 'q1', etaMinutes: 40 });
  (previewOrder as jest.Mock).mockResolvedValue({ grandTotal: '1105.00', deliveryFee: '55.00', lines: [] });
  (fetchWallet as jest.Mock).mockResolvedValue({ balance: '5000.00' });
  (fetchOutletAgreements as jest.Mock).mockResolvedValue([{ supplierStoreId: 4, status: 'ACTIVE', available: '5000.00' }]);
  (createOrderFromIntent as jest.Mock).mockResolvedValue({
    intentId: 7, supplierOrderId: 88, orderNumber: 'SO-88', totalAmount: '1105.00', paymentMethod: 'PREPAID',
    paymentStatus: 'PENDING', payment: null,
  });
});

describe('a refused quote is replaced, not reused (blocker 1)', () => {
  it('after a price change the next order carries the new quote and the fee shown is the fee sent', async () => {
    let release: (q: object) => void = () => undefined;
    const slow = new Promise<object>((resolve) => { release = resolve; });
    (quoteDelivery as jest.Mock)
      .mockResolvedValueOnce({ fee: '55.00', quoteReference: 'q1', etaMinutes: 40 })
      .mockReturnValueOnce(slow);
    (createOrderFromIntent as jest.Mock).mockRejectedValueOnce(
      new ApiError({ code: 'PRICE_CHANGED', message: 'The delivery fee changed.', status: 409 }));
    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.selected).toBe(true));
    await waitFor(() => expect(placeDisabled()).toBe(false));

    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalledTimes(1));
    expect(sent(0).deliveryQuoteReference).toBe('q1');
    // The re-quote is still in flight: nothing may be chosen from the old figure.
    await waitFor(() => expect(quoteDelivery).toHaveBeenCalledTimes(2));
    expect(radio(/Deliver it for me/).props.accessibilityState.selected).toBe(false);
    expect(placeDisabled()).toBe(true);

    await act(async () => { release({ fee: '66.00', quoteReference: 'q2', etaMinutes: 40 }); });
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.selected).toBe(true));
    expect(screen.getByText('₹66.00')).toBeTruthy();
    await waitFor(() => expect(placeDisabled()).toBe(false));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalledTimes(2));
    expect(sent(1).deliveryQuoteReference).toBe('q2');
    await waitFor(() => expect(previewOrder).toHaveBeenLastCalledWith('token', 7,
      expect.objectContaining({ deliveryQuoteReference: 'q2' })));
  });

  it('a restored Costonomy choice is sent with a fresh quote, not a cached one', async () => {
    save({ mode: 'COSTONOMY_DELIVERY', slotId: null, scheduledDate: null, method: 'PREPAID' });
    (quoteDelivery as jest.Mock).mockResolvedValue({ fee: '70.00', quoteReference: 'fresh', etaMinutes: 40 });
    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.selected).toBe(true));
    await waitFor(() => expect(placeDisabled()).toBe(false));
    expect(quoteDelivery).toHaveBeenCalledWith('token', 7);
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalled());
    expect(sent().deliveryQuoteReference).toBe('fresh');
  });
});

describe('a saved payment method that cannot be used (blocker 2)', () => {
  it('saved credit that no longer covers the order is not sent', async () => {
    save({ mode: 'COSTONOMY_DELIVERY', slotId: null, scheduledDate: null, method: 'CREDIT' });
    (fetchOutletAgreements as jest.Mock).mockResolvedValue([{ supplierStoreId: 4, status: 'ACTIVE', available: '10.00' }]);
    setup();
    await waitFor(() => expect(radio(/Card \/ UPI/).props.accessibilityState.selected).toBe(true));
    expect(radio(/Mandi Credit/).props.accessibilityState.selected).toBe(false);
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalled());
    expect(sent().paymentMethod).toBe('PREPAID');
  });

  it('saved wallet with too little balance is not sent', async () => {
    save({ mode: 'COSTONOMY_DELIVERY', slotId: null, scheduledDate: null, method: 'WALLET' });
    (fetchWallet as jest.Mock).mockResolvedValue({ balance: '1.00' });
    setup();
    await waitFor(() => expect(radio(/Card \/ UPI/).props.accessibilityState.selected).toBe(true));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalled());
    expect(sent().paymentMethod).toBe('PREPAID');
  });

  it('Place order waits for the balances before a saved wallet is trusted', async () => {
    save({ mode: 'COSTONOMY_DELIVERY', slotId: null, scheduledDate: null, method: 'WALLET' });
    let release: (w: object) => void = () => undefined;
    (fetchWallet as jest.Mock).mockReturnValue(new Promise((resolve) => { release = resolve; }));
    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.selected).toBe(true));
    expect(placeDisabled()).toBe(true);
    await act(async () => { release({ balance: '5000.00' }); });
    await waitFor(() => expect(radio(/Wallet/).props.accessibilityState.selected).toBe(true));
    expect(placeDisabled()).toBe(false);
  });
});

describe('a saved day and slot (blocker 3)', () => {
  it('restores the day, lets the picker choose the slot, and sends both', async () => {
    save({ mode: 'COSTONOMY_DELIVERY', slotId: 999, scheduledDate: istDay(1), method: 'PREPAID' });
    setup();
    await waitFor(() => expect(screen.getByText(`slot picker ${istDay(1)} 5`)).toBeTruthy());
    await waitFor(() => expect(placeDisabled()).toBe(false));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalled());
    expect(sent()).toMatchObject({ deliverySlotId: 5, scheduledDeliveryDate: istDay(1) });
  });

  it('sends no slot and no day when the order is pickup', async () => {
    save({ mode: 'PICKUP', slotId: 999, scheduledDate: istDay(1), method: 'PREPAID' });
    setup();
    await waitFor(() => expect(radio(/I will collect/).props.accessibilityState.selected).toBe(true));
    await waitFor(() => expect(placeDisabled()).toBe(false));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalled());
    expect(sent().deliverySlotId).toBeUndefined();
    expect(sent().scheduledDeliveryDate).toBeUndefined();
  });
});

describe('saving choices (item 6)', () => {
  it('keeps nothing for a request that cannot be ordered, and removes an old key', async () => {
    save({ mode: 'PICKUP', slotId: null, scheduledDate: null, method: 'PREPAID' });
    (fetchIntent as jest.Mock).mockResolvedValue({ ...request, withinOrderWindow: false });
    setup();
    await waitFor(() => expect(mockStore.size).toBe(0));
  });

  it('keeps nothing for a request that was only opened and is not yet answered', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue({ ...request, status: 'OPEN', acceptance: null });
    setup();
    await screen.findByText('Request');
    await act(async () => { await Promise.resolve(); });
    expect(mockStore.size).toBe(0);
  });
});

describe('storage that fails', () => {
  it('still shows the pickers when reading the saved choices throws', async () => {
    (getJsonPreference as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    setup();
    expect(await screen.findByText('How should this reach you?')).toBeTruthy();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.selected).toBe(true));
  });

  it('still shows the pickers when the saved choices are garbage', async () => {
    (getJsonPreference as jest.Mock).mockResolvedValueOnce('not an object');
    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.selected).toBe(true));
    (getJsonPreference as jest.Mock).mockResolvedValueOnce({ mode: 'HOVERCRAFT', method: 'BARTER', scheduledDate: 42 });
    setup();
    expect((await screen.findAllByText('How should this reach you?')).length).toBeGreaterThan(0);
  });
});
