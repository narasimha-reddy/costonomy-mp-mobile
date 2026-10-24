import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeliverySlotPicker } from '@/components/request/DeliverySlotPicker';
import { fetchAvailableSlots } from '@/services/delivery';
import { istDay } from '@/lib/delivery/deliveryDay';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/services/delivery', () => ({ fetchAvailableSlots: jest.fn() }));

const slot = (id: number, name: string, available: boolean, reason: string | null = null) => ({
  id, slotName: name, startTime: '06:00:00', endTime: '07:00:00', orderCutoffTime: '22:00:00',
  maxOrdersPerDay: 5, bookedOrders: 0, availableCapacity: 5, available, unavailableReason: reason,
});

function setup(selectedDate: string | null, selectedSlotId: number | null = null) {
  const onSelect = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeliverySlotPicker supplierStoreId={1} selectedSlotId={selectedSlotId} selectedDate={selectedDate}
        onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return onSelect;
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchAvailableSlots as jest.Mock).mockResolvedValue([
    slot(1, 'Early', false, 'This slot has already started today'),
    slot(2, 'Morning', true),
  ]);
});

describe('the delivery time picker', () => {
  it('offers as soon as possible, selected when there is no day, and does not pick a slot for it', async () => {
    const onSelect = setup(null);

    expect(screen.getByText('As soon as possible')).toBeTruthy();
    expect(screen.getByRole('radio', { checked: true })).toBeTruthy();
    expect(await screen.findByText('Morning')).toBeTruthy();
    // Slots are listed, but none is chosen on the buyer's behalf while as soon as possible is.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('starts a chosen day on its first available slot, skipping one that has started', async () => {
    const day = istDay(1);
    const onSelect = setup(day);

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(2, day));
    expect(onSelect).not.toHaveBeenCalledWith(1, day);
  });

  it('goes back to as soon as possible with no slot and no day', async () => {
    const onSelect = setup(istDay(1), 2);
    await screen.findByText('Morning');

    fireEvent.press(screen.getByText('As soon as possible'));
    expect(onSelect).toHaveBeenLastCalledWith(null, null);
  });

  it('shows why a slot cannot be chosen', async () => {
    setup(istDay(0));
    expect(await screen.findByText('This slot has already started today')).toBeTruthy();
  });
});
