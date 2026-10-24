import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SubscribeModal } from '@/components/restaurant/SubscribeModal';
import { MandiToastProvider } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { createSubscription } from '@/services/subscription';
import { SUBSCRIPTION_REFUSALS, SUBSCRIPTION_WALLET } from './fixtures/catchWeightContract';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 3 }) }));
const mockCreditFor = jest.fn();
jest.mock('@/hooks/useOutletCredit', () => ({ useOutletCredit: () => ({ creditFor: mockCreditFor, loading: false }) }));
jest.mock('@/services/subscription', () => ({ createSubscription: jest.fn() }));
jest.mock('@/services/delivery', () => ({ fetchAvailableSlots: jest.fn().mockResolvedValue([]) }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <SubscribeModal visible onClose={jest.fn()} supplierStoreId={12} supplierSkuId={77} productName="Fresh Milk 1L" defaultUnit="LTR" />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreditFor.mockReturnValue(null);
});

describe('the subscribe sheet (API D-132)', () => {
  it('offers wallet and credit, and supplier delivery or pickup: never Costonomy delivery', () => {
    setup();
    expect(screen.getByLabelText('Pay from wallet')).toBeTruthy();
    expect(screen.getByLabelText('Supplier delivery')).toBeTruthy();
    expect(screen.getByLabelText('Store pickup')).toBeTruthy();
    expect(screen.queryByText('Costonomy Courier')).toBeNull();
    expect(screen.queryByLabelText('Costonomy Courier')).toBeNull();
  });

  it('sends the payment method and only what the API reads, with the SKU\'s own unit', async () => {
    (createSubscription as jest.Mock).mockResolvedValue(SUBSCRIPTION_WALLET);
    setup();

    fireEvent.press(screen.getByText('Confirm subscription'));

    await waitFor(() => expect(createSubscription).toHaveBeenCalled());
    const body = (createSubscription as jest.Mock).mock.calls[0][2];
    expect(body).toMatchObject({
      supplierStoreId: 12, supplierSkuId: 77, quantity: '1', unit: 'LTR', frequency: 'DAILY',
      deliveryMode: 'SUPPLIER_DELIVERY', paymentMethod: 'WALLET',
    });
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps credit unavailable until this supplier has extended it, and says so', () => {
    setup();
    expect(screen.getByLabelText('Pay on credit, not available with this supplier').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Credit isn't set up with this supplier yet.")).toBeTruthy();
  });

  it('sends credit when it is chosen with an active agreement', async () => {
    mockCreditFor.mockReturnValue({ status: 'ACTIVE' });
    (createSubscription as jest.Mock).mockResolvedValue({ ...SUBSCRIPTION_WALLET, paymentMethod: 'CREDIT' });
    setup();

    fireEvent.press(screen.getByLabelText('Pay on credit'));
    fireEvent.press(screen.getByText('Confirm subscription'));

    await waitFor(() => expect(createSubscription).toHaveBeenCalled());
    expect((createSubscription as jest.Mock).mock.calls[0][2].paymentMethod).toBe('CREDIT');
  });

  it('refuses an empty quantity in the sheet and sends nothing', async () => {
    setup();
    fireEvent.changeText(screen.getByDisplayValue('1'), '');

    fireEvent.press(screen.getByText('Confirm subscription'));

    expect(await screen.findByText('Enter a quantity above zero.')).toBeTruthy();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it('shows the server\'s refusal inside the sheet', async () => {
    (createSubscription as jest.Mock).mockRejectedValue(new ApiError({
      code: 'VALIDATION_ERROR', status: 400, message: SUBSCRIPTION_REFUSALS.doesNotDeliver.error.message,
    }));
    setup();

    fireEvent.press(screen.getByText('Confirm subscription'));

    expect(await screen.findByText("This supplier doesn't deliver. Choose pickup.")).toBeTruthy();
  });
});
