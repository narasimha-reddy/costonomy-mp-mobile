import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeliveryModePicker } from '@/components/request/DeliveryModePicker';
import { DeliveryOfferChoice, deliveryOffersFor } from '@/components/request/DeliveryOfferChoice';
import type { Intent } from '@/models/intent';
import type { DeliveryPolicy } from '@/services/supplier';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/services/intent', () => ({ quoteDelivery: jest.fn().mockResolvedValue({ fee: '55.00', quoteReference: 'q1', etaMinutes: 40 }) }));

const policy = (over: Partial<DeliveryPolicy> = {}): DeliveryPolicy => ({
  supplierStoreId: 1, ownDeliveryEnabled: true, costonomyDeliveryEnabled: true,
  ownDeliveryFee: '30.00', ownDeliveryMinOrderValue: null, maxDeliveryRadiusKm: null, ...over,
});

describe('what a supplier can offer', () => {
  it('always lets the supplier deliver free; charging needs a store fee, and riders need Costonomy delivery on', () => {
    expect(deliveryOffersFor(policy())).toEqual(['SELF_FREE', 'SELF', 'COSTONOMY']);
    expect(deliveryOffersFor(policy({ ownDeliveryFee: '0.00' }))).toEqual(['SELF_FREE', 'COSTONOMY']);
    // Own delivery switched off in settings does not stop them saying "I will deliver this one".
    expect(deliveryOffersFor(policy({ ownDeliveryEnabled: false }))).toEqual(['SELF_FREE', 'SELF', 'COSTONOMY']);
    expect(deliveryOffersFor(policy({ ownDeliveryEnabled: false, costonomyDeliveryEnabled: false })))
      .toEqual(['SELF_FREE', 'SELF']);
    expect(deliveryOffersFor(undefined)).toEqual([]);
  });

  it('says riders are requested after Ready, and picks the chosen offer', () => {
    const onChange = jest.fn();
    render(<DeliveryOfferChoice policy={policy()} value="SELF" onChange={onChange} />);

    expect(screen.getByText(/Riders are requested after you mark the order Ready for Pickup/)).toBeTruthy();
    fireEvent.press(screen.getByText('I will deliver it — free'));
    expect(onChange).toHaveBeenCalledWith('SELF_FREE');
  });
});

describe('a lower charge for one order', () => {
  it('offers a charge field only for delivery at a fee, and reports what was typed', () => {
    const onFeeChange = jest.fn();
    const { rerender } = render(
      <DeliveryOfferChoice policy={policy()} value="SELF_FREE" onChange={jest.fn()} fee="" onFeeChange={onFeeChange} />,
    );
    expect(screen.queryByPlaceholderText('30.00')).toBeNull();

    rerender(
      <DeliveryOfferChoice policy={policy()} value="SELF" onChange={jest.fn()} fee="" onFeeChange={onFeeChange} />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('30.00'), '20');
    expect(onFeeChange).toHaveBeenCalledWith('20');
  });
});

describe('what the buyer is told', () => {
  const request = (offer: string | null, fee: string | null) => ({
    id: 5, supplierStoreId: 1,
    acceptance: { deliveryModes: 'PICKUP,SUPPLIER_DELIVERY', deliveryFee: fee, deliveryOffer: offer },
  }) as unknown as Intent;

  function show(offer: string | null, fee: string | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DeliveryModePicker request={request(offer, fee)} selected="PICKUP" onSelect={jest.fn()} />
      </QueryClientProvider>,
    );
  }

  it('states free delivery as free, by the supplier', () => {
    show('SELF_FREE', '0');
    expect(screen.getByText('Free delivery by the supplier, in their own vehicle')).toBeTruthy();
    // Pickup and the free delivery both read "Free", so it is two of them.
    expect(screen.getAllByText('Free')).toHaveLength(2);
  });

  it('also says free when the supplier delivers at a zero charge', () => {
    show('SELF', '0.00');
    expect(screen.getByText('Free delivery by the supplier, in their own vehicle')).toBeTruthy();
  });

  it("shows the supplier's own fee as money, not as free", () => {
    show('SELF', '30.00');
    expect(screen.queryByText('Free delivery by the supplier, in their own vehicle')).toBeNull();
    expect(screen.getAllByText('Free')).toHaveLength(1);
    expect(screen.getByText(/30/)).toBeTruthy();
  });
});
