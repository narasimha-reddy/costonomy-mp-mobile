import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UndoPaymentSheet } from '@/components/credit/UndoPaymentSheet';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { reversePayment, reverseReceipt } from '@/services/credit';
import type { StorePayment } from '@/models/credit';

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 5 }) }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  reverseReceipt: jest.fn(),
  reversePayment: jest.fn(),
}));
const receiptM = reverseReceipt as jest.Mock;
const paymentM = reversePayment as jest.Mock;

const payment = (over: Partial<StorePayment> = {}): StorePayment => ({
  id: 31, paidAt: '2026-10-02T06:00:00Z', paidOn: '2026-10-02', agreementId: 3, outletId: 7, outletName: 'X',
  restaurantName: 'Spice Co', invoiceId: 51, invoiceNumber: 'INV-51', amount: '1500.0000',
  source: 'SUPPLIER_RECORDED', method: 'UPI', reference: 'UTR1', receiptId: 9, reversible: true,
  reversibleUntil: '2026-10-12', reversedAt: null, ...over,
});
const RESULT = { receiptId: 9, paymentId: null, amount: '1500.0000', reason: 'x', reversedAt: '2026-10-06T10:00:00Z', allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' } };
const err = (code: string, status: number, details?: Record<string, unknown>, message = 'server words') =>
  new ApiError({ code, status, message, details });

const onClose = jest.fn();
const onDone = jest.fn();
function renderSheet(p: StorePayment = payment(), offline = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UndoPaymentSheet visible onClose={onClose} payment={p} offline={offline} onDone={onDone} />
    </QueryClientProvider>,
  );
}
const confirm = () => screen.getByTestId('undo-sheet-confirm');
const typeReason = (t: string) => fireEvent.changeText(screen.getByTestId('undo-sheet-reason'), t);

afterEach(cleanup);
beforeEach(() => { jest.clearAllMocks(); receiptM.mockResolvedValue(RESULT); paymentM.mockResolvedValue(RESULT); });

describe('UndoPaymentSheet', () => {
  it('explains in plain words and names the amount on the button', () => {
    renderSheet();
    expect(screen.getByText('The restaurant will owe this again and will be told it was cancelled.')).toBeTruthy();
    expect(screen.getByText('Undo ₹1,500.00 payment')).toBeTruthy();
  });

  it('needs a reason of at least 3 characters before it can send', () => {
    renderSheet();
    expect(confirm().props.accessibilityState?.disabled).toBe(true);
    typeReason('ab');
    expect(confirm().props.accessibilityState?.disabled).toBe(true);
    typeReason('abc');
    expect(confirm().props.accessibilityState?.disabled).toBeFalsy();
    typeReason('   ');
    expect(confirm().props.accessibilityState?.disabled).toBe(true);
  });

  it('a quick choice fills the reason; Other empties it for typing', () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('undo-reason-Wrong restaurant'));
    expect(screen.getByTestId('undo-sheet-reason').props.value).toBe('Wrong restaurant');
    fireEvent.press(screen.getByTestId('undo-reason-Other'));
    expect(screen.getByTestId('undo-sheet-reason').props.value).toBe('');
    expect(screen.getByTestId('undo-reason-Other').props.accessibilityState.checked).toBe(true);
  });

  it('sends the receipt endpoint with the trimmed reason and reports the result', async () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('undo-reason-Cheque bounced'));
    await act(async () => { fireEvent.press(confirm()); });
    expect(receiptM).toHaveBeenCalledWith('tok', 9, 'Cheque bounced', expect.any(String));
    expect(paymentM).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(RESULT, expect.objectContaining({ id: 31 }));
  });

  it('uses the payment endpoint when there is no receipt (and omits the receipt note)', async () => {
    renderSheet(payment({ receiptId: null }));
    expect(screen.queryByText(/recorded together/i)).toBeNull();
    typeReason('Typed the wrong amount');
    await act(async () => { fireEvent.press(confirm()); });
    expect(paymentM).toHaveBeenCalledWith('tok', 31, 'Typed the wrong amount', expect.any(String));
    expect(receiptM).not.toHaveBeenCalled();
  });

  it('warns that other invoices in the same receipt come back too', () => {
    renderSheet();
    expect(screen.getByText(/recorded together with other invoices, they are all undone too/i)).toBeTruthy();
  });

  it('a double tap reaches the server once', async () => {
    let finish!: (v: unknown) => void;
    receiptM.mockReturnValue(new Promise((res) => { finish = res; }));
    renderSheet();
    typeReason('Wrong restaurant');
    await act(async () => { fireEvent.press(confirm()); fireEvent.press(confirm()); });
    expect(receiptM).toHaveBeenCalledTimes(1);
    await act(async () => { finish(RESULT); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['CREDIT_REVERSAL_NO_HEADROOM', 422, { needed: 5000, available: 3000, shortBy: 2000 }, 'Raise their limit by ₹2,000.00 first, or suspend the line.'],
    ['CREDIT_REVERSAL_WINDOW_CLOSED', 409, { closedOn: '2026-10-13', reversibleUntil: '2026-10-12' }, 'It is too late to undo this payment. It could be undone until 12th Oct.'],
    ['CREDIT_ALREADY_REVERSED', 409, undefined, 'This payment was already cancelled.'],
  ])('shows %s in plain words, keeps the sheet open and does not report done', async (code, status, details, words) => {
    receiptM.mockRejectedValue(err(code, status as number, details as Record<string, unknown> | undefined));
    renderSheet();
    typeReason('Wrong restaurant');
    await act(async () => { fireEvent.press(confirm()); });
    expect(screen.getByTestId('undo-sheet-error').props.children).toBe(words);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('after a refusal, trying again sends a new key; after a dropped connection, the same one', async () => {
    receiptM.mockRejectedValueOnce(err('CREDIT_REVERSAL_NO_HEADROOM', 422, { shortBy: 10 }))
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue(RESULT);
    renderSheet();
    typeReason('Wrong restaurant');
    await act(async () => { fireEvent.press(confirm()); });
    await act(async () => { fireEvent.press(confirm()); });
    await act(async () => { fireEvent.press(confirm()); });
    const keys = receiptM.mock.calls.map((c) => c[3]);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).toBe(keys[1]);
  });

  it('is off while offline, with a word on it', () => {
    renderSheet(payment(), true);
    typeReason('Wrong restaurant');
    expect(confirm().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it('renders nothing for no payment', () => {
    const { toJSON } = render(
      <QueryClientProvider client={new QueryClient()}>
        <UndoPaymentSheet visible onClose={onClose} payment={null} offline={false} onDone={onDone} />
      </QueryClientProvider>,
    );
    expect(toJSON()).toBeNull();
    void waitFor;
  });
});
