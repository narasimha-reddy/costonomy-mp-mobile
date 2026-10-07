import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { RecordPaymentSheet, type RecordTarget } from '@/components/credit/RecordPaymentSheet';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { hasAttempt } from '@/lib/credit/attemptKeys';
import { previewPayment, recordSupplierPayment } from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1 } }),
}));
// 2026-10-06 11:30 India time.
jest.mock('@/lib/server-clock', () => ({ serverNow: () => Date.parse('2026-10-06T06:00:00Z') }));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  previewPayment: jest.fn(),
  recordSupplierPayment: jest.fn(),
}));

const previewM = previewPayment as jest.Mock;
const recordM = recordSupplierPayment as jest.Mock;

const apiError = (code: string, status: number, message = `server says ${code}`, details?: Record<string, unknown>) =>
  new ApiError({ code, message, status, details });
const deferred = <T,>() => {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const PREVIEW = {
  amount: '2500.0000',
  allocations: [
    { invoiceId: 1, invoiceNumber: 'INV-1', amount: '1000.0000', statusAfter: 'PAID' },
    { invoiceId: 2, invoiceNumber: 'INV-2', amount: '1500.0000', statusAfter: 'PARTIALLY_PAID' },
  ],
  agreement: { due: '7777.0000', overdue: '123.0000', available: '1.0000', status: 'ACTIVE' },
  pendingClaims: [] as { invoiceId: number; invoiceNumber: string; amount: string }[],
};
const RECEIPT = {
  receiptId: 9, amount: '2500.0000', method: 'UPI', reference: 'UTR12345', paidOn: '2026-10-06',
  allocations: PREVIEW.allocations,
  agreement: { due: '4242.0000', overdue: '0.0000', available: '5.0000', status: 'ACTIVE' },
};

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

const onClose = jest.fn();
const onReviewClaim = jest.fn();
function renderSheet(props: Partial<React.ComponentProps<typeof RecordPaymentSheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const ui = (p: Partial<React.ComponentProps<typeof RecordPaymentSheet>>) => (
    <QueryClientProvider client={client}>
      <RecordPaymentSheet
        visible
        onClose={onClose}
        agreementId={3}
        due="12000.0000"
        overdue="4000.0000"
        targets={[]}
        offline={false}
        onReviewClaim={onReviewClaim}
        {...p}
      />
    </QueryClientProvider>
  );
  const view = render(ui(props));
  return { invalidate, rerender: (p: Partial<React.ComponentProps<typeof RecordPaymentSheet>>) => view.rerender(ui({ ...props, ...p })) };
}
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;
const value = (id: string) => screen.getByTestId(id).props.value;
const target = (id: number, outstanding = '6000.0000'): RecordTarget => ({ id, invoiceNumber: `INV-${id}`, outstanding });
const settle = (ms = 500) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  jest.clearAllMocks();
  previewM.mockResolvedValue(PREVIEW);
  recordM.mockResolvedValue(RECEIPT);
});

describe('amount: what it starts as and the chips', () => {
  it('starts at the line total the server sent, with Full and Overdue only chips from the server figures', () => {
    renderSheet();
    expect(value('record-amount')).toBe('12000');
    expect(screen.getByTestId('record-chip-full')).toHaveTextContent('Full ₹12,000.00');
    expect(screen.getByTestId('record-chip-overdue')).toHaveTextContent('Overdue only ₹4,000.00');
    press('record-chip-overdue');
    expect(value('record-amount')).toBe('4000');
    press('record-chip-full');
    expect(value('record-amount')).toBe('12000');
    press('record-chip-other');
    expect(value('record-amount')).toBe('');
  });

  it('has no Overdue only chip when nothing is overdue', () => {
    renderSheet({ overdue: '0.0000' });
    expect(screen.queryByTestId('record-chip-overdue')).toBeNull();
  });

  it('one chosen invoice starts at what that invoice owes and has no Overdue only chip', () => {
    renderSheet({ targets: [target(7, '6000.5000')] });
    expect(value('record-amount')).toBe('6000.5');
    expect(screen.getByTestId('record-chip-full')).toHaveTextContent('Full ₹6,000.50');
    expect(screen.queryByTestId('record-chip-overdue')).toBeNull();
  });

  it('several chosen invoices have no server total, so nothing is added up: the amount starts empty and each invoice is listed', () => {
    renderSheet({ targets: [target(7, '6000.0000'), target(8, '2500.0000')] });
    expect(value('record-amount')).toBe('');
    expect(screen.queryByTestId('record-chip-full')).toBeNull();
    expect(screen.getByText(/INV-7 owes ₹6,000.00 · INV-8 owes ₹2,500.00/)).toBeTruthy();
  });
});

