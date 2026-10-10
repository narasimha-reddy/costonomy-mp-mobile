import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentMethodPicker } from '@/components/request/PaymentMethodPicker';
import { DeliverySlotPicker } from '@/components/request/DeliverySlotPicker';
import { PAYMENT_METHOD_LABEL } from '@/components/request/paymentLabels';
import { fetchWallet } from '@/services/wallet';
import { fetchOutletAgreements } from '@/services/credit';
import { fetchAvailableSlots } from '@/services/delivery';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn() }));
jest.mock('@/services/credit', () => ({ fetchOutletAgreements: jest.fn() }));
jest.mock('@/services/delivery', () => ({ fetchAvailableSlots: jest.fn() }));

const wrap = (node: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>,
);

describe('payment options', () => {
  it('say available, so a balance is not read as a price, and use one name each', async () => {
    (fetchWallet as jest.Mock).mockResolvedValue({ balance: '79601.06' });
    (fetchOutletAgreements as jest.Mock).mockResolvedValue([
      { supplierStoreId: 4, status: 'ACTIVE', available: '69296.00' },
    ]);
    wrap(<PaymentMethodPicker outletId={9} supplierStoreId={4} amount="100.00" selected="WALLET" onSelect={jest.fn()} />);
    expect(await screen.findByText('₹79,601.06 available')).toBeTruthy();
    expect(screen.getByText('₹69,296.00 available')).toBeTruthy();
    expect(screen.getByText('Mandi credit')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
    expect(screen.getByText('Card / UPI')).toBeTruthy();
    expect(PAYMENT_METHOD_LABEL).toEqual({ CREDIT: 'Mandi credit', WALLET: 'Wallet', PREPAID: 'Card / UPI' });
  });
});

describe('delivery slots', () => {
  it('say something a restaurant can use when there are no slots, not the admin setting', async () => {
    (fetchAvailableSlots as jest.Mock).mockResolvedValue([]);
    wrap(<DeliverySlotPicker supplierStoreId={4} selectedSlotId={null} selectedDate={null} onSelect={jest.fn()} />);
    await waitFor(() => expect(
      screen.getByText('A delivery partner will be arranged as soon as the supplier has packed your order'),
    ).toBeTruthy());
    expect(screen.queryByText(/predefined slots/)).toBeNull();
  });
});
