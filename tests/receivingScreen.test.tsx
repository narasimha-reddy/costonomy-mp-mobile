import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ReceivingScreen from '@/app/restaurant/receiving/[orderId]';
import { MandiToastProvider } from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { fetchSupplierOrder } from '@/services/procurement';
import { receiveOrder } from '@/services/trust';
import {
  ORDER_READY_SETTLED_9_6, RECEIVING_APPLIED_NO_NOTE_YET, RECEIVING_IN_FULL, RECEIVING_PENDING_CAPTURE, RECEIVING_WITH_CREDIT_NOTE,
} from './fixtures/catchWeightContract';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: '501' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/procurement', () => ({ fetchSupplierOrder: jest.fn(), newIdempotencyKey: () => 'unused' }));
jest.mock('@/services/trust', () => ({ receiveOrder: jest.fn() }));
let mockKeyCounter = 0;
jest.mock('@/lib/api/client', () => ({ newIdempotencyKey: () => `key-${++mockKeyCounter}` }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <MandiToastProvider>
          <ReceivingScreen />
        </MandiToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const paidBy = (paymentMethod: string) => (fetchSupplierOrder as jest.Mock).mockResolvedValue({ ...ORDER_READY_SETTLED_9_6, paymentMethod });

/** 0.1 kg of the weighed 9.6 missing: received 9.5, damaged 0, missing 0.1. */
async function enterShortDelivery() {
  const received = (await screen.findAllByDisplayValue('9.6'))[0] as ReturnType<typeof screen.getByDisplayValue>;
  fireEvent.changeText(received, '9.5');
  const zeros = screen.getAllByDisplayValue('0');
  fireEvent.changeText(zeros[1] as typeof received, '0.1');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockKeyCounter = 0;
});

describe('the check-in counts (API D-128)', () => {
  it('start from the billed 9.6 kg, and say the line was weighed', async () => {
    paidBy('PREPAID');
    setup();

    expect(await screen.findByText('Weighed and billed 9.6 KG')).toBeTruthy();
    expect((await screen.findAllByDisplayValue('9.6')).length).toBeGreaterThan(0);
  });

  it('accept 9.5 received plus 0.1 missing as accounting for the billed 9.6, not the ordered 10', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_APPLIED_NO_NOTE_YET);
    setup();
    await enterShortDelivery();

    fireEvent.press(screen.getByText('Complete check-in'));

    await waitFor(() => expect(receiveOrder).toHaveBeenCalled());
    const [, orderId, items] = (receiveOrder as jest.Mock).mock.calls[0];
    expect(orderId).toBe(501);
    expect(items).toEqual([{
      supplierOrderItemId: 301, receivedQuantity: '9.5', damagedQuantity: '0', missingQuantity: '0.1',
      rejectionReason: 'SHORT_DELIVERY',
    }]);
  });

  it('show no refund estimate before the server has worked it out', async () => {
    paidBy('PREPAID');
    setup();
    await enterShortDelivery();

    expect(screen.queryByText(/Estimated/)).toBeNull();
    expect(screen.queryByText(/~₹/)).toBeNull();
  });
});

describe('what the restaurant is told after the check-in (only what the server sent)', () => {
  it('shows the server\'s refund and where it went, and no credit note that does not exist', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_APPLIED_NO_NOTE_YET);
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    expect(await screen.findByText('Refund of ₹10.50')).toBeTruthy();
    expect(screen.getByText('Back in your wallet as a refund you can withdraw.')).toBeTruthy();
    expect(screen.queryByText(/CN-/)).toBeNull();
    expect(screen.queryByText('Credit note')).toBeNull();
    expect(screen.queryByText(/Costonomy Wallet/)).toBeNull();
  });

  it('says a card refund follows once the payment is captured', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_PENDING_CAPTURE);
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    expect(await screen.findByText('₹10.50 comes back once your card payment finishes. There is nothing for you to do.')).toBeTruthy();
  });

  it('tells a credit customer it came off what they owe', async () => {
    paidBy('CREDIT');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_APPLIED_NO_NOTE_YET);
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    expect(await screen.findByText('Taken off what you owe this supplier.')).toBeTruthy();
  });

  it('shows the credit note\'s number when the server has issued one', async () => {
    paidBy('WALLET');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_WITH_CREDIT_NOTE);
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    expect(await screen.findByText('CN/2627/000001')).toBeTruthy();
  });
});

describe('retrying a check-in', () => {
  it('keeps the same key after a network failure and takes a new one after a refusal', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockRejectedValueOnce(new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: 'Counts do not add up.' }))
      .mockResolvedValue(RECEIVING_APPLIED_NO_NOTE_YET);
    setup();
    await enterShortDelivery();

    fireEvent.press(screen.getByText('Complete check-in'));
    await waitFor(() => expect(receiveOrder).toHaveBeenCalledTimes(1));
    fireEvent.press(await screen.findByText('Complete check-in'));
    await waitFor(() => expect(receiveOrder).toHaveBeenCalledTimes(2));
    fireEvent.press(await screen.findByText('Complete check-in'));
    await waitFor(() => expect(receiveOrder).toHaveBeenCalledTimes(3));

    const keys = (receiveOrder as jest.Mock).mock.calls.map((call) => call[4]);
    expect(keys[1]).toBe(keys[0]);   // outcome unknown: the same attempt
    expect(keys[2]).not.toBe(keys[1]);   // the server refused it: a new one
  });
});