describe('amount parsing', () => {
  it('cleans a paste of "₹ 2,500.50"', () => {
    renderSheet();
    type('record-amount', '₹ 2,500.50');
    expect(value('record-amount')).toBe('2500.50');
    expect(screen.getByTestId('record-submit')).toHaveTextContent('Record ₹2,500.50 received');
  });

  it('refuses three decimals with a plain message and a disabled button', () => {
    renderSheet();
    type('record-amount', '2500.505');
    expect(screen.getByText('Use at most 2 decimal places.')).toBeTruthy();
    expect(disabled('record-submit')).toBe(true);
  });

  it('refuses zero and strips a minus sign', () => {
    renderSheet();
    type('record-amount', '0');
    expect(screen.getByText('Enter an amount more than zero.')).toBeTruthy();
    expect(disabled('record-submit')).toBe(true);
    type('record-amount', '-50');
    expect(value('record-amount')).toBe('50');
  });

  it('sends a huge amount as the exact string typed (99,99,99,999.99 has 9 digits)', async () => {
    renderSheet();
    type('record-amount', '99,99,99,999.99');
    type('record-reference', 'UTR12345');
    press('record-method-UPI');
    press('record-submit');
    await waitFor(() => expect(recordM).toHaveBeenCalledTimes(1));
    expect(recordM.mock.calls[0][2].amount).toBe('999999999.99');
    expect(typeof recordM.mock.calls[0][2].amount).toBe('string');
  });
});

describe('reference rule by method', () => {
  beforeEach(() => { renderSheet(); });
  it.each(['UPI', 'BANK_TRANSFER', 'CHEQUE'])('%s: required marker, empty and short refused, 4 characters accepted', (method) => {
    press(`record-method-${method}`);
    expect(screen.getByTestId('record-reference-field')).toHaveTextContent(/\*/);
    expect(disabled('record-submit')).toBe(true);
    type('record-reference', 'abc');
    expect(screen.getByText('The reference must be 4 to 64 characters.')).toBeTruthy();
    expect(disabled('record-submit')).toBe(true);
    type('record-reference', 'a'.repeat(65));
    expect(disabled('record-submit')).toBe(true);
    type('record-reference', 'abcd');
    expect(disabled('record-submit')).toBe(false);
  });
  it.each(['CASH', 'CARD'])('%s: optional, but 4 to 64 when given', (method) => {
    press(`record-method-${method}`);
    expect(screen.getByTestId('record-reference-field')).not.toHaveTextContent(/\*/);
    expect(screen.getByTestId('record-reference-field')).toHaveTextContent(/Reference \(optional\)/);
    expect(disabled('record-submit')).toBe(false);
    type('record-reference', 'ab');
    expect(disabled('record-submit')).toBe(true);
    type('record-reference', 'abcd');
    expect(disabled('record-submit')).toBe(false);
  });
  it('labels the reference by method', () => {
    press('record-method-UPI');
    expect(screen.getByTestId('record-reference-field')).toHaveTextContent(/UPI reference/);
    press('record-method-BANK_TRANSFER');
    expect(screen.getByTestId('record-reference-field')).toHaveTextContent(/Bank reference \(UTR\)/);
    press('record-method-CHEQUE');
    expect(screen.getByTestId('record-reference-field')).toHaveTextContent(/Cheque number/);
  });
});

