import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { fetchCreditNotes } from '@/services/billing';
import { fetchDisputes } from '@/services/trust';
import { Colors } from '@/theme';
import { MandiToastProvider } from '@/components/common';
import SupplierOrderScreen from '@/app/supplier/orders/[id]';
import { fetchDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { ApiError } from '@/lib/api/errors';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '5' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 3 }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/delivery', () => ({
  fetchDelivery: jest.fn(), reassignDelivery: jest.fn(), switchToOwnDelivery: jest.fn(), requestDelivery: jest.fn(),
  markDeliveryDispatched: jest.fn(), markDeliveryDelivered: jest.fn(),
}));
jest.mock('@/services/procurement', () => ({ fetchSupplierOrder: jest.fn(), newIdempotencyKey: () => 'key' }));
jest.mock('@/services/supplier', () => ({
  markPreparing: jest.fn(), markReady: jest.fn(), markOutForDelivery: jest.fn(), markDelivered: jest.fn(),
  supplierCancelOrder: jest.fn(), recordDispatchWeights: jest.fn(),
}));
jest.mock('@/services/trust', () => ({ fetchDisputes: jest.fn() }));
jest.mock('@/services/billing', () => ({
  fetchTaxInvoice: jest.fn(), fetchCreditNotes: jest.fn(), generateTaxInvoice: jest.fn(),
}));

const order = {
  id: 5, orderNumber: 'ORD-5', status: 'CONFIRMED', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Indiranagar', restaurantName: 'Spice Garden', outletLocality: 'Main Road',
  outletCity: 'Bengaluru', outletId: 1, supplierStoreId: 2, totalAmount: '173.24', subtotal: '123.24',
  gstAmount: '0.00', acceptedAmount: null, createdAt: '2026-01-01T10:00:00Z', paymentMethod: 'PREPAID',
  deliveryFee: null,
  items: [{
    id: 1, productName: 'Paneer', requestedQuantity: '10', acceptedQuantity: null, unit: 'KG', lineTotal: '1000.00',
    sku: null, unitPriceInclusiveGst: '118.00', gstRate: '18',
  }],
};
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><SupplierOrderScreen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const noDelivery = () => (fetchDelivery as jest.Mock).mockRejectedValue(
  new ApiError({ status: 404, code: 'NOT_FOUND', message: 'none' }),
);

beforeEach(() => {
  jest.clearAllMocks();
  (fetchSupplierOrder as jest.Mock).mockResolvedValue(order);
  noDelivery();
});
afterEach(() => { jest.useRealTimers(); });



const delivered = {
  ...order, status: 'DELIVERED', scheduledDeliveryDate: '2026-10-08', deliverySlotName: 'Morning',
};
const colourOf = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style as never) as { color?: string }).color;

beforeEach(() => (fetchDisputes as jest.Mock).mockResolvedValue([]));

describe('slot colour', () => {
  it('is neutral once the order is delivered', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue(delivered);
    setup();
    const slot = await screen.findByText(/Slot: 8th Oct 2026/);
    expect(colourOf(slot)).toBe(Colors.textSecondary);
  });
  it('keeps the accent while the delivery is still to come', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...delivered, status: 'CONFIRMED' });
    setup();
    const slot = await screen.findByText(/Slot: 8th Oct 2026/);
    expect(colourOf(slot)).toBe(Colors.primary);
  });
});

describe('Credit notes button gives an answer', () => {
  beforeEach(() => (fetchSupplierOrder as jest.Mock).mockResolvedValue(delivered));
  it('says no credit notes yet when the endpoint answers 404 (tax invoices off)', async () => {
    (fetchCreditNotes as jest.Mock).mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'nf' }));
    setup();
    fireEvent.press(await screen.findByText('Credit notes'));
    expect(await screen.findByText('No credit notes yet.')).toBeTruthy();
    expect(fetchCreditNotes).toHaveBeenCalledWith('token', 5);
  });
  it('says the same for an empty list', async () => {
    (fetchCreditNotes as jest.Mock).mockResolvedValue([]);
    setup();
    fireEvent.press(await screen.findByText('Credit notes'));
    expect(await screen.findByText('No credit notes yet.')).toBeTruthy();
  });
});

describe('dispute refund on the supplier order', () => {
  it('shows the approved refund the server sends, beside the final payable', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...delivered, finalPayableAmount: '861.00' });
    (fetchDisputes as jest.Mock).mockResolvedValue([
      { id: 1, disputeNumber: 'DSP-1', refundRequest: { id: 1, status: 'APPROVED', amount: '25.00' } },
    ]);
    setup();
    expect(await screen.findByLabelText('Dispute refund DSP-1, -₹25.00')).toBeTruthy();
    expect(screen.getByText('Final payable')).toBeTruthy();
  });
});
