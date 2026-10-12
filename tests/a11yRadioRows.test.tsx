import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StarRating } from '@/components/trust/StarRating';
import { DeliveryOfferChoice } from '@/components/request/DeliveryOfferChoice';
import { DeliveryModePicker } from '@/components/request/DeliveryModePicker';
import type { Intent } from '@/models/intent';
import type { DeliveryPolicy } from '@/services/supplier';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/services/intent', () => ({ quoteDelivery: jest.fn().mockResolvedValue({ fee: '55.00', quoteReference: 'q1', etaMinutes: 40 }) }));

/**
 * The aria-checked the radio row was given. On native, React Native's View folds aria-checked into accessibilityState
 * before the host element, so it is read from the nearest element above the host that carries it (the Pressable);
 * react-native-web renders that prop as the DOM aria-checked attribute.
 */
function ariaChecked(host: ReturnType<typeof screen.getByRole>): unknown {
  let node: typeof host | null = host;
  while (node != null) {
    if ('aria-checked' in node.props) return node.props['aria-checked'];
    node = node.parent as typeof host | null;
  }
  return undefined;
}

// Radios expose `checked` (never `selected`, which is aria-selected on the web and invalid on role=radio).
function expectOneChecked(checkedIndex: number) {
  const radios = screen.getAllByRole('radio');
  radios.forEach((radio, i) => {
    const state = radio.props.accessibilityState ?? {};
    expect(state.checked).toBe(i === checkedIndex);
    expect(state.selected).toBeUndefined();
    // The web reads aria-checked, not accessibilityState (react-native-web does not map it for role=radio).
    expect(ariaChecked(radio)).toBe(i === checkedIndex);
  });
  return radios;
}

describe('radio rows expose checked, not selected', () => {
  it('StarRating', () => {
    render(<StarRating label="Quality" value={4} onChange={jest.fn()} />);
    expect(expectOneChecked(3)).toHaveLength(5);
  });

  it('supplier delivery choice (DeliveryOfferChoice)', () => {
    const policy = {
      supplierStoreId: 1, ownDeliveryEnabled: true, costonomyDeliveryEnabled: true,
      ownDeliveryFee: '30.00', ownDeliveryMinOrderValue: null, maxDeliveryRadiusKm: null,
    } as DeliveryPolicy;
    render(<DeliveryOfferChoice policy={policy} value="COSTONOMY" onChange={jest.fn()} />);
    expectOneChecked(1);
  });

  it('DeliveryModePicker option row', async () => {
    const request = {
      id: 5, supplierStoreId: 1, deliveryPreference: 'PICKUP',
      acceptance: { deliveryModes: 'PICKUP,COSTONOMY_DELIVERY', deliveryFee: null, deliveryOffer: 'COSTONOMY' },
    } as unknown as Intent;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DeliveryModePicker request={request} selected="PICKUP" onSelect={jest.fn()} initialMode="PICKUP" />
      </QueryClientProvider>,
    );
    const radios = await screen.findAllByRole('radio');
    radios.forEach((radio) => expect((radio.props.accessibilityState ?? {}).selected).toBeUndefined());
    expect(radios.filter((r) => r.props.accessibilityState.checked === true)).toHaveLength(1);
    radios.forEach((radio) => expect(ariaChecked(radio)).toBe(radio.props.accessibilityState.checked));
  });
});

describe('radio rows carry a real aria-checked for the web', () => {
  it('StarRating: true on the chosen star, false on the others, never missing', () => {
    render(<StarRating label="Quality" value={2} onChange={jest.fn()} />);
    const values = screen.getAllByRole('radio').map(ariaChecked);
    expect(values).toEqual([false, true, false, false, false]);
  });
});
