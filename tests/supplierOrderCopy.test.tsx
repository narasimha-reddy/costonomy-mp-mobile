import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { MandiToastProvider } from '@/components/common';
import SupplierOrderScreen from '@/app/supplier/orders/[id]';
import { fetchDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { markPreparing, markReady } from '@/services/supplier';
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
const delivery = {
  id: 9, status: 'DRIVER_ASSIGNED', mode: 'COSTONOMY', driverName: 'Ravi Kumar', driverPhone: '999',
  driverVehicle: 'Bike', trackable: true, trackingUrl: null, location: null, etaMinutes: 12,
  estimatedArrivalAt: null, failureReason: null, canSwitchToOwn: false, timeline: [],
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


const refunded = {
  ...order, status: 'DELIVERED', scheduledDeliveryDate: '2026-10-08', deliverySlotName: 'Morning',
  doorstepRefundAmount: '26.00',
  items: [{ ...order.items[0], doorstepRejectedQty: '1', doorstepRejectionReason: 'SHORT_DELIVERY', doorstepRefundAmount: '26.00' }],
};

describe('supplier order screen shows people words, not raw values', () => {
  beforeEach(() => (fetchSupplierOrder as jest.Mock).mockResolvedValue(refunded));

  it('formats the slot date like the rest of the app', async () => {
    setup();
    expect(await screen.findByText(/Slot: 8th Oct 2026/)).toBeTruthy();
    expect(screen.queryByText(/2026-10-08/)).toBeNull();
  });

  it('names the doorstep rejection reason instead of the enum', async () => {
    setup();
    expect(await screen.findByText(/Doorstep rejected: 1 KG \(Short delivery\)/)).toBeTruthy();
    expect(screen.queryByText(/SHORT_DELIVERY/)).toBeNull();
  });

  it('keeps the refund label and its amount in one text', async () => {
    setup();
    expect(await screen.findByText('Doorstep rejection refund: -₹26.00')).toBeTruthy();
    expect(screen.getByText(/Refund: -₹26\.00/)).toBeTruthy();
  });

  it('uses sentence case for Cannot fulfil and an icon, not an emoji, for GST documents', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...refunded, status: 'CONFIRMED' });
    setup();
    expect(await screen.findByText('Cannot fulfil')).toBeTruthy();
    expect(screen.queryByText('Cannot Fulfil')).toBeNull();
    expect(screen.queryByText(/Doorstep Rejection Refund/)).toBeNull();
  });
});

describe('the GST documents card', () => {
  it('has a document icon and no emoji', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...refunded, status: 'DELIVERED' });
    setup();
    expect(await screen.findByText('GST documents')).toBeTruthy();
    expect(screen.queryByText(/📄/)).toBeNull();
    expect(screen.getByText('icon:document-text-outline')).toBeTruthy();
  });
});

describe('sentence case and the refund row (flow review 4)', () => {
  beforeEach(() => (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...refunded, finalPayableAmount: '974.00' }));

  it('labels the final amount and the GST buttons in sentence case', async () => {
    setup();
    expect(await screen.findByText('Final payable')).toBeTruthy();
    expect(screen.queryByText(/Final Payable/)).toBeNull();
    expect(screen.getByText('Generate invoice')).toBeTruthy();
    expect(screen.getByText('Credit notes')).toBeTruthy();
    expect(screen.queryByText('Generate Invoice')).toBeNull();
    expect(screen.queryByText('Credit Notes')).toBeNull();
  });

  it('keeps a line\'s refund value whole: "-" never wraps away from the amount', async () => {
    setup();
    expect(await screen.findByText('Doorstep rejected: 1 KG (Short delivery)')).toBeTruthy();
    const value = screen.getByText('Refund: -₹26.00');
    expect(value.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(value.props.style).flexShrink).toBe(0);
  });

  it('says Cancel order, not Cancel Order', async () => {
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...refunded, status: 'CONFIRMED' });
    setup();
    fireEvent.press(await screen.findByText('Cannot fulfil'));
    expect(await screen.findByText('Cancel order')).toBeTruthy();
    expect(screen.queryByText('Cancel Order')).toBeNull();
  });
});