describe('date received', () => {
  it('starts at today by the server clock, steps back, never forward past today', async () => {
    renderSheet();
    expect(screen.getByTestId('record-date-text')).toHaveTextContent('6th Oct 2026');
    expect(disabled('record-date-next')).toBe(true);
    press('record-date-yesterday');
    expect(screen.getByTestId('record-date-text')).toHaveTextContent('5th Oct 2026');
    press('record-date-prev');
    expect(screen.getByTestId('record-date-text')).toHaveTextContent('4th Oct 2026');
    press('record-date-today');
    expect(screen.getByTestId('record-date-text')).toHaveTextContent('6th Oct 2026');
    press('record-date-yesterday');
    press('record-submit');
    await waitFor(() => expect(recordM).toHaveBeenCalled());
    expect(recordM.mock.calls[0][2].paidOn).toBe('2026-10-05');
  });
});

describe('the preview', () => {
  it('waits for a pause in typing, then asks once with the final amount (no invoiceIds when none chosen)', async () => {
    renderSheet({ due: null, overdue: null });
    type('record-amount', '1');
    type('record-amount', '12');
    type('record-amount', '125');
    await settle(100);
    expect(previewM).not.toHaveBeenCalled();
    await waitFor(() => expect(previewM).toHaveBeenCalledTimes(1));
    expect(previewM).toHaveBeenCalledWith('tok', 3, { amount: '125.00' });
  });

  it('sends the chosen invoice ids', async () => {
    renderSheet({ targets: [target(7), target(8)] });
    type('record-amount', '2500');
    await waitFor(() => expect(previewM).toHaveBeenCalledTimes(1));
    expect(previewM).toHaveBeenCalledWith('tok', 3, { amount: '2500.00', invoiceIds: [7, 8] });
  });

  it('shows exactly what the server said: the position is its figure, not a subtraction', async () => {
    renderSheet();
    type('record-amount', '2500');
    expect(await screen.findByTestId('record-preview-after')).toHaveTextContent(
      'After this they owe ₹7,777.00, of which ₹123.00 is overdue.');
    expect(screen.getByTestId('record-preview-line-0')).toHaveTextContent('Settles INV-1 fully (₹1,000.00)');
    expect(screen.getByTestId('record-preview-line-1')).toHaveTextContent(
      'Part payment on INV-2: ₹1,500.00. It will still owe the rest.');
    expect(screen.queryByText(/9,500/)).toBeNull();
  });

  it('warns about a claim the restaurant already made and offers to review it, leaving the form untouched', async () => {
    previewM.mockResolvedValue({ ...PREVIEW, pendingClaims: [{ invoiceId: 1, invoiceNumber: 'INV-1', amount: '1000.0000' }] });
    renderSheet({ reviewableInvoiceIds: [1] });
    type('record-amount', '2500');
    expect(await screen.findByTestId('record-pending-claim-1')).toHaveTextContent(
      /^Your restaurant already told you they paid ₹1,000\.00 on INV-1\. Confirm that claim instead\?/);
    press('record-review-claim-1');
    expect(onReviewClaim).toHaveBeenCalledWith(1);
    expect(recordM).not.toHaveBeenCalled();
    expect(value('record-amount')).toBe('2500');
  });

  it('shows the warning without a button when the claim is not one the screen can open', async () => {
    previewM.mockResolvedValue({ ...PREVIEW, pendingClaims: [{ invoiceId: 1, invoiceNumber: 'INV-1', amount: '1000.0000' }] });
    renderSheet();
    type('record-amount', '2500');
    await screen.findByTestId('record-pending-claim-1');
    expect(screen.queryByTestId('record-review-claim-1')).toBeNull();
  });

  it('shows the server message when the amount is more than is owed, and blocks recording', async () => {
    previewM.mockRejectedValue(apiError('CREDIT_OVERPAYMENT', 422, 'That is more than the ₹12,000.00 they owe.', { outstanding: '12000.00' }));
    renderSheet();
    type('record-amount', '99999');
    expect(await screen.findByText('That is more than the ₹12,000.00 they owe.')).toBeTruthy();
    expect(disabled('record-submit')).toBe(true);
  });

  it('does not block recording when the preview cannot be reached', async () => {
    previewM.mockRejectedValue(new NetworkError());
    renderSheet();
    type('record-amount', '2500');
    expect(await screen.findByText("Couldn't preview this. You can still record it.")).toBeTruthy();
    expect(disabled('record-submit')).toBe(false);
  });

  it('asks again after a claim was reviewed (previewNonce)', async () => {
    const { rerender } = renderSheet();
    type('record-amount', '2500');
    await waitFor(() => expect(previewM).toHaveBeenCalledTimes(1));
    rerender({ previewNonce: 1 });
    await waitFor(() => expect(previewM).toHaveBeenCalledTimes(2));
  });

  it('does not ask while offline', async () => {
    renderSheet({ offline: true });
    type('record-amount', '2500');
    await settle(600);
    expect(previewM).not.toHaveBeenCalled();
    expect(disabled('record-submit')).toBe(true);
    expect(screen.getByText('You are offline. Connect to record this.')).toBeTruthy();
  });
});

