import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import RestaurantOrderScreen from '@/app/restaurant/orders/[id]';
import RatingScreen from '@/app/restaurant/rating/[orderId]';
import { fetchDelivery } from '@/services/delivery';
import { fetchSupplierOrder } from '@/services/procurement';
import { createRating, fetchRating } from '@/services/trust';
import { ApiError } from '@/lib/api/errors';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '5', orderId: '5' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/delivery', () => ({ fetchDelivery: jest.fn() }));
jest.mock('@/services/procurement', () => ({ fetchSupplierOrder: jest.fn(), newIdempotencyKey: () => 'key' }));
jest.mock('@/services/billing', () => ({ fetchTaxInvoice: jest.fn(), fetchCreditNotes: jest.fn() }));
jest.mock('@/services/trust', () => ({ fetchRating: jest.fn(), createRating: jest.fn() }));

const completed = {
  id: 5, orderNumber: 'ORD-5', status: 'COMPLETED', deliveryMode: 'COSTONOMY_DELIVERY', supplierName: 'Fresh Farms',
  storeName: 'FF', outletName: 'Cafe', outletId: 1, supplierStoreId: 2, totalAmount: '1180.00', subtotal: '1000.00',
  gstAmount: '180.00', acceptedAmount: '1180.00', acceptedSubtotal: '1000.00', acceptedGst: '180.00',
  createdAt: '2026-01-01T10:00:00Z', paymentMethod: 'CREDIT', paymentStatus: 'ON_CREDIT', creditDueDate: '2026-11-07',
  items: [{
    id: 1, productName: 'Paneer', requestedQuantity: '10', acceptedQuantity: '10', unit: 'KG', lineTotal: '1000.00',
    sku: null, unitPriceInclusiveGst: '118.00', gstRate: '18',
  }],
};
const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
function setup(Screen: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider><Screen /></MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const notRated = () => (fetchRating as jest.Mock).mockRejectedValue(
  new ApiError({ status: 404, code: 'NOT_FOUND', message: 'No rating' }),
);

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  (fetchSupplierOrder as jest.Mock).mockReset().mockResolvedValue(completed);
  (fetchDelivery as jest.Mock).mockReset().mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'none' }));
  (fetchRating as jest.Mock).mockReset();
  (createRating as jest.Mock).mockReset().mockResolvedValue({ id: 1 });
});

