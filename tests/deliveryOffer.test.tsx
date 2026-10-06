import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeliveryModePicker } from '@/components/request/DeliveryModePicker';
import {
  DeliveryOfferChoice, deliveryAnswerFor, deliveryChargeValid, deliveryOffersFor,
} from '@/components/request/DeliveryOfferChoice';
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
  it("always offers 'I will deliver it' and 'I can't', and Costonomy delivery only when the store has it on", () => {
    expect(deliveryOffersFor(policy())).toEqual(['SELF', 'COSTONOMY', 'NONE']);
    // No store fee and own delivery switched off in settings change nothing: the charge is typed per order.
    expect(deliveryOffersFor(policy({ ownDeliveryEnabled: false, ownDeliveryFee: '0.00' })))
      .toEqual(['SELF', 'COSTONOMY', 'NONE']);
    expect(deliveryOffersFor(policy({ costonomyDeliveryEnabled: false }))).toEqual(['SELF', 'NONE']);
    expect(deliveryOffersFor(undefined)).toEqual([]);
  });

  it('treats an empty charge as zero and refuses anything that is not a plain number', () => {
    expect(deliveryChargeValid('')).toBe(true);
    expect(deliveryChargeValid('0')).toBe(true);
    expect(deliveryChargeValid('40')).toBe(true);
    expect(deliveryChargeValid('40.5')).toBe(true);
    expect(deliveryChargeValid('.')).toBe(false);
    expect(deliveryChargeValid('4o')).toBe(false);
    expect(deliveryChargeValid('-5')).toBe(false);
  });

  it('sends free delivery for a charge of 0 or nothing, and the amount otherwise', () => {
    expect(deliveryAnswerFor('SELF', '0')).toEqual({ deliveryOffer: 'SELF_FREE' });
    expect(deliveryAnswerFor('SELF', '')).toEqual({ deliveryOffer: 'SELF_FREE' });
    expect(deliveryAnswerFor('SELF', '40')).toEqual({ deliveryOffer: 'SELF', deliveryFee: '40' });
    expect(deliveryAnswerFor('SELF', '40.50')).toEqual({ deliveryOffer: 'SELF', deliveryFee: '40.5' });
    // A charge typed and then another choice made is not sent.
    expect(deliveryAnswerFor('COSTONOMY', '40')).toEqual({ deliveryOffer: 'COSTONOMY' });
    expect(deliveryAnswerFor('NONE', '40')).toEqual({ deliveryOffer: 'NONE' });
    expect(deliveryAnswerFor(null, '40')).toEqual({});
  });

  it('says riders are requested after Ready, and picks the chosen offer', () => {
    const onChange = jest.fn();
    render(<DeliveryOfferChoice policy={policy()} value="SELF" onChange={onChange} />);
    // One option for delivering yourself: the charge, with 0 meaning free, is typed in a box.
    expect(screen.getAllByText('I will deliver it')).toHaveLength(1);

    expect(screen.getByText(/Riders are requested after you mark the order Ready for Pickup/)).toBeTruthy();
    fireEvent.press(screen.getByText('Use Costonomy delivery'));
    expect(onChange).toHaveBeenCalledWith('COSTONOMY');
  });
});

describe('a lower charge for one order', () => {
  it('offers a charge field only for delivery at a fee, and reports what was typed', () => {
    const onFeeChange = jest.fn();
    const { rerender } = render(
      <DeliveryOfferChoice policy={policy()} value="COSTONOMY" onChange={jest.fn()} fee="" onFeeChange={onFeeChange} />,
    );
    expect(screen.queryByPlaceholderText('0')).toBeNull();

    rerender(
      <DeliveryOfferChoice policy={policy()} value="SELF" onChange={jest.fn()} fee="" onFeeChange={onFeeChange} />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('0'), '20');
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

describe('where the picker starts', () => {
  const requestWith = (offer: string | null, modes: string, fee: string | null) => ({
    id: 5, supplierStoreId: 1,
    acceptance: { deliveryModes: modes, deliveryFee: fee, deliveryOffer: offer },
  }) as unknown as Intent;

  function start(offer: string | null, modes: string, fee: string | null) {
    const onSelect = jest.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DeliveryModePicker request={requestWith(offer, modes, fee)} selected={null} onSelect={onSelect} />
      </QueryClientProvider>,
    );
    return onSelect;
  }

  it('starts on the supplier\'s free delivery, with pickup still available', () => {
    const onSelect = start('SELF_FREE', 'PICKUP,SUPPLIER_DELIVERY', '0');
    expect(onSelect).toHaveBeenCalledWith('SUPPLIER_DELIVERY', '0', undefined);
    expect(screen.getByText('I will collect')).toBeTruthy();
  });

  it('starts on the supplier\'s own delivery at a fee, showing the fee', () => {
    const onSelect = start('SELF', 'PICKUP,SUPPLIER_DELIVERY', '30.00');
    expect(onSelect).toHaveBeenCalledWith('SUPPLIER_DELIVERY', '30.00', undefined);
  });

  it('starts on pickup when the supplier offered only Costonomy delivery', async () => {
    const onSelect = start('COSTONOMY', 'PICKUP,COSTONOMY_DELIVERY', null);
    expect(onSelect).toHaveBeenCalledWith('PICKUP', '0', undefined);
  });

  it('starts on pickup for an older answer that did not say', () => {
    const onSelect = start(null, 'PICKUP,SUPPLIER_DELIVERY', null);
    expect(onSelect).toHaveBeenCalledWith('PICKUP', '0', undefined);
  });
});

describe('a supplier who cannot deliver', () => {
  it('tells the buyer they would collect it', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DeliveryModePicker
          request={{ id: 5, supplierStoreId: 1, deliveryPreference: 'DELIVERY',
            acceptance: { deliveryModes: 'PICKUP', deliveryFee: null, deliveryOffer: 'NONE' } } as unknown as Intent}
          selected="PICKUP"
          onSelect={jest.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("This supplier can't deliver this order, so you would collect it.")).toBeTruthy();
    expect(screen.queryByText('Supplier delivers')).toBeNull();
  });
});

describe('a high delivery charge', () => {
  function showWith(high: boolean | undefined, fee: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DeliveryModePicker
          request={{ id: 5, supplierStoreId: 1, deliveryPreference: 'DELIVERY',
            acceptance: { deliveryModes: 'PICKUP,SUPPLIER_DELIVERY', deliveryFee: fee, deliveryOffer: 'SELF',
              highDeliveryCharge: high } } as unknown as Intent}
          selected="SUPPLIER_DELIVERY"
          onSelect={jest.fn()}
        />
      </QueryClientProvider>,
    );
  }

  it('warns the buyer, with the amount, and says they can collect instead', () => {
    showWith(true, '300.00');
    expect(screen.getByText(/High delivery charge: .*300.* on this order\. You can collect it instead\./)).toBeTruthy();
  });

  it('says nothing for a normal charge, or when the server did not flag it', () => {
    showWith(false, '45.00');
    expect(screen.queryByText(/High delivery charge/)).toBeNull();
  });

  it('says nothing when the flag is missing (an older server)', () => {
    showWith(undefined, '300.00');
    expect(screen.queryByText(/High delivery charge/)).toBeNull();
  });
});

