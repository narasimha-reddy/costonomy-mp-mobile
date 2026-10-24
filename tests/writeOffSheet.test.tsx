import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WriteOffSheet } from '@/components/credit/WriteOffSheet';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { resetAttemptKeys } from '@/lib/credit/attemptKeys';
import { writeOffInvoice, writeOffLine } from '@/services/credit';

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
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'), writeOffInvoice: jest.fn(), writeOffLine: jest.fn(),
}));

const invoiceM = writeOffInvoice as jest.Mock;
const lineM = writeOffLine as jest.Mock;
const apiError = (code: string, status: number, details?: Record<string, unknown>) =>
  new ApiError({ code, status, message: `server says ${code}`, details });
const agreement = { due: '0.0000', overdue: '0.0000', available: '9.0000', status: 'SUSPENDED' };
const answer = (over: Record<string, unknown> = {}) => ({
  writtenOff: '12000.0000',
  items: [{ invoiceId: 11, invoiceNumber: 'INV-11', creditNoteId: 1, creditNoteNumber: 'CN-1', amount: '12000.0000', invoiceStatus: 'WRITTEN_OFF', outstanding: '0.0000' }],
  lineStatus: 'SUSPENDED', lineSuspended: true, agreement, ...over,
});
const invoiceTarget = { kind: 'invoice' as const, id: 11, agreementId: 3, title: 'INV-11', outstanding: '12000.0000' };
const lineTarget = { kind: 'line' as const, id: 3, agreementId: 3, title: 'Spice Co', outstanding: '30000.0000' };

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); resetAttemptKeys(); });
beforeEach(() => { jest.clearAllMocks(); invoiceM.mockResolvedValue(answer()); lineM.mockResolvedValue(answer()); });

function renderSheet(target: { kind: 'invoice' | 'line'; id: number; agreementId: number; title: string; outstanding: string } = invoiceTarget, offline = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <WriteOffSheet visible onClose={jest.fn()} target={target} offline={offline} />
    </QueryClientProvider>,
  );
  return { invalidate };
}
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;
const confirmYes = async () => { await act(async () => { press('wo-confirm'); }); };

