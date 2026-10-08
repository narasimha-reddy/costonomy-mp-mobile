import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SupplierOrderScreen from '@/app/supplier/orders/[id]';
import { MandiToastProvider } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { fetchSupplierOrder } from '@/services/procurement';
import { markReady, recordDispatchWeights } from '@/services/supplier';
import {
  ORDER_CONFIRMED_UNWEIGHED, ORDER_PREPARING_WEIGHED_9_6, ORDER_READY_SETTLED_9_6, REFUSAL_RANGE,
} from './fixtures/catchWeightContract';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '501' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 12 }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/procurement', () => ({
  fetchSupplierOrder: jest.fn(),
  newIdempotencyKey: () => 'key-1',
}));
jest.mock('@/services/supplier', () => ({
  markPreparing: jest.fn(), markReady: jest.fn(), markOutForDelivery: jest.fn(), markDelivered: jest.fn(),
  supplierCancelOrder: jest.fn(), recordDispatchWeights: jest.fn(),
}));
jest.mock('@/services/delivery', () => ({
  fetchDelivery: jest.fn().mockResolvedValue(null), requestDelivery: jest.fn(),
  markDeliveryDispatched: jest.fn(), markDeliveryDelivered: jest.fn(),
}));
jest.mock('@/services/billing', () => ({
  fetchTaxInvoice: jest.fn(), fetchCreditNotes: jest.fn(), generateTaxInvoice: jest.fn(),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <SupplierOrderScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const showOrder = (raw: object) => (fetchSupplierOrder as jest.Mock).mockResolvedValue(raw);

beforeEach(() => jest.clearAllMocks());

describe('the supplier weigh sheet (API D-128)', () => {
  it('is offered while the order is confirmed, and starts with empty fields', async () => {
    showOrder(ORDER_CONFIRMED_UNWEIGHED);
    setup();

    fireEvent.press(await screen.findByText('Weigh items'));

    const input = await screen.findByLabelText('Scale weight for Chicken, in KG');
    expect(input.props.value).toBe('');
  });

  it('is not offered once the order is ready: the API refuses weighing from READY', async () => {
    showOrder(ORDER_READY_SETTLED_9_6);
    setup();

    await screen.findByText('Weighed less: the buyer pays ₹42.00 less');
    expect(screen.queryByText('Weigh items')).toBeNull();
    expect(screen.queryByText('Re-weigh')).toBeNull();
  });

  it('refuses an empty field in the sheet with the server\'s sentence, and sends nothing', async () => {
    showOrder(ORDER_CONFIRMED_UNWEIGHED);
    setup();
    fireEvent.press(await screen.findByText('Weigh items'));
    await screen.findByLabelText('Scale weight for Chicken, in KG');

    fireEvent.press(screen.getByText('Save weights'));

    expect(await screen.findByText('Enter the weight shown on the scale.')).toBeTruthy();
    expect(recordDispatchWeights).not.toHaveBeenCalled();
  });

  it('sends the typed reading in the API\'s body and shows the server\'s refusal inside the sheet', async () => {
    showOrder(ORDER_CONFIRMED_UNWEIGHED);
    (recordDispatchWeights as jest.Mock).mockRejectedValue(new ApiError({
      code: 'VALIDATION_ERROR', status: 400, message: REFUSAL_RANGE.error.message,
    }));
    setup();
    fireEvent.press(await screen.findByText('Weigh items'));
    fireEvent.changeText(await screen.findByLabelText('Scale weight for Chicken, in KG'), '12');

    fireEvent.press(screen.getByText('Save weights'));

    await waitFor(() => expect(recordDispatchWeights).toHaveBeenCalledWith(
      'token', 501, [{ supplierOrderItemId: 301, dispatchedWeight: '12' }]));
    expect(await screen.findByText(REFUSAL_RANGE.error.message)).toBeTruthy();
  });

  it('shows the reading beside what is billed once weighed', async () => {
    showOrder(ORDER_PREPARING_WEIGHED_9_6);
    setup();

    expect(await screen.findByText('Scale 9.6 KG · billed 9.6 KG')).toBeTruthy();
  });
});

describe('marking ready', () => {
  it('is disabled with the server\'s sentence while a catch-weight line is unweighed', async () => {
    showOrder({ ...ORDER_CONFIRMED_UNWEIGHED, status: 'PREPARING' });
    setup();

    expect(await screen.findByText('Weigh every catch-weight line before marking the order ready.')).toBeTruthy();
    fireEvent.press(screen.getByText('Ready to collect'));
    await act(async () => {});
    expect(markReady).not.toHaveBeenCalled();
  });

  it('works once every line is weighed', async () => {
    showOrder(ORDER_PREPARING_WEIGHED_9_6);
    (markReady as jest.Mock).mockResolvedValue(ORDER_READY_SETTLED_9_6);
    setup();

    fireEvent.press(await screen.findByText('Ready to collect'));

    await waitFor(() => expect(markReady).toHaveBeenCalled());
    expect(screen.queryByText('Weigh every catch-weight line before marking the order ready.')).toBeNull();
  });
});
