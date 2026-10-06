import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeliveryModePicker } from '@/components/request/DeliveryModePicker';
import { ApiError } from '@/lib/api/errors';
import { DELIVERY_UNAVAILABLE_FALLBACK, deliveryUnavailableMessage, feeNeedsRefreshing } from '@/lib/delivery/quoteMessages';
import { quoteDelivery } from '@/services/intent';
import type { Intent } from '@/models/intent';
import { DELIVERY_UNAVAILABLE_CHILLED, PRICE_CHANGED_NOW_CHILLED } from './fixtures/catchWeightContract';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/services/intent', () => ({ quoteDelivery: jest.fn() }));

const fromEnvelope = (envelope: { error: { code: string; message: string } }, status: number) =>
  new ApiError({ code: envelope.error.code, message: envelope.error.message, status });

describe('chilled goods at checkout', () => {
  it('shows the server\'s sentence when no carrier can carry them, not a generic one', async () => {
    (quoteDelivery as jest.Mock).mockRejectedValue(fromEnvelope(DELIVERY_UNAVAILABLE_CHILLED, 422));
    const request = { id: 41, acceptance: { deliveryModes: 'PICKUP,COSTONOMY_DELIVERY', deliveryFee: '0' } } as unknown as Intent;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    render(
      <QueryClientProvider client={client}>
        <DeliveryModePicker request={request} selected="PICKUP" onSelect={jest.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(DELIVERY_UNAVAILABLE_CHILLED.error.message)).toBeTruthy();
    expect(screen.queryByText(DELIVERY_UNAVAILABLE_FALLBACK)).toBeNull();
  });

  it('keeps the generic sentence for a failure that is not the API\'s', () => {
    expect(deliveryUnavailableMessage(new TypeError('Network request failed'))).toBe(DELIVERY_UNAVAILABLE_FALLBACK);
  });

  it('asks for the fee again, and the choice again, when it was quoted for ordinary goods and the order is chilled now', () => {
    expect(feeNeedsRefreshing(fromEnvelope(PRICE_CHANGED_NOW_CHILLED, 422))).toBe(true);
    expect(feeNeedsRefreshing(fromEnvelope(DELIVERY_UNAVAILABLE_CHILLED, 422))).toBe(false);
    expect(feeNeedsRefreshing(new TypeError('Network request failed'))).toBe(false);
  });
});