describe('restaurant order details after the order', () => {
  it('shows Rate This Order while the order is unrated', async () => {
    notRated();
    setup(RestaurantOrderScreen);
    fireEvent.press(await screen.findByText('Rate This Order'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/rating/5');
  });

  it('hides Rate This Order once a rating exists', async () => {
    (fetchRating as jest.Mock).mockResolvedValue({ id: 1, overall: 4 });
    setup(RestaurantOrderScreen);
    await waitFor(() => expect(fetchRating).toHaveBeenCalled());
    await screen.findByText('Bill Summary');
    await waitFor(() => expect(screen.queryByText('Rate This Order')).toBeNull());
  });

  it('never creates a rating just by opening the order', async () => {
    notRated();
    setup(RestaurantOrderScreen);
    await screen.findByText('Rate This Order');
    expect(createRating).not.toHaveBeenCalled();
  });

  it('says On credit once on the sticky bar, not in the payment row, and has no emoji icons', async () => {
    notRated();
    setup(RestaurantOrderScreen);
    await screen.findByText('Bill Summary');
    expect(screen.getAllByText('On credit')).toHaveLength(1);
    expect(screen.getByText(/^Due 7th Nov 2026/)).toBeTruthy();
    expect(screen.queryByText(/📄/)).toBeNull();
  });

  it('a plain on-credit order has no Payment method row at all', async () => {
    notRated();
    setup(RestaurantOrderScreen);
    await screen.findByText('Bill Summary');
    expect(screen.queryByText('Payment method')).toBeNull();
  });

  it.each([
    ['FULLY_REFUNDED', 'Refunded'],
    ['CANCEL_PENDING', 'Cancelled · being settled'],
    ['RETURN_DELAYED', 'Refund delayed'],
  ])('a credit order that is %s keeps its Payment method row and the status label', async (paymentStatus, label) => {
    notRated();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...completed, status: 'CANCELLED', paymentStatus });
    setup(RestaurantOrderScreen);
    await screen.findByText('Bill Summary');
    expect(screen.getByText('Payment method')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
  });

  it('after a check-in refund, the bill and the bar show the server final payable and the refund as its own line', async () => {
    notRated();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({
      ...completed, paymentMethod: 'WALLET', paymentStatus: 'PAID', creditDueDate: null, totalAmount: '901.00',
      acceptedAmount: '901.00', doorstepRefundAmount: '430.50', finalPayableAmount: '470.50',
    });
    setup(RestaurantOrderScreen);
    await screen.findByText('Bill Summary');
    expect(screen.getByText('Refunded to wallet')).toBeTruthy();
    expect(screen.getAllByText('₹430.50')).toHaveLength(1);
    // "You paid" and the last bill line both say 470.50, never the 901.00 that was first debited.
    expect(screen.getAllByText('₹470.50')).toHaveLength(2);
    expect(screen.getByText('You paid')).toBeTruthy();
  });

  it('a wallet order says it was paid from the wallet once, not in the bill, a payment row and a pill', async () => {
    notRated();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...completed, paymentMethod: 'WALLET', paymentStatus: 'PAID' });
    setup(RestaurantOrderScreen);
    await screen.findByText('Bill Summary');
    expect(screen.getAllByText(/from wallet/i)).toHaveLength(1);
    expect(screen.queryByText('Payment method')).toBeNull();
  });

  it('the delivery window shows a readable day, never the raw ISO date', async () => {
    notRated();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({
      ...completed, scheduledDeliveryDate: '2026-10-08', deliverySlotName: null,
    });
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('8th Oct 2026')).toBeTruthy();
    expect(screen.queryByText(/2026-10-08/)).toBeNull();
  });

  it('the delivery window with a slot reads "8th Oct 2026, Morning"', async () => {
    notRated();
    (fetchSupplierOrder as jest.Mock).mockResolvedValue({
      ...completed, scheduledDeliveryDate: '2026-10-08', deliverySlotName: 'Morning',
    });
    setup(RestaurantOrderScreen);
    expect(await screen.findByText('8th Oct 2026, Morning')).toBeTruthy();
  });

  it('GST Documents carries a document icon', async () => {
    notRated();
    setup(RestaurantOrderScreen);
    await screen.findByText('GST Documents');
    expect(screen.getByText('icon:document-text-outline')).toBeTruthy();
  });
});

describe('rating screen', () => {
  it('sends the buyer back to this order after rating, not the Requests tab', async () => {
    notRated();
    setup(RatingScreen);
    fireEvent.press((await screen.findAllByLabelText('5 stars'))[0]);
    fireEvent.press(screen.getByText('Submit Rating'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/restaurant/orders/5'));
  });

  it('after rating, the order page underneath never offers Rate This Order again, even before a refetch lands', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const wrap = (el: React.ReactElement) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={client}><MandiToastProvider>{el}</MandiToastProvider></QueryClientProvider>
      </SafeAreaProvider>
    );
    // The server's read still says "not rated" (a lagging replica): only what the rating screen wrote can say otherwise.
    notRated();
    (createRating as jest.Mock).mockResolvedValue({ id: 1, overall: 5 });
    // The order page stays mounted under the rating screen, as it is in a navigation stack.
    const orderPage = render(wrap(<RestaurantOrderScreen />));
    await orderPage.findByText('Rate This Order');
    render(wrap(<RatingScreen />));
    fireEvent.press((await screen.findAllByLabelText('5 stars'))[0]);
    fireEvent.press(screen.getByText('Submit Rating'));
    await waitFor(() => expect(createRating).toHaveBeenCalled());
    await waitFor(() => expect(orderPage.queryByText('Rate This Order')).toBeNull());
    await new Promise((r) => setTimeout(r, 50));   // and it does not come back when the lagging read lands
    expect(orderPage.queryByText('Rate This Order')).toBeNull();
  });

  it('stars say how many and expose the selection', async () => {
    notRated();
    setup(RatingScreen);
    const star = (await screen.findAllByLabelText('4 stars'))[0];
    expect(star.props.accessibilityRole ?? star.props.role).toBe('radio');
    fireEvent.press(star);
    expect(screen.getAllByLabelText('4 stars')[0].props.accessibilityState).toMatchObject({ checked: true });
  });
});
