import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MandiToastProvider } from '@/components/common';
import SupplierRequestScreen from '@/app/supplier/requests/[id]';
import { DeliveryOfferChoice } from '@/components/request/DeliveryOfferChoice';
import { fetchIntent, previewResponse, respondToIntent } from '@/services/intent';
import { fetchDeliveryPolicy } from '@/services/supplier';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '7' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 3 }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/chat', () => ({ openThread: jest.fn(), openThreadFromStore: jest.fn() }));
jest.mock('@/services/intent', () => ({
  fetchIntent: jest.fn(), previewResponse: jest.fn(), respondToIntent: jest.fn(),
}));
jest.mock('@/services/supplier', () => ({ fetchDeliveryPolicy: jest.fn() }));

const request = {
  id: 7, reference: 'RQ-7', outletId: 1, outletName: 'Indiranagar', restaurantName: 'Spice Garden',
  outletLocality: 'Main Road', outletCity: 'Bengaluru', supplierStoreId: 3, status: 'OPEN', fulfilment: 'DELIVERY',
  deliveryPreference: 'DELIVERY', preferredDeliveryDate: null, requestedDeliveryTime: null, notes: null,
  sentAt: '2026-10-08T10:00:00Z', createdAt: '2026-10-08T10:00:00Z', responseDeadline: null, responseWindowSeconds: null,
  revision: 1, acceptance: null,
  items: [{ id: 11, requestedQuantity: '4', unit: 'KG', sku: null, agreedUnitPriceInclusiveGst: '26.00', lineTotal: '104.00', offeredQuantity: null }],
};
const policy = {
  supplierStoreId: 3, ownDeliveryEnabled: true, costonomyDeliveryEnabled: true, ownDeliveryFee: '0.00',
  ownDeliveryMinOrderValue: null,
};
const preview = { lines: [{ intentItemId: 11, lineTotal: '104.00' }], offeredValue: '104.00', offeredGst: '0.00', offeredTotal: '104.00' };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}><MandiToastProvider><SupplierRequestScreen /></MandiToastProvider></QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const flush = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

beforeEach(() => {
  jest.clearAllMocks();
  (fetchIntent as jest.Mock).mockResolvedValue(request);
  (fetchDeliveryPolicy as jest.Mock).mockResolvedValue(policy);
  (previewResponse as jest.Mock).mockResolvedValue(preview);
  (respondToIntent as jest.Mock).mockResolvedValue({});
});

describe('supplier request screen', () => {
  it('asks the server to price the reply once on load, not twice', async () => {
    setup();
    await screen.findByText('What can you supply?');
    await flush(700);
    expect(previewResponse).toHaveBeenCalledTimes(1);
  });

  it('titles the screen with the restaurant and outlet', async () => {
    setup();
    // The restaurant is the title and the outlet rides on the subtitle, so neither is cut at 360 px.
    expect(await screen.findByText('Spice Garden')).toBeTruthy();
    expect(screen.getByText('Indiranagar · RQ-7')).toBeTruthy();
  });

  it('keeps the status chip and the summary on separate lines so neither is clipped', async () => {
    setup();
    await screen.findByText('1 item requested');
    // The summary is no longer a right-aligned column squeezed beside the chip.
    const summary = screen.getByText('1 item requested');
    let node = summary.parent;
    let sideBySide = false;
    while (node != null) {
      const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style.flat()) : node.props.style;
      if (style?.alignItems === 'flex-end' && style?.flexShrink == null) sideBySide = true;
      node = node.parent;
    }
    expect(sideBySide).toBe(false);
  });

  it('starts with no delivery method chosen: Accept is off and says why until one is picked', async () => {
    setup();
    expect(await screen.findByText('Choose how this will be delivered')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept request' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByText('Use Costonomy delivery'));
    expect(screen.queryByText('Choose how this will be delivered')).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept request' }).props.accessibilityState.disabled).toBe(false);
  });
});

describe('Accept waits for the delivery policy', () => {
  const accept = () => screen.getByRole('button', { name: 'Accept request' });

  it('keeps Accept disabled while the delivery policy is still loading', async () => {
    (fetchDeliveryPolicy as jest.Mock).mockReturnValue(new Promise(() => undefined));
    setup();
    await screen.findByText('What can you supply?');
    expect(accept().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(accept());
    expect(respondToIntent).not.toHaveBeenCalled();
  });

  it('shows a retry message in the bar when the policy fails to load, and Accept stays off', async () => {
    (fetchDeliveryPolicy as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByText("Couldn't load your delivery options.")).toBeTruthy();
    expect(accept().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(fetchDeliveryPolicy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Choose how this will be delivered')).toBeTruthy();
  });

  it('lets a PICKUP request be accepted with no delivery choice', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue({ ...request, deliveryPreference: 'PICKUP' });
    (fetchDeliveryPolicy as jest.Mock).mockReturnValue(new Promise(() => undefined));
    setup();
    await screen.findByText('The restaurant will collect this');
    expect(accept().props.accessibilityState.disabled).toBe(false);
    fireEvent.press(accept());
    await waitFor(() => expect(respondToIntent).toHaveBeenCalledTimes(1));
    expect((respondToIntent as jest.Mock).mock.calls[0][2].deliveryOffer).toBeUndefined();
  });

  it('sends the chosen delivery offer when Accept is pressed after choosing', async () => {
    setup();
    fireEvent.press(await screen.findByText('Use Costonomy delivery'));
    fireEvent.press(accept());
    await waitFor(() => expect(respondToIntent).toHaveBeenCalledTimes(1));
    expect((respondToIntent as jest.Mock).mock.calls[0][2]).toMatchObject({ deliveryOffer: 'COSTONOMY' });
  });
});

describe('delivery choice', () => {
  it('puts the delivery charge under "I will deliver it", before "I can\'t deliver this order"', () => {
    render(<DeliveryOfferChoice policy={policy as never} value="SELF" onChange={jest.fn()} fee="" onFeeChange={jest.fn()} />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Delivery charge')).toBeGreaterThan(tree.indexOf('I will deliver it'));
    expect(tree.indexOf('Delivery charge')).toBeLessThan(tree.indexOf("I can't deliver this order"));
  });

  it('says Costonomy arranges a delivery partner and the restaurant pays, without inventing a fee', () => {
    render(<DeliveryOfferChoice policy={policy as never} value="COSTONOMY" onChange={jest.fn()} />);
    expect(screen.getByText(/The restaurant pays the delivery fee/)).toBeTruthy();
  });

  it('says the restaurant pays only once when Costonomy delivery is selected', () => {
    render(<DeliveryOfferChoice policy={policy as never} value="COSTONOMY" onChange={jest.fn()} />);
    expect(screen.getAllByText(/restaurant pays the delivery fee/i)).toHaveLength(1);
  });

  it('offers View order once the request has become an order, and opens that order', async () => {
    (fetchIntent as jest.Mock).mockResolvedValue({
      ...request, status: 'ORDERED', supplierOrderId: 41, supplierOrderNumber: 'ORD-41',
      acceptance: { offeredValue: '104.00', offeredGst: '0.00', offeredTotal: '104.00' },
    });
    setup();
    fireEvent.press(await screen.findByText('View order'));
    expect(mockPush).toHaveBeenCalledWith('/supplier/orders/41');
  });

  it('has no View order button while there is no order', async () => {
    setup();
    await screen.findByText('What can you supply?');
    expect(screen.queryByText('View order')).toBeNull();
  });
});