async function fillValid() {
  press('record-method-UPI');
  type('record-reference', 'UTR12345');
  type('record-amount', '2500');
}

describe('recording', () => {
  it('sends the amount as a string with the method, reference, day, note, an idempotency key, and shows the server position', async () => {
    const { invalidate } = renderSheet();
    await fillValid();
    type('record-note', ' paid at the counter ');
    expect(screen.getByTestId('record-submit')).toHaveTextContent('Record ₹2,500.00 received');
    press('record-submit');
    await waitFor(() => expect(recordM).toHaveBeenCalledTimes(1));
    const [token, agreementId, body, key] = recordM.mock.calls[0];
    expect([token, agreementId]).toEqual(['tok', 3]);
    expect(body).toEqual({ amount: '2500.00', method: 'UPI', reference: 'UTR12345', paidOn: '2026-10-06', note: 'paid at the counter' });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(8);

    expect(await screen.findByTestId('record-success')).toBeTruthy();
    expect(screen.getByTestId('record-success-after')).toHaveTextContent('They now owe ₹4,242.00.');
    expect(screen.getByText('₹2,500.00 recorded')).toBeTruthy();

    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    for (const k of [
      ['store', 5, 'credit'], ['store', 5, 'credit-claims'], ['store', 5, 'credit-payments'],
      ['store', 5, 'credit-agreements'], ['credit-agreement', 3], ['credit-invoice'],
    ]) expect(keys).toContain(JSON.stringify(k));
    press('record-done');
    expect(onClose).toHaveBeenCalled();
  });

  it('a second tap while the first is on its way sends once', async () => {
    const d = deferred<typeof RECEIPT>();
    recordM.mockReturnValue(d.promise);
    renderSheet();
    await fillValid();
    press('record-submit');
    press('record-submit');
    press('record-submit');
    expect(recordM).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(RECEIPT); });
    expect(recordM).toHaveBeenCalledTimes(1);
  });

  it('keeps the key after a dropped connection and reuses it on the retry', async () => {
    recordM.mockRejectedValueOnce(new NetworkError());
    renderSheet();
    await fillValid();
    press('record-submit');
    expect(await screen.findByText("Couldn't reach the server. Please try again.")).toBeTruthy();
    press('record-submit');
    await waitFor(() => expect(recordM).toHaveBeenCalledTimes(2));
    expect(recordM.mock.calls[1][3]).toBe(recordM.mock.calls[0][3]);
  });

  it('after IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED the next try gets a fresh key', async () => {
    recordM.mockRejectedValueOnce(apiError('IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED', 409));
    renderSheet();
    await fillValid();
    press('record-submit');
    expect(await screen.findByText("That didn't go through. Please try again.")).toBeTruthy();
    press('record-submit');
    await waitFor(() => expect(recordM).toHaveBeenCalledTimes(2));
    expect(recordM.mock.calls[1][3]).not.toBe(recordM.mock.calls[0][3]);
  });

  it('a refusal ends the attempt (a later try starts a new key) and shows the server message', async () => {
    recordM.mockRejectedValueOnce(apiError('VALIDATION_ERROR', 400, 'That is before the invoice was issued.'));
    renderSheet();
    await fillValid();
    press('record-submit');
    expect(await screen.findByText('That is before the invoice was issued.')).toBeTruthy();
    expect(hasAttempt(['supplier-record', 5, 3, '2500.00', 'UPI', 'UTR12345', '2026-10-06', '', ''].join('|'))).toBe(false);
  });

  it('says plainly when the line or an invoice is no longer there, and refreshes', async () => {
    recordM.mockRejectedValueOnce(apiError('NOT_FOUND', 404, 'Not found'));
    const { invalidate } = renderSheet();
    await fillValid();
    press('record-submit');
    expect(await screen.findByText(/no longer available/)).toBeTruthy();
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('says an earlier try may have gone through on IDEMPOTENCY_KEY_REUSE', async () => {
    recordM.mockRejectedValueOnce(apiError('IDEMPOTENCY_KEY_REUSE', 409));
    renderSheet();
    await fillValid();
    press('record-submit');
    expect(await screen.findByText(/may have gone through/)).toBeTruthy();
  });

  it('is off while offline and says why', async () => {
    renderSheet({ offline: true });
    await fillValid();
    expect(disabled('record-submit')).toBe(true);
    press('record-submit');
    expect(recordM).not.toHaveBeenCalled();
  });

  describe('a reference recorded before', () => {
    const dup = () => apiError('CREDIT_DUPLICATE_REFERENCE', 409, 'That reference was already recorded on 2026-10-01 for ₹2,500.00.',
      { paidOn: '2026-10-01', amount: '2500.00', paymentId: 4 });

    it('asks first, then resends the same body with the flag and the SAME key', async () => {
      recordM.mockRejectedValueOnce(dup());
      renderSheet();
      await fillValid();
      press('record-submit');
      const panel = await screen.findByTestId('record-duplicate');
      expect(panel).toHaveTextContent(/That reference was already recorded on 2026-10-01 for ₹2,500\.00\./);
      expect(screen.queryByTestId('record-submit')).toBeNull();
      press('record-anyway');
      await waitFor(() => expect(recordM).toHaveBeenCalledTimes(2));
      const [first, second] = recordM.mock.calls;
      expect(second[3]).toBe(first[3]);
      expect(first[2].allowDuplicateReference).toBeUndefined();
      expect(second[2]).toEqual({ ...first[2], allowDuplicateReference: true });
      expect(await screen.findByTestId('record-success')).toBeTruthy();
    });

    it('going back keeps the form so the reference can be fixed', async () => {
      recordM.mockRejectedValueOnce(dup());
      renderSheet();
      await fillValid();
      press('record-submit');
      await screen.findByTestId('record-duplicate');
      press('record-duplicate-back');
      expect(screen.queryByTestId('record-duplicate')).toBeNull();
      expect(value('record-reference')).toBe('UTR12345');
      expect(screen.getByTestId('record-submit')).toBeTruthy();
    });
  });
});

