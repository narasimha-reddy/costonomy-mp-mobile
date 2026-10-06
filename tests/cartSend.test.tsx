import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CartScreen from '@/app/restaurant/cart';
import { MandiToastProvider } from '@/components/common';
import {
  addIntentItem, removeIntentItem, sendBasket, setDeliveryPreference, updateIntentItem,
} from '@/services/intent';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 9 }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/intent', () => ({
  addIntentItem: jest.fn(),
  removeIntentItem: jest.fn(),
  updateIntentItem: jest.fn(),
  sendBasket: jest.fn(),
  setDeliveryPreference: jest.fn(),
  prepareDirectOrder: jest.fn(),
}));

const mockDraft = {
  id: 31, reference: 'RQ-1', supplierStoreId: 4, storeName: 'Metro', supplierName: 'Metro',
  status: 'DRAFT', deliveryPreference: 'DELIVERY', pricedComplete: true, agreedValue: '1230.00', agreedGst: '61.50', agreedTotal: '1291.50',
  items: [{
    id: 501, supplierSkuId: 77, sku: null, requestedQuantity: '3', unit: 'KG',
    agreedLineTotal: '1291.50', agreedUnitPriceInclusiveGst: '430.50', priceChanged: false,
  }],
};
jest.mock('@/hooks/useRequestBasket', () => ({
  useRequestBasket: () => ({
    basket: { requests: [mockDraft] }, drafts: [mockDraft], loading: false, error: null, refetch: jest.fn(),
  }),
  useInvalidateBasket: () => () => Promise.resolve(),
}));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <CartScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (updateIntentItem as jest.Mock).mockResolvedValue({});
  (removeIntentItem as jest.Mock).mockResolvedValue({});
  (addIntentItem as jest.Mock).mockResolvedValue({});
  (setDeliveryPreference as jest.Mock).mockResolvedValue({});
  (sendBasket as jest.Mock).mockResolvedValue({ sent: [{ id: 31, storeName: 'Metro' }], held: [] });
});

describe('the cart', () => {
  it('writes a tapped quantity before it sends, so the request goes out with what was tapped', async () => {
    setup();

    fireEvent.press(screen.getByLabelText(/Increase quantity/));
    fireEvent.press(screen.getByLabelText(/Increase quantity/));
    // No pause for the debounce: send straight away.
    fireEvent.press(screen.getByText('Send Request'));

    await waitFor(() => expect(sendBasket).toHaveBeenCalled());
    expect(updateIntentItem).toHaveBeenCalledTimes(1);
    expect(updateIntentItem).toHaveBeenCalledWith('token', 501, '5');
    expect((updateIntentItem as jest.Mock).mock.invocationCallOrder[0] as number)
      .toBeLessThan((sendBasket as jest.Mock).mock.invocationCallOrder[0] as number);
  });

  it('writes a tapped quantity when the screen is left', async () => {
    const view = setup();

    fireEvent.press(screen.getByLabelText(/Increase quantity/));
    expect(updateIntentItem).not.toHaveBeenCalled();
    view.unmount();

    // Straight away, not after the debounce: the screen is gone, and a timer would have gone with it.
    await act(async () => { await Promise.resolve(); });
    expect(updateIntentItem).toHaveBeenCalledWith('token', 501, '4');
  });

  it('removes the line when minus is pressed at one, and offers to undo it', async () => {
    const [line] = mockDraft.items as [typeof mockDraft.items[number]];
    line.requestedQuantity = '1';
    setup();

    fireEvent.press(screen.getByLabelText(/Decrease quantity/));
    await waitFor(() => expect(removeIntentItem).toHaveBeenCalledWith('token', 501));
    expect(updateIntentItem).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(await screen.findByLabelText('Undo')); });
    await waitFor(() => expect(addIntentItem).toHaveBeenCalledWith('token', 9, {
      supplierSkuId: 77, quantity: '1',
    }));
    line.requestedQuantity = '3';
  });

  it('sends immediate by default, and the chosen day when the buyer picks one', async () => {
    setup();

    fireEvent.press(screen.getByText('Send Request'));
    await waitFor(() => expect(sendBasket).toHaveBeenCalledTimes(1));
    expect((sendBasket as jest.Mock).mock.calls[0][2].preferredDeliveryDate).toBeUndefined();

    fireEvent.press(screen.getByLabelText('Delivery: Tomorrow'));
    fireEvent.press(screen.getByText('Send Request'));
    await waitFor(() => expect(sendBasket).toHaveBeenCalledTimes(2));
    expect((sendBasket as jest.Mock).mock.calls[1][2].preferredDeliveryDate)
      .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lets a quantity be typed, and saves it when typing ends', async () => {
    setup();
    const box = screen.getByLabelText(/^Quantity/);

    fireEvent.changeText(box, '50');
    expect(updateIntentItem).not.toHaveBeenCalled();
    fireEvent(box, 'endEditing');

    await waitFor(() => expect(updateIntentItem).toHaveBeenCalledWith('token', 501, '50'));
    expect(removeIntentItem).not.toHaveBeenCalled();
  });

  it('does not remove the line when the box is emptied to type a new number', async () => {
    setup();
    const box = screen.getByLabelText(/^Quantity/);

    fireEvent.changeText(box, '');
    fireEvent(box, 'endEditing');

    // Back to what it was: minus is how a line is taken away.
    await act(async () => { await Promise.resolve(); });
    expect(removeIntentItem).not.toHaveBeenCalled();
    expect(updateIntentItem).not.toHaveBeenCalled();
  });

  it('sends a day and a deliver-by time with the request', async () => {
    setup();

    fireEvent.press(screen.getByLabelText('Delivery: Tomorrow'));
    fireEvent.press(screen.getByLabelText('Delivery: By 6 am'));
    fireEvent.press(screen.getByText('Send Request'));

    await waitFor(() => expect(sendBasket).toHaveBeenCalled());
    const body = (sendBasket as jest.Mock).mock.calls[0][2];
    expect(body.preferredDeliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 6:00 in India is 00:30 UTC.
    expect(body.requestedDeliveryTime).toMatch(/T00:30:00\.000Z$/);
  });

  it('lets the buyer say, for this supplier, whether they will collect it', async () => {
    setup();

    fireEvent.press(screen.getByLabelText("Metro: I'll collect"));

    await waitFor(() => expect(setDeliveryPreference).toHaveBeenCalledWith('token', 31, 'PICKUP'));
  });

  it('says free delivery is by the supplier, compares goods before GST, and hides when the buyer collects', () => {
    const draft = mockDraft as unknown as Record<string, unknown>;
    draft.freeDeliveryThreshold = '2000.00';
    const { unmount } = setup();

    // 2,000 less the goods before GST (1,230), not the total with GST (1,291.50).
    expect(screen.getByText('Add ₹770.00 more for free delivery by the supplier')).toBeTruthy();
    unmount();

    draft.deliveryPreference = 'PICKUP';
    setup();
    expect(screen.queryByText(/free delivery/i)).toBeNull();

    draft.deliveryPreference = 'DELIVERY';
    draft.freeDeliveryThreshold = undefined;
  });
});

