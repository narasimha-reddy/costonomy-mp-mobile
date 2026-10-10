import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RequestDetailScreen from '@/app/restaurant/requests/[id]';
import { MandiToastProvider } from '@/components/common';
import { istDay } from '@/lib/delivery/deliveryDay';
import { createOrderFromIntent, fetchIntent, previewOrder, quoteDelivery } from '@/services/intent';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '7' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/intent', () => ({
  fetchIntent: jest.fn(), previewOrder: jest.fn(), createOrderFromIntent: jest.fn(), cancelIntent: jest.fn(),
  cloneIntent: jest.fn(), removeIntentItem: jest.fn(), updateIntentItem: jest.fn(), quoteDelivery: jest.fn(),
}));
jest.mock('@/services/delivery', () => ({ fetchAvailableSlots: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
// A phone's storage, in memory. The real helper swallows failures and so would hide a missing save.
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
jest.mock('@/components/request/DeliverySlotPicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  const { istDay: day } = jest.requireActual('@/lib/delivery/deliveryDay');
  return {
    DeliverySlotPicker: ({ onSelect, selectedDate, selectedSlotId }: {
      onSelect: (s: number, d: string) => void; selectedDate: string | null; selectedSlotId: number | null;
    }) => {
      // Like the real picker: a chosen day with no slot starts on the first free one (slot 3).
      jest.requireActual('react').useEffect(() => {
        if (selectedDate != null && selectedSlotId == null) onSelect(3, selectedDate);
      }, [selectedDate, selectedSlotId]);
      return <Pressable accessibilityLabel="pick slot" onPress={() => onSelect(3, day(1))}><Text>pick slot</Text></Pressable>;
    },
  };
});
// A stand-in that ignores balances and totals (it offers all three methods always); the money rules of the real
// picker are tested in checkoutFollowUp, which renders the real one.
jest.mock('@/components/request/PaymentMethodPicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    PaymentMethodPicker: ({ onSelect, selected, initialMethod }: {
      onSelect: (m: string) => void; selected: string | null; initialMethod?: string | null;
    }) => {
      // Like the real picker: a method chosen earlier is taken up once the picker is ready to offer it.
      jest.requireActual('react').useEffect(() => { if (selected == null && initialMethod != null) onSelect(initialMethod); }, [selected, initialMethod]);
      return (
      <>
        {['PREPAID', 'WALLET', 'CREDIT'].map((m) => (
          <Pressable key={m} accessibilityLabel={`method ${m}`} onPress={() => onSelect(m)}><Text>{`method ${m}`}</Text></Pressable>
        ))}
      </>
      );
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
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
function setup() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client()}>
        <MandiToastProvider><RequestDetailScreen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const radio = (name: RegExp) => screen.getByRole('radio', { name });

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  (fetchIntent as jest.Mock).mockResolvedValue(request);
  (quoteDelivery as jest.Mock).mockResolvedValue({ fee: '55.00', quoteReference: 'q1', etaMinutes: 40 });
  (previewOrder as jest.Mock).mockResolvedValue({ grandTotal: '1105.00', deliveryFee: '55.00', lines: [] });
  (createOrderFromIntent as jest.Mock).mockResolvedValue({
    intentId: 7, supplierOrderId: 88, orderNumber: 'SO-88', totalAmount: '1105.00', paymentMethod: 'CREDIT',
    paymentStatus: 'PENDING', payment: null,
  });
});

describe('checkout choices', () => {
  it('opens on delivery when the restaurant asked for delivery, and the header says so', async () => {
    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.checked).toBe(true));
    expect(radio(/I will collect/).props.accessibilityState.checked).toBe(false);
    expect(screen.queryByText(/Pickup at/)).toBeNull();
    expect(screen.getByText('to Cafe One · Indiranagar')).toBeTruthy();
  });

  it('header names the supplier, not the outlet, when pickup is chosen', async () => {
    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.checked).toBe(true));
    fireEvent.press(radio(/I will collect/));
    expect(await screen.findByText('Pickup at Metro')).toBeTruthy();
    expect(screen.queryByText('to Cafe One · Indiranagar')).toBeNull();
  });

  it('choices survive a remount', async () => {
    const first = setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.checked).toBe(true));
    fireEvent.press(radio(/I will collect/));
    fireEvent.press(screen.getByLabelText('method CREDIT'));
    await waitFor(() => expect(screen.getByText('Mandi credit')).toBeTruthy());
    await waitFor(() => expect(mockStore.size).toBe(1));
    first.unmount();

    setup();
    // The preference alone would put delivery back; the saved choice is pickup.
    await waitFor(() => expect(radio(/I will collect/).props.accessibilityState.checked).toBe(true));
    expect(radio(/Deliver it for me/).props.accessibilityState.checked).toBe(false);
    expect(await screen.findByText('Mandi credit')).toBeTruthy();
  });

  it('a saved day and slot come back and are what is ordered', async () => {
    const first = setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.checked).toBe(true));
    fireEvent.press(screen.getByLabelText('pick slot'));
    first.unmount();

    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.checked).toBe(true));
    fireEvent.press(screen.getByLabelText('method WALLET'));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalled());
    expect((createOrderFromIntent as jest.Mock).mock.calls[0][2]).toMatchObject({
      deliveryMode: 'COSTONOMY_DELIVERY', deliverySlotId: 3, scheduledDeliveryDate: istDay(1),
    });
  });

  it('choices cleared after placing', async () => {
    setup();
    await waitFor(() => expect(radio(/Deliver it for me/).props.accessibilityState.checked).toBe(true));
    fireEvent.press(screen.getByLabelText('method CREDIT'));
    await waitFor(() => expect(mockStore.size).toBe(1));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/tracking/88'));
    await waitFor(() => expect(mockStore.size).toBe(0));
  });
});
