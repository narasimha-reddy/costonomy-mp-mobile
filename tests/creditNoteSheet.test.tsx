import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreditNoteSheet } from '@/components/credit/CreditNoteSheet';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { resetAttemptKeys } from '@/lib/credit/attemptKeys';
import { issueCreditNote } from '@/services/credit';

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
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ storeId: 5 }) }));
jest.mock('@/services/credit', () => ({ ...jest.requireActual('@/services/credit'), issueCreditNote: jest.fn() }));

const issueM = issueCreditNote as jest.Mock;
const apiError = (code: string, status: number, details?: Record<string, unknown>, message = `server says ${code}`) =>
  new ApiError({ code, status, message, details });
const issued = {
  id: 1, creditNoteNumber: 'CN-261006-000001', invoiceId: 11, invoiceNumber: 'INV-11', agreementId: 3,
  amount: '2100.0000', reasonCode: 'PRICE', kind: 'MANUAL', note: null, disputeId: null, createdBy: 9,
  createdAt: '2026-10-06T10:00:00Z',
  invoice: { status: 'PARTIALLY_PAID', amount: '7000.0000', paidAmount: '0.0000', creditedAmount: '2100.0000', outstanding: '4900.0000' },
  agreement: { due: '4900.0000', overdue: '0.0000', available: '5100.0000', status: 'ACTIVE' },
};
const invoice = { id: 11, agreementId: 3, invoiceNumber: 'INV-11', outstanding: '7000.0000' };

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); resetAttemptKeys(); });
beforeEach(() => { jest.clearAllMocks(); issueM.mockResolvedValue(issued); });

function renderSheet(over: { offline?: boolean; inv?: typeof invoice } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const onClose = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <CreditNoteSheet visible onClose={onClose} invoice={over.inv ?? invoice} offline={over.offline ?? false} />
    </QueryClientProvider>,
  );
  return { invalidate, onClose };
}
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;
const submit = async () => { await act(async () => { press('cn-submit'); }); };

describe('credit note sheet', () => {
  it('starts with the server outstanding as the amount and needs a reason first', () => {
    renderSheet();
    expect(screen.getByTestId('cn-amount').props.value).toBe('7000');
    expect(disabled('cn-submit')).toBe(true);
    press('cn-reason-QUALITY');
    expect(disabled('cn-submit')).toBe(false);
  });

  it('offers the six reasons in plain words', () => {
    renderSheet();
    for (const label of ['Short supply', 'Quality problem', 'Price difference', 'Cancelled order', 'Goodwill', 'Other']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('sends the amount as a 2-decimal string, the reason code and the note', async () => {
    renderSheet();
    type('cn-amount', '2100');
    press('cn-reason-PRICE');
    type('cn-note', ' rate was lower ');
    await submit();
    expect(issueM).toHaveBeenCalledTimes(1);
    expect(issueM).toHaveBeenCalledWith('tok', 11, { amount: '2100.00', reasonCode: 'PRICE', note: 'rate was lower' }, expect.any(String));
  });

  it('cleans pasted amounts and refuses more than 2 decimals or zero', () => {
    renderSheet();
    press('cn-reason-OTHER');
    type('cn-amount', '₹ 2,100.5');
    expect(screen.getByTestId('cn-amount').props.value).toBe('2100.5');
    expect(disabled('cn-submit')).toBe(false);
    type('cn-amount', '10.123');
    expect(disabled('cn-submit')).toBe(true);
    expect(screen.getByText(/at most 2 decimal places/i)).toBeTruthy();
    type('cn-amount', '0');
    expect(disabled('cn-submit')).toBe(true);
    type('cn-amount', '');
    expect(disabled('cn-submit')).toBe(true);
  });

  it('is disabled while offline', () => {
    renderSheet({ offline: true });
    press('cn-reason-OTHER');
    expect(disabled('cn-submit')).toBe(true);
  });

  it('shows the note, the invoice and what is still owed from the server answer', async () => {
    const { invalidate } = renderSheet();
    press('cn-reason-PRICE');
    await submit();
    expect(await screen.findByTestId('cn-done')).toBeTruthy();
    expect(screen.getByText(/CN-261006-000001/)).toBeTruthy();
    expect(screen.getByText(/₹4,900\.00/)).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-invoice'] });
  });

  it('a double tap reaches the server once', async () => {
    let resolve!: (v: unknown) => void;
    issueM.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderSheet();
    press('cn-reason-PRICE');
    await act(async () => { press('cn-submit'); press('cn-submit'); });
    expect(issueM).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(issued); });
  });

  it('words EXCEEDS_OUTSTANDING with the server figure and then needs a FRESH key for the next try', async () => {
    issueM.mockRejectedValueOnce(apiError('CREDIT_NOTE_EXCEEDS_OUTSTANDING', 422, { outstanding: '4900.0000' }));
    renderSheet();
    press('cn-reason-PRICE');
    await submit();
    expect(await screen.findByTestId('cn-error')).toHaveTextContent(/₹4,900\.00/);
    const firstKey = issueM.mock.calls[0][3];
    type('cn-amount', '4900');
    await submit();
    const secondKey = issueM.mock.calls[1][3];
    expect(secondKey).not.toBe(firstKey);
  });

  it('uses a new key even for an identical retry after a refusal', async () => {
    issueM.mockRejectedValueOnce(apiError('VALIDATION_ERROR', 400, undefined, 'Use at most two decimal places'));
    renderSheet();
    press('cn-reason-PRICE');
    await submit();
    await screen.findByTestId('cn-error');
    await submit();
    expect(issueM.mock.calls[1][3]).not.toBe(issueM.mock.calls[0][3]);
  });

  it('keeps the SAME key when the connection dropped (the first try may have worked)', async () => {
    issueM.mockRejectedValueOnce(new NetworkError());
    renderSheet();
    press('cn-reason-PRICE');
    await submit();
    await screen.findByTestId('cn-error');
    await submit();
    expect(issueM).toHaveBeenCalledTimes(2);
    expect(issueM.mock.calls[1][3]).toBe(issueM.mock.calls[0][3]);
  });

  it('keeps the same key after a 5xx too', async () => {
    issueM.mockRejectedValueOnce(apiError('INTERNAL', 500));
    renderSheet();
    press('cn-reason-PRICE');
    await submit();
    await screen.findByTestId('cn-error');
    await submit();
    expect(issueM.mock.calls[1][3]).toBe(issueM.mock.calls[0][3]);
  });

  it('says the invoice is settled and to refund directly', async () => {
    issueM.mockRejectedValueOnce(apiError('CREDIT_NOTE_INVOICE_SETTLED', 409));
    renderSheet();
    press('cn-reason-PRICE');
    await submit();
    expect(await screen.findByTestId('cn-error')).toHaveTextContent(/already settled/i);
    await waitFor(() => expect(screen.getByTestId('cn-error')).toHaveTextContent(/refund the restaurant directly/i));
  });

  it('copes with a huge amount and a long invoice number without crashing', () => {
    renderSheet({ inv: { ...invoice, invoiceNumber: 'INV-'.padEnd(80, 'X'), outstanding: '99999999999.9900' } });
    expect(screen.getByTestId('cn-amount').props.value).toBe('99999999999.99');
  });
});
