import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeliveryFundingScreen from '@/app/supplier/settlements/delivery-funding';
import {
  fetchDeliveryFundingHistory, fetchDeliveryFundingSummary, initiateDeliveryFundingPayment,
} from '@/services/deliveryFunding';
import { openRazorpayCheckout } from '@/lib/payments/razorpayCheckout';
import { CheckoutDismissed } from '@/lib/payments/types';

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/supplier/settlements/delivery-funding',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ supplier: { id: 1 }, storeId: 5, stores: [], store: null, setStoreId: jest.fn() }),
}));
jest.mock('@/components/supplier/StoreSelector', () => ({ StoreSelector: () => null }));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock('@/services/deliveryFunding', () => ({
  fetchDeliveryFundingHistory: jest.fn(), fetchDeliveryFundingSummary: jest.fn(),
  initiateDeliveryFundingPayment: jest.fn(), confirmDeliveryFundingPayment: jest.fn(),
}));
jest.mock('@/lib/payments/razorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }));

const line = (over: Record<string, unknown> = {}) => ({
  deductionId: 1, kind: 'DELIVERY_FUNDING', supplierOrderId: 10, orderNumber: 'SO-10', deliveryId: 3, amount: '60.00',
  status: 'PENDING', outcome: 'OWED', nextAction: 'PAY_DIRECTLY_OR_DEDUCTED_FROM_NEXT_SETTLEMENT',
  paymentMethod: 'PREPAID', settlementId: null, appliedAt: null, paidAt: null, reason: 'Costonomy delivery fee',
  createdAt: '2026-10-20T10:00:00Z', ...over,
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DeliveryFundingScreen /></QueryClientProvider>);
}

afterEach(cleanup);
beforeEach(() => {
  jest.clearAllMocks();
  (fetchDeliveryFundingSummary as jest.Mock).mockResolvedValue({
    pending: '60.00', collectedDirectly: '25.00', appliedToSettlement: '15.00', waived: '10.00',
    creditsPending: '0', creditsApplied: '0', pendingCount: 1,
  });
  // The pay flow asks "is this one paid?" with the PAID_DIRECTLY filter; nothing has been paid yet.
  (fetchDeliveryFundingHistory as jest.Mock).mockImplementation(async (_t: string, _s: number, o?: { status?: string }) =>
    o?.status === 'PAID_DIRECTLY' ? [] : [
    line(),
    line({ deductionId: 2, orderNumber: 'SO-11', status: 'APPLIED', outcome: 'TAKEN_FROM_SETTLEMENT', nextAction: 'NONE', settlementId: 9 }),
    line({ deductionId: 3, orderNumber: 'SO-12', status: 'WAIVED', outcome: 'WAIVED', nextAction: 'NONE' }),
  ]);
});

describe('Delivery charges screen', () => {
  it('shows the four buckets, and says it is not a payment to a delivery partner', async () => {
    renderScreen();
    expect(await screen.findByText('Owed now')).toBeTruthy();
    expect(screen.getAllByText('Paid by you').length).toBeGreaterThan(0);
    expect(screen.getByText('Taken from payouts')).toBeTruthy();
    expect(screen.getAllByText('Waived').length).toBeGreaterThan(0);
    expect(screen.getByText(/not a payment to a delivery partner/)).toBeTruthy();
  });

  it('offers Pay now only on the charge the server says can be paid, with what happens otherwise', async () => {
    renderScreen();
    expect(await screen.findByText('SO-10')).toBeTruthy();
    expect(screen.getAllByText('Pay now')).toHaveLength(1);
    expect(screen.getByText('Pay this now, or it is taken from your next payout.')).toBeTruthy();
    expect(screen.getByText('Taken from a payout')).toBeTruthy();
  });

  it('says a credit order has no payout to take the charge from', async () => {
    (fetchDeliveryFundingHistory as jest.Mock).mockResolvedValue([line({ nextAction: 'PAY_DIRECTLY', paymentMethod: 'CREDIT' })]);
    renderScreen();
    expect(await screen.findByText(/no payout to take it from/)).toBeTruthy();
  });

  it('asks the server for the chosen state', async () => {
    renderScreen();
    await screen.findByText('SO-10');
    fireEvent.press(screen.getAllByLabelText('Waived')[0]);
    await waitFor(() => expect(fetchDeliveryFundingHistory).toHaveBeenCalledWith('tok', 5, expect.objectContaining({ status: 'WAIVED' })));
  });

  it('opens the charge, and a closed payment window is quiet: nothing is called paid', async () => {
    (initiateDeliveryFundingPayment as jest.Mock).mockResolvedValue({
      deductionId: 1, razorpayOrderId: 'order_F', keyId: 'rzp_k', amount: '60.00', currency: 'INR',
    });
    (openRazorpayCheckout as jest.Mock).mockRejectedValue(new CheckoutDismissed());
    renderScreen();
    await screen.findByText('SO-10');
    await act(async () => { fireEvent.press(screen.getByText('Pay now')); });
    await waitFor(() => expect(initiateDeliveryFundingPayment).toHaveBeenCalledWith('tok', 5, 1, expect.any(String)));
    expect(await screen.findByText(/payment window was closed/)).toBeTruthy();
  });

  it('shows an error with a retry when the list cannot load', async () => {
    (fetchDeliveryFundingHistory as jest.Mock).mockRejectedValue(new Error('down'));
    renderScreen();
    expect(await screen.findByText("Couldn't load your delivery charges.")).toBeTruthy();
  });
});
