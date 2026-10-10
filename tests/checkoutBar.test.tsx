import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RequestDetailScreen from '@/app/restaurant/requests/[id]';
import { MandiToastProvider } from '@/components/common';
import { createOrderFromIntent, fetchIntent, previewOrder } from '@/services/intent';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '7' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/intent', () => ({
  fetchIntent: jest.fn(),
  previewOrder: jest.fn(),
  createOrderFromIntent: jest.fn(),
  cancelIntent: jest.fn(),
  cloneIntent: jest.fn(),
  removeIntentItem: jest.fn(),
  updateIntentItem: jest.fn(),
}));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
// The pickers have their own logic and tests; here they are two buttons that choose.
jest.mock('@/components/request/DeliveryModePicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    DeliveryModePicker: ({ onSelect }: { onSelect: (m: string, fee: string) => void }) => (
      <Pressable accessibilityLabel="pick pickup" onPress={() => onSelect('PICKUP', '0')}><Text>pick pickup</Text></Pressable>
    ),
  };
});
jest.mock('@/components/request/DeliverySlotPicker', () => ({ DeliverySlotPicker: () => null }));
jest.mock('@/components/request/PaymentMethodPicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    PaymentMethodPicker: ({ onSelect }: { onSelect: (m: string) => void }) => (
      <>
        {['PREPAID', 'WALLET', 'CREDIT'].map((m) => (
          <Pressable key={m} accessibilityLabel={`method ${m}`} onPress={() => onSelect(m)}><Text>{`method ${m}`}</Text></Pressable>
        ))}
      </>
    ),
  };
});

const request = {
  id: 7, reference: 'RQ-7', outletId: 9, outletName: 'Cafe One', outletLocality: 'Indiranagar', outletCity: 'Bengaluru',
  supplierStoreId: 4, storeName: 'Metro', supplierName: 'Metro', status: 'RESPONSES_RECEIVED', fulfilment: 'FULFILLED',
  withinOrderWindow: true, quantityEditable: false, editable: false, preferredDeliveryDate: null,
  sentAt: '2026-10-07T05:00:00Z', createdAt: '2026-10-07T05:00:00Z', orderCreationDeadline: null,
  items: [{
    id: 501, supplierSkuId: 77, sku: null, requestedQuantity: '3', offeredQuantity: '3', unit: 'KG',
    agreedLineTotal: '100.00',
  }],
  acceptance: {
    offeredValue: '1000.00', offeredGst: '50.00', offeredTotal: '1050.00', deliveryFee: '0', deliveryModes: 'PICKUP', notes: null,
  },
  agreedValue: null, agreedGst: null, agreedTotal: null,
};

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <RequestDetailScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const created = (over: object) => ({
  intentId: 7, supplierOrderId: 88, orderNumber: 'SO-88', totalAmount: '1181.40', paymentMethod: 'CREDIT',
  paymentStatus: 'PENDING', payment: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (fetchIntent as jest.Mock).mockResolvedValue(request);
  (previewOrder as jest.Mock).mockResolvedValue({ grandTotal: '1181.40', deliveryFee: '0', lines: [] });
  (createOrderFromIntent as jest.Mock).mockResolvedValue(created({}));
});

describe('the checkout bar', () => {
  it('bar shows PAY USING with the selected method', async () => {
    setup();
    await screen.findByText('Place order');
    expect(screen.getByText('PAY USING')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('method CREDIT'));
    expect(screen.getByText('Mandi credit')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('method WALLET'));
    expect(screen.getByText('Wallet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('method PREPAID'));
    expect(screen.getByText('Card / UPI')).toBeTruthy();
  });

  it('changing the method does not place the order', async () => {
    setup();
    await screen.findByText('Place order');
    fireEvent.press(screen.getByLabelText('pick pickup'));
    fireEvent.press(screen.getByLabelText('method CREDIT'));
    fireEvent.press(screen.getByLabelText('method WALLET'));
    await waitFor(() => expect(screen.getByText('Wallet')).toBeTruthy());
    expect(createOrderFromIntent).not.toHaveBeenCalled();

    // Not before the server's total for this choice has arrived: the button waits for it.
    await waitFor(() => expect(screen.getByLabelText('Place order').props.accessibilityState?.disabled).not.toBe(true));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(createOrderFromIntent).toHaveBeenCalledTimes(1));
    expect((createOrderFromIntent as jest.Mock).mock.calls[0][2].paymentMethod).toBe('WALLET');
  });

  it('amount equals the preview grand total', async () => {
    setup();
    // The server's figure, not the acceptance's 1050.00 and not a sum of the parts.
    await waitFor(() => expect(
      within(screen.getByLabelText('Place order')).queryByText('₹1,181.40'),
    ).toBeTruthy());
    const bar = within(screen.getByLabelText('Place order'));
    expect(bar.getByText('TOTAL')).toBeTruthy();
    expect(bar.queryByText('₹1,050.00')).toBeNull();
  });

  it('CREDIT success routes to tracking', async () => {
    setup();
    await screen.findByText('Place order');
    fireEvent.press(screen.getByLabelText('pick pickup'));
    fireEvent.press(screen.getByLabelText('method CREDIT'));
    // Not before the server's total for this choice has arrived: the button waits for it.
    await waitFor(() => expect(screen.getByLabelText('Place order').props.accessibilityState?.disabled).not.toBe(true));
    fireEvent.press(screen.getByLabelText('Place order'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/tracking/88'));
    expect(mockReplace).not.toHaveBeenCalledWith('/restaurant/orders/88');
  });

  it('a card order still goes to the pay screen', async () => {
    (createOrderFromIntent as jest.Mock).mockResolvedValue(created({
      paymentMethod: 'PREPAID', paymentStatus: 'PENDING', payment: { id: 1 },
    }));
    setup();
    await screen.findByText('Place order');
    fireEvent.press(screen.getByLabelText('pick pickup'));
    fireEvent.press(screen.getByLabelText('method PREPAID'));
    // Not before the server's total for this choice has arrived: the button waits for it.
    await waitFor(() => expect(screen.getByLabelText('Place order').props.accessibilityState?.disabled).not.toBe(true));
    fireEvent.press(screen.getByLabelText('Place order'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/pay/88'));
  });

  it('keeps the order button inert until a mode and a method are chosen', async () => {
    setup();
    await screen.findByText('Place order');
    fireEvent.press(screen.getByLabelText('Place order'));
    expect(createOrderFromIntent).not.toHaveBeenCalled();
  });
});
