import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeliveryModePicker } from '@/components/request/DeliveryModePicker';
import { quoteDelivery } from '@/services/intent';
import type { Intent } from '@/models/intent';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/services/intent', () => ({ quoteDelivery: jest.fn() }));

const request = (preference: 'DELIVERY' | 'PICKUP') => ({
  id: 5, supplierStoreId: 1, deliveryPreference: preference,
  acceptance: { deliveryModes: 'PICKUP,COSTONOMY_DELIVERY', deliveryFee: null, deliveryOffer: 'COSTONOMY' },
}) as unknown as Intent;

function start(preference: 'DELIVERY' | 'PICKUP', extra: { initialMode?: 'PICKUP' | 'COSTONOMY_DELIVERY' | null } = {}) {
  const onSelect = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeliveryModePicker request={request(preference)} selected={null} onSelect={onSelect} {...extra} />
    </QueryClientProvider>,
  );
  return onSelect;
}

beforeEach(() => {
  jest.clearAllMocks();
  (quoteDelivery as jest.Mock).mockResolvedValue({ fee: '55.00', quoteReference: 'q1', etaMinutes: 40 });
});

describe('where the delivery choice starts', () => {
  it('delivery preselected when the restaurant asked for delivery', async () => {
    const onSelect = start('DELIVERY');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('COSTONOMY_DELIVERY', '55.00', 'q1'));
    // The quoted fee is on the option, and pickup was never chosen on the way.
    expect(screen.getByText('₹55.00')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalledWith('PICKUP', expect.anything(), undefined);
  });

  it('pickup preference keeps pickup', async () => {
    const onSelect = start('PICKUP');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('PICKUP', '0', undefined));
    await waitFor(() => expect(quoteDelivery).toHaveBeenCalled());
    expect(onSelect).not.toHaveBeenCalledWith('COSTONOMY_DELIVERY', expect.anything(), expect.anything());
  });

  it('never falls back to pickup silently when the delivery quote fails', async () => {
    (quoteDelivery as jest.Mock).mockRejectedValue(new Error('no quote'));
    const onSelect = start('DELIVERY');
    await waitFor(() => expect(quoteDelivery).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a choice restored from an earlier visit beats the preference', async () => {
    const onSelect = start('DELIVERY', { initialMode: 'PICKUP' });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('PICKUP', '0', undefined));
    expect(onSelect).not.toHaveBeenCalledWith('COSTONOMY_DELIVERY', expect.anything(), expect.anything());
  });
});