describe('the rejection-reason chips', () => {
  it('announce their role, which is chosen, and which line they are for', async () => {
    paidBy('PREPAID');
    setup();
    await enterShortDelivery();

    // Only something missing was entered, so the chosen reason is the missing one, not a damaged crate.
    const chip = await screen.findByLabelText('Short Delivery for Chicken');
    expect(chip.props.accessibilityRole).toBe('radio');
    expect(chip.props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('Damaged Crate for Chicken').props.accessibilityState.checked).toBe(false);
  });

  it('default to Damaged Crate when something is damaged, and send what was chosen', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_APPLIED_NO_NOTE_YET);
    setup();
    const received = (await screen.findAllByDisplayValue('9.6'))[0] as ReturnType<typeof screen.getByDisplayValue>;
    fireEvent.changeText(received, '9.5');
    fireEvent.changeText(screen.getAllByDisplayValue('0')[0] as typeof received, '0.1');
    expect((await screen.findByLabelText('Damaged Crate for Chicken')).props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByLabelText('Wrong Grade for Chicken'));
    fireEvent.press(screen.getByText('Complete check-in'));
    await waitFor(() => expect(receiveOrder).toHaveBeenCalled());
    expect((receiveOrder as jest.Mock).mock.calls[0][2][0].rejectionReason).toBe('WRONG_GRADE');
  });
});

describe('the refund sheet', () => {
  it('says Delivery checked in once: the sheet title carries it, the summary does not repeat it', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_APPLIED_NO_NOTE_YET);
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));
    await screen.findByText('Refund of ₹10.50');
    expect(screen.getAllByText(/^Delivery checked in/)).toHaveLength(1);
    expect(screen.getByText('Chicken: 0.1 KG missing')).toBeTruthy();
  });
});

describe('the check-in confirmation step (before rating)', () => {
  it('names only the lines with a problem, with the server\'s own units, never a cross-item total', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue({ ...RECEIVING_APPLIED_NO_NOTE_YET, instantRefundAmount: 0, refundStatus: null });
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    expect(await screen.findByText('Delivery checked in.')).toBeTruthy();
    expect(screen.getByText('Chicken: 0.1 KG missing')).toBeTruthy();
    expect(screen.queryByText(/Received \d/)).toBeNull();
    expect(screen.queryByText(/ of 10/)).toBeNull();
    // It does not skip straight on to rating or a dispute.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('lists damaged quantity too, line by line', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue({
      ...RECEIVING_APPLIED_NO_NOTE_YET, instantRefundAmount: 0, refundStatus: null,
      items: [
        { ...RECEIVING_APPLIED_NO_NOTE_YET.items[0], damagedQuantity: 2, missingQuantity: 0 },
        { ...RECEIVING_APPLIED_NO_NOTE_YET.items[0], id: 802, productName: 'Onion', unit: 'PKT', damagedQuantity: 0, missingQuantity: 0 },
      ],
    });
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    expect(await screen.findByText('Chicken: 2 KG damaged')).toBeTruthy();
    expect(screen.queryByText(/Onion/)).toBeNull();
  });

  it('with a discrepancy, says nothing is open yet and makes Raise a dispute the primary action', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue({ ...RECEIVING_APPLIED_NO_NOTE_YET, instantRefundAmount: 0, refundStatus: null });
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    expect(await screen.findByText('Something was short or damaged. Raise a dispute to get it resolved.')).toBeTruthy();
    expect(screen.queryByText(/a dispute is open/)).toBeNull();
    expect(screen.queryByText('View dispute')).toBeNull();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel ?? '').filter((l: string) => /dispute|Rate|Done/.test(l));
    expect(labels[0]).toMatch(/Raise a dispute/);
    fireEvent.press(screen.getByText('Raise a dispute'));
    expect(mockReplace).toHaveBeenCalledWith('/restaurant/dispute/501');
  });

  it('Rate this order still goes to rating after a discrepancy', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue({ ...RECEIVING_APPLIED_NO_NOTE_YET, instantRefundAmount: 0, refundStatus: null });
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));
    fireEvent.press(await screen.findByText('Rate this order'));
    expect(mockReplace).toHaveBeenCalledWith('/restaurant/rating/501');
  });

  it('Done goes to the order, and a full delivery says all received as billed with no figures or dispute', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_IN_FULL);
    setup();
    fireEvent.press(await screen.findByText('Complete check-in'));

    expect(await screen.findByText('All items received as billed')).toBeTruthy();
    expect(screen.queryByText(/missing|damaged|Raise a dispute|\d of \d/)).toBeNull();
    fireEvent.press(screen.getByText('Done'));
    expect(mockReplace).toHaveBeenCalledWith('/restaurant/orders/501');
  });

  it('the refund sheet also offers the dispute link when something was short', async () => {
    paidBy('PREPAID');
    (receiveOrder as jest.Mock).mockResolvedValue(RECEIVING_APPLIED_NO_NOTE_YET);
    setup();
    await enterShortDelivery();
    fireEvent.press(screen.getByText('Complete check-in'));

    await screen.findByText('Refund of ₹10.50');
    fireEvent.press(screen.getByText('Raise a dispute'));
    expect(mockReplace).toHaveBeenCalledWith('/restaurant/dispute/501');
  });
});