describe('write-off sheet', () => {
  it('needs a reason of 3 characters before it can be reviewed, and shows the server outstanding as the amount', () => {
    renderSheet();
    expect(screen.getByTestId('wo-amount').props.value).toBe('12000');
    expect(disabled('wo-review')).toBe(true);
    type('wo-reason', 'ab');
    expect(disabled('wo-review')).toBe(true);
    type('wo-reason', 'Closed down');
    expect(disabled('wo-review')).toBe(false);
  });

  it('offers the four quick reasons, which fill the reason', () => {
    renderSheet();
    for (const label of ['Restaurant closed', 'Unrecoverable', 'Settled outside', 'Goodwill']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    press('wo-quick-RESTAURANT_CLOSED');
    expect(screen.getByTestId('wo-reason').props.value).toBe('Restaurant closed');
  });

  it('asks again with a second button before anything is sent', async () => {
    renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    expect(invoiceM).not.toHaveBeenCalled();
    expect(screen.getByTestId('wo-consequence')).toHaveTextContent(
      '₹12,000.00 will no longer be owed. This cannot be undone in the app. Their credit line will be paused.');
    expect(screen.getByText('Yes, write off')).toBeTruthy();
  });

  it('goes back from the confirmation without sending', () => {
    renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    press('wo-back');
    expect(screen.getByTestId('wo-reason')).toBeTruthy();
    expect(invoiceM).not.toHaveBeenCalled();
  });

  it('sends no amount when it was left as shown, and no keepLineOpen when off', async () => {
    renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    await confirmYes();
    expect(invoiceM).toHaveBeenCalledWith('tok', 11, { reason: 'Closed down' }, expect.any(String));
  });

  it('sends a typed amount, the quick reason and keepLineOpen when chosen', async () => {
    renderSheet();
    press('wo-quick-UNRECOVERABLE');
    type('wo-amount', '2000');
    press('wo-keep-open');
    press('wo-review');
    expect(screen.getByTestId('wo-consequence')).toHaveTextContent(
      '₹2,000.00 will no longer be owed. This cannot be undone in the app. Their credit line will stay open.');
    await confirmYes();
    expect(invoiceM).toHaveBeenCalledWith('tok', 11,
      { amount: '2000.00', reason: 'Unrecoverable', quickReason: 'UNRECOVERABLE', keepLineOpen: true }, expect.any(String));
  });

  it('refuses a bad amount before the review', () => {
    renderSheet();
    type('wo-reason', 'Closed down');
    type('wo-amount', '1.234');
    expect(disabled('wo-review')).toBe(true);
    type('wo-amount', '0');
    expect(disabled('wo-review')).toBe(true);
  });

  it('writes off the whole line through the line endpoint', async () => {
    renderSheet(lineTarget);
    expect(screen.getByTestId('wo-amount').props.value).toBe('30000');
    type('wo-reason', 'Closed down');
    press('wo-review');
    expect(screen.getByTestId('wo-consequence')).toHaveTextContent(/₹30,000\.00 will no longer be owed/);
    await confirmYes();
    expect(lineM).toHaveBeenCalledWith('tok', 3, { reason: 'Closed down' }, expect.any(String));
    expect(invoiceM).not.toHaveBeenCalled();
  });

  it('shows the result from the server: items, written off, line paused', async () => {
    const { invalidate } = renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    await confirmYes();
    expect(await screen.findByTestId('wo-result')).toBeTruthy();
    expect(screen.getByText('₹12,000.00 written off.')).toBeTruthy();
    expect(screen.getByText(/INV-11/)).toBeTruthy();
    expect(screen.getByText(/Their credit line is paused/)).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-invoice'] });
  });

  it('says the line stays open when the server did not suspend it', async () => {
    invoiceM.mockResolvedValue(answer({ lineSuspended: false, lineStatus: 'ACTIVE' }));
    renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    await confirmYes();
    expect(await screen.findByText(/Their credit line stays open/)).toBeTruthy();
  });

  it('a double tap on Yes reaches the server once', async () => {
    let resolve!: (v: unknown) => void;
    invoiceM.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    await act(async () => { press('wo-confirm'); press('wo-confirm'); });
    expect(invoiceM).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(answer()); });
  });

  it('says nothing is owed on NOTHING_OWED and uses a fresh key next time', async () => {
    invoiceM.mockRejectedValueOnce(apiError('CREDIT_WRITE_OFF_NOTHING_OWED', 409));
    renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    await confirmYes();
    expect(await screen.findByTestId('wo-error')).toHaveTextContent(/nothing is owed/i);
    // The error returns the person to the form; the same details again are a new attempt.
    press('wo-review');
    await confirmYes();
    expect(invoiceM.mock.calls[1][3]).not.toBe(invoiceM.mock.calls[0][3]);
  });

  it('quotes the server outstanding when the amount is too high', async () => {
    invoiceM.mockRejectedValueOnce(apiError('CREDIT_NOTE_EXCEEDS_OUTSTANDING', 422, { outstanding: '10000.0000' }));
    renderSheet();
    type('wo-reason', 'Closed down');
    type('wo-amount', '12000');
    press('wo-review');
    await confirmYes();
    expect(await screen.findByTestId('wo-error')).toHaveTextContent(/₹10,000\.00/);
  });

  it('keeps the same key after a dropped connection', async () => {
    invoiceM.mockRejectedValueOnce(new NetworkError());
    renderSheet();
    type('wo-reason', 'Closed down');
    press('wo-review');
    await confirmYes();
    await screen.findByTestId('wo-error');
    press('wo-review');
    await confirmYes();
    expect(invoiceM.mock.calls[1][3]).toBe(invoiceM.mock.calls[0][3]);
  });

  it('cannot be confirmed while offline', () => {
    renderSheet(invoiceTarget, true);
    type('wo-reason', 'Closed down');
    expect(disabled('wo-review')).toBe(true);
  });
});