describe('accessibility and layout', () => {
  it('methods and amount chips are a radio group with names and selected state', () => {
    renderSheet();
    const upi = screen.getByLabelText('UPI');
    expect(upi.props.accessibilityRole).toBe('radio');
    expect(screen.getByLabelText('Cash').props.accessibilityState).toMatchObject({ selected: true });
    expect(upi.props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByLabelText('Full ₹12,000.00').props.accessibilityRole).toBe('radio');
    expect(screen.getByLabelText('Previous day').props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Next day').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('every method has an icon and a word', () => {
    renderSheet();
    for (const label of ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Card']) {
      expect(screen.getByLabelText(label)).toHaveTextContent(/icon:/);
      expect(screen.getByLabelText(label)).toHaveTextContent(new RegExp(`${label}$`));
    }
  });

  it('chips wrap and grow with the text (no fixed height) and every target is at least 48 dp, at 1.3x text too', () => {
    renderSheet({ overdue: '4000.0000' });
    for (const id of ['record-method-UPI', 'record-chip-full', 'record-chip-other', 'record-date-today', 'record-date-yesterday']) {
      const style = StyleSheet.flatten(screen.getByTestId(id).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.height).toBeUndefined();
    }
    for (const id of ['record-date-prev', 'record-date-next']) {
      const style = StyleSheet.flatten(screen.getByTestId(id).props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    }
    let row = screen.getByTestId('record-method-UPI').parent;
    while (row != null && StyleSheet.flatten(row.props.style)?.flexWrap == null) row = row.parent;
    expect(StyleSheet.flatten(row!.props.style).flexWrap).toBe('wrap');
    expect(screen.getByTestId('record-sheet-keyboard-avoiding')).toBeTruthy();
  });
});
