import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import CreditClaimScreen from '@/app/restaurant/credit/claim';
import { ApiError } from '@/lib/api/errors';
import { istDay, shiftDay } from '@/lib/credit/claims';
import { fetchAgreement, fetchCreditInvoice, fetchInvoices, submitClaim } from '@/services/credit';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockBack = jest.fn();
let mockParams: Record<string, string> = { agreementId: '3' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/restaurant/credit/claim',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchAgreement: jest.fn(),
  fetchInvoices: jest.fn(),
  fetchCreditInvoice: jest.fn(),
  submitClaim: jest.fn(),
}));

const agreementM = fetchAgreement as jest.Mock;
const invoicesM = fetchInvoices as jest.Mock;
const submitM = submitClaim as jest.Mock;
const detailM = fetchCreditInvoice as jest.Mock;

const inv = (id: number, o: Record<string, unknown> = {}) => ({
  id, invoiceNumber: `INV-${id}`, creditAgreementId: 3, supplierOrderId: 100 + id, status: 'ISSUED',
  amount: '9200.0000', paidAmount: '2700.0000', outstanding: '6500.0000', dueDate: '2026-10-20',
  issuedAt: '2026-08-01', dueState: 'DUE_LATER', daysToDue: 15, settledAt: null, ...o,
});
const LIST = [
  inv(11, { dueDate: '2026-10-01' }),
  inv(12, { dueState: 'OVERDUE', dueDate: '2026-11-30', daysToDue: -3, outstanding: '600.0000' }),
  inv(13, { dueState: 'PAID', status: 'PAID', outstanding: '0.0000', settledAt: '2026-09-01' }),
];

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={client}>
      <CreditClaimScreen />
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}

const sendButton = () => screen.getByTestId('claim-send');
const sendDisabled = () => sendButton().props.accessibilityState?.disabled === true;
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const apiError = (code: string, status: number, details?: Record<string, unknown>) =>
  new ApiError({ code, message: `server says ${code}`, status, details });

async function ready(preset?: string) {
  mockParams = preset == null ? { agreementId: '3' } : { agreementId: '3', invoiceId: preset };
  const view = renderScreen();
  await screen.findByTestId('claim-invoice');
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { agreementId: '3' };
  mockOffline = false;
  agreementM.mockResolvedValue({ id: 3, supplierName: 'Acme Foods', storeName: 'Acme Main' });
  invoicesM.mockResolvedValue(LIST);
  submitM.mockResolvedValue({ id: 1, status: 'SUBMITTED' });
  detailM.mockResolvedValue({ id: 11, claims: [] });
});

describe('invoice choice', () => {
  it('shows only the selected open invoice as a compact card, first overdue first', async () => {
    await ready();
    expect(screen.queryByText('Which invoice?')).toBeNull();
    expect(screen.getAllByTestId(/^credit-invoice-\d+$/).map((n) => n.props.testID)).toEqual(['credit-invoice-12']);
    expect(screen.getByTestId('claim-invoice')).toHaveTextContent(/INV-12/);
    expect(screen.getByTestId('claim-invoice')).toHaveTextContent(/₹600\.00 of ₹9,200\.00 owed/);
    expect(screen.queryByTestId('credit-invoice-11')).toBeNull();
    expect(screen.getByTestId('claim-change-invoice')).toBeTruthy();
    expect(screen.getByTestId('claim-amount').props.value).toBe('600.00');
  });

  it('Change invoice opens a sheet with the open invoices, the current one Selected; picking re-prefills', async () => {
    invoicesM.mockResolvedValue([
      inv(21, { dueDate: '2026-12-20', outstanding: '100.0000' }),
      inv(22, { dueDate: '2026-12-01', outstanding: '250.5000' }),
    ]);
    await ready();
    expect(screen.getByTestId('credit-invoice-22')).toBeTruthy();
    expect(screen.getByTestId('claim-amount').props.value).toBe('250.50');
    expect(screen.queryByTestId('claim-pick-invoice-21')).toBeNull();
    fireEvent.press(screen.getByTestId('claim-change-invoice'));
    expect(screen.getAllByTestId(/^claim-pick-invoice-\d+$/)).toHaveLength(2);
    expect(screen.getByTestId('claim-pick-invoice-22')).toHaveTextContent(/Selected/);
    expect(screen.getByTestId('claim-pick-invoice-21')).not.toHaveTextContent(/Selected/);
    fireEvent.press(screen.getByTestId('claim-pick-invoice-21'));
    expect(screen.queryByTestId('claim-pick-invoice-21')).toBeNull();
    expect(screen.getByTestId('credit-invoice-21')).toBeTruthy();
    expect(screen.queryByTestId('credit-invoice-22')).toBeNull();
    expect(screen.getByTestId('claim-amount').props.value).toBe('100.00');
  });

  it('has no Change invoice button with a single open invoice', async () => {
    invoicesM.mockResolvedValue([LIST[0]]);
    await ready();
    expect(screen.queryByTestId('claim-change-invoice')).toBeNull();
  });

  it('shows a preset invoice read-only with what is still owed', async () => {
    await ready('11');
    expect(screen.queryByText('Which invoice?')).toBeNull();
    expect(screen.getByTestId('claim-invoice')).toHaveTextContent(/INV-11/);
    expect(screen.getByTestId('claim-invoice')).toHaveTextContent(/₹6,500\.00 of ₹9,200\.00 owed/);
    expect(screen.getByTestId('claim-amount').props.value).toBe('6500.00');
  });

  it('says so when nothing is owed', async () => {
    invoicesM.mockResolvedValue([LIST[2]]);
    mockParams = { agreementId: '3' };
    renderScreen();
    expect(await screen.findByTestId('claim-nothing-owed')).toBeTruthy();
    expect(screen.queryByTestId('claim-send')).toBeNull();
  });

  it('tells the person it is not owed when the preset invoice is settled', async () => {
    mockParams = { agreementId: '3', invoiceId: '13' };
    renderScreen();
    expect(await screen.findByText('Nothing is owed on this invoice')).toBeTruthy();
  });
});

describe('form', () => {
  it('explains that the supplier confirms and labels the header', async () => {
    await ready();
    expect(screen.getByText('I paid outside the app')).toBeTruthy();
    expect(screen.getByText('Your supplier will confirm this. Until then it still shows as owed.')).toBeTruthy();
  });

  it.each([
    ['0.5', false, 'Enter at least ₹1.00.'],
    ['0', false, 'Enter at least ₹1.00.'],
    ['1', true, null],
    ['1.00', true, null],
    ['1.005', false, 'Use at most 2 decimal places.'],
    ['', false, null],
  ])('amount %p: send enabled %p', async (text, enabled, message) => {
    await ready();
    type('claim-reference', 'UTR1');
    type('claim-amount', text);
    expect(sendDisabled()).toBe(!enabled);
    if (message != null) expect(screen.getByText(message)).toBeTruthy();
  });

  it('shows the five method chips with Bank transfer chosen first', async () => {
    await ready();
    const labels = ['Bank transfer', 'UPI', 'Cash', 'Cheque', 'Card'];
    for (const label of labels) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByTestId('claim-method-BANK_TRANSFER').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('claim-method-CHEQUE'));
    expect(screen.getByTestId('claim-method-CHEQUE').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('claim-method-BANK_TRANSFER').props.accessibilityState.selected).toBe(false);
  });

  it('needs a reference for every method except Cash', async () => {
    await ready();
    expect(screen.getByText('Required')).toBeTruthy();
    expect(sendDisabled()).toBe(true);
    type('claim-reference', 'UTR123');
    expect(sendDisabled()).toBe(false);
    expect(screen.queryByText('Required')).toBeNull();
    type('claim-reference', '   ');
    expect(sendDisabled()).toBe(true);

    for (const method of ['UPI', 'CHEQUE', 'CARD', 'BANK_TRANSFER']) {
      fireEvent.press(screen.getByTestId(`claim-method-${method}`));
      expect(sendDisabled()).toBe(true);
    }
    fireEvent.press(screen.getByTestId('claim-method-CASH'));
    expect(sendDisabled()).toBe(false);
    expect(screen.queryByText('Required')).toBeNull();
  });

  it('starts on today in India and never goes past it', async () => {
    await ready();
    const today = istDay();
    expect(screen.getByTestId('claim-date-next').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('claim-date-today')).toBeNull();
    fireEvent.press(screen.getByTestId('claim-date-prev'));
    expect(screen.getByTestId('claim-date-next').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('claim-date-today')).toBeTruthy();
    fireEvent.press(screen.getByTestId('claim-date-next'));
    expect(screen.getByTestId('claim-date-next').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('claim-date-prev'));
    fireEvent.press(screen.getByTestId('claim-date-today'));
    expect(screen.queryByTestId('claim-date-today')).toBeNull();
    type('claim-reference', 'U');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalled());
    expect(submitM.mock.calls[0][2].paidOn).toBe(today);
  });

  it('will not step back before the invoice was issued', async () => {
    const today = istDay();
    invoicesM.mockResolvedValue([inv(31, { issuedAt: shiftDay(today, -1) })]);
    await ready();
    fireEvent.press(screen.getByTestId('claim-date-prev'));
    expect(screen.getByTestId('claim-date-prev').props.accessibilityState.disabled).toBe(true);
  });

  it('disables Send to supplier while offline, even when the form is valid', async () => {
    mockOffline = true;
    await ready();
    type('claim-reference', 'U');
    expect(sendDisabled()).toBe(true);
    expect(screen.getByText('Reconnect to send this.')).toBeTruthy();
    fireEvent.press(sendButton());
    expect(submitM).not.toHaveBeenCalled();
  });

  it('paints Send to supplier orange (primary), I paid style is not used', async () => {
    await ready();
    type('claim-reference', 'U');
    expect(StyleSheet.flatten(sendButton().props.style).backgroundColor).toBe(Colors.primary);
  });
});

describe('sending', () => {
  async function fill() {
    await ready();
    type('claim-amount', '600');
    type('claim-reference', ' UTR9 ');
    type('claim-note', 'Paid at the shop');
  }

  it('sends the typed values with a key', async () => {
    await fill();
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(1));
    const [token, invoiceId, body, key] = submitM.mock.calls[0];
    expect(token).toBe('tok');
    expect(invoiceId).toBe(12);
    expect(body).toEqual({
      amount: 600, method: 'BANK_TRANSFER', reference: 'UTR9', paidOn: istDay(), note: 'Paid at the shop',
    });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('omits an empty reference for Cash and an empty note', async () => {
    await ready();
    fireEvent.press(screen.getByTestId('claim-method-CASH'));
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalled());
    expect(submitM.mock.calls[0][2]).toEqual({ amount: 600, method: 'CASH', paidOn: istDay() });
  });

  it('shows the toast only after the server answered, then refreshes and goes back', async () => {
    const order: string[] = [];
    let answer: (v: unknown) => void = () => undefined;
    submitM.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    mockToast.mockImplementation(() => order.push('toast'));
    mockBack.mockImplementation(() => order.push('back'));
    const { invalidate } = await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalled());
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(sendDisabled()).toBe(true);
    await act(async () => { answer({ id: 5, status: 'SUBMITTED' }); });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Sent to Acme Foods. They'll confirm it.", 'success'));
    expect(order).toEqual(['toast', 'back']);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['outlet', 7, 'credit'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-agreement', 3] });
  });

  it('a double tap sends once', async () => {
    submitM.mockImplementation(() => new Promise(() => undefined));
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    fireEvent.press(sendButton());
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(1));
  });

  it('reuses the key on a retry after a server error and uses a new one once the attempt changes', async () => {
    submitM.mockRejectedValue(apiError('INTERNAL', 500));
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    expect(await screen.findByTestId('claim-error-retry')).toBeTruthy();
    expect(screen.getByText("Couldn't send that. Check your connection and try again.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('claim-retry'));
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(submitM.mock.calls[1][3]).toBe(submitM.mock.calls[0][3]);
    await screen.findByTestId('claim-error-retry');

    type('claim-amount', '500');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(3));
    expect(submitM.mock.calls[2][3]).not.toBe(submitM.mock.calls[0][3]);
  });

  it('keeps the key across a dropped connection too', async () => {
    submitM.mockRejectedValue(new TypeError('Network request failed'));
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await screen.findByTestId('claim-error-retry');
    fireEvent.press(screen.getByTestId('claim-retry'));
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(submitM.mock.calls[1][3]).toBe(submitM.mock.calls[0][3]);
  });

  it('a refusal ends the attempt, so the next send has a new key', async () => {
    submitM.mockRejectedValue(apiError('VALIDATION_ERROR', 422));
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await screen.findByText('server says VALIDATION_ERROR');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(submitM.mock.calls[1][3]).not.toBe(submitM.mock.calls[0][3]);
  });

  it('words an overpayment with what can still be reported', async () => {
    submitM.mockRejectedValue(apiError('CREDIT_OVERPAYMENT', 422, { outstanding: 400 }));
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    expect(await screen.findByText(
      'You can report up to ₹400.00 more on this invoice (other reports are waiting for your supplier).',
    )).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each([
    ['a changed state', apiError('CREDIT_CLAIM_STATE', 409)],
    ['a missing invoice', apiError('NOT_FOUND', 404)],
  ])('says the invoice changed for %s', async (_name, error) => {
    submitM.mockRejectedValue(error);
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    expect(await screen.findByText('This invoice changed. Go back and try again.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('keeps the message when the refresh removes the invoice from the open list', async () => {
    submitM.mockRejectedValue(apiError('CREDIT_CLAIM_STATE', 409));
    await ready('12');
    type('claim-reference', 'U1');
    invoicesM.mockResolvedValue([]);
    fireEvent.press(sendButton());
    expect(await screen.findByText('This invoice changed. Go back and try again.')).toBeTruthy();
  });
});

describe('loading', () => {
  it('offers a retry when the invoices cannot load', async () => {
    invoicesM.mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    expect(await screen.findByTestId('claim-load-error')).toBeTruthy();
    fireEvent.press(screen.getByText('Try Again'));
    expect(await screen.findByTestId('claim-send')).toBeTruthy();
  });
});


describe('reporting the same payment twice', () => {
  const waiting = (o: Record<string, unknown> = {}) => ({
    id: 90, invoiceId: 11, status: 'SUBMITTED', amount: '1000.0000', method: 'BANK_TRANSFER',
    paidOn: istDay(), ...o,
  });

  it('prefills with the reportable amount, not what is still owed', async () => {
    invoicesM.mockResolvedValue([inv(11, { outstanding: '6500.0000', reportableAmount: 4000 })]);
    await ready('11');
    expect(screen.getByTestId('claim-amount').props.value).toBe('4000.00');
  });

  it('falls back to outstanding when the field is absent', async () => {
    invoicesM.mockResolvedValue([inv(11, { outstanding: '6500.0000' })]);
    await ready('11');
    expect(screen.getByTestId('claim-amount').props.value).toBe('6500.00');
  });

  it('tells the person what is already reported and waiting', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 4000 })]);
    detailM.mockResolvedValue({ id: 11, claims: [
      waiting({ amount: '1000.0000' }), waiting({ id: 91, amount: '500.5000' }),
      waiting({ id: 92, status: 'CONFIRMED', amount: '9999.0000' }),
    ] });
    await ready('11');
    expect(await screen.findByTestId('claim-waiting-info'))
      .toHaveTextContent(/₹1,500\.50\ already\ reported\ and\ waiting\ for\ Acme\ Foods\./);
  });

  it('shows no info line when nothing is waiting', async () => {
    await ready('11');
    await waitFor(() => expect(detailM).toHaveBeenCalled());
    expect(screen.queryByTestId('claim-waiting-info')).toBeNull();
  });

  it('warns and says Send anyway when a waiting report has the same amount, method and day', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 1000 })]);
    detailM.mockResolvedValue({ id: 11, claims: [waiting()] });
    await ready('11');
    expect(await screen.findByTestId('claim-duplicate-warning'))
      .toHaveTextContent(/You\ already\ reported\ this\ payment\.\ Sending\ it\ again\ may\ be\ a\ duplicate\./);
    expect(sendButton()).toHaveTextContent('Send anyway');
    type('claim-reference', 'UTR1');
    expect(sendDisabled()).toBe(false);
    await act(async () => { fireEvent.press(sendButton()); });
    expect(submitM).toHaveBeenCalledTimes(1);
  });

  it('does not warn when the amount, the method or the day differs', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 1000 })]);
    detailM.mockResolvedValue({ id: 11, claims: [waiting()] });
    await ready('11');
    await screen.findByTestId('claim-duplicate-warning');
    type('claim-amount', '999');
    expect(screen.queryByTestId('claim-duplicate-warning')).toBeNull();
    expect(sendButton()).toHaveTextContent('Send to supplier');
    type('claim-amount', '1000');
    expect(screen.getByTestId('claim-duplicate-warning')).toBeTruthy();
    fireEvent.press(screen.getByTestId('claim-method-UPI'));
    expect(screen.queryByTestId('claim-duplicate-warning')).toBeNull();
    fireEvent.press(screen.getByTestId('claim-method-BANK_TRANSFER'));
    fireEvent.press(screen.getByTestId('claim-date-prev'));
    expect(screen.queryByTestId('claim-duplicate-warning')).toBeNull();
  });

  it('ignores reports that are no longer waiting', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 1000 })]);
    detailM.mockResolvedValue({ id: 11, claims: [waiting({ status: 'WITHDRAWN' })] });
    await ready('11');
    await waitFor(() => expect(detailM).toHaveBeenCalled());
    expect(screen.queryByTestId('claim-duplicate-warning')).toBeNull();
  });

  it('at reportable 0 says everything is reported and disables sending', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 0 })]);
    await ready('11');
    expect(screen.getByTestId('claim-all-reported'))
      .toHaveTextContent(/Everything\ you\ owe\ on\ this\ invoice\ is\ already\ reported\.\ Your\ supplier\ will\ confirm\ it\./);
    expect(screen.queryByTestId('claim-send')).toBeNull();
  });

  it('at reportable 0 hides every field and shows one banner only', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 0 })]);
    detailM.mockResolvedValue({ id: 11, claims: [waiting()] });
    await ready('11');
    expect(await screen.findByTestId('claim-all-reported')).toBeTruthy();
    expect(screen.getByTestId('claim-invoice')).toBeTruthy();
    for (const id of ['claim-amount', 'claim-reference', 'claim-note', 'claim-date', 'claim-method-UPI', 'claim-explainer']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByTestId('claim-waiting-info')).toBeNull();
    expect(screen.queryByTestId('claim-report-different')).toBeNull();
  });

  it('offers Report a different invoice when another open invoice has something to report', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 0 }), inv(12, { reportableAmount: 500 })]);
    await ready('11');
    fireEvent.press(await screen.findByTestId('claim-report-different'));
    fireEvent.press(screen.getByTestId('claim-pick-invoice-12'));
    expect(screen.getByTestId('credit-invoice-12')).toBeTruthy();
    expect(screen.getByTestId('claim-amount').props.value).toBe('500.00');
    expect(screen.queryByTestId('claim-all-reported')).toBeNull();
    expect(screen.getByTestId('claim-send')).toBeTruthy();
  });

  it('merges partly reported into one banner with the amount', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 4000 })]);
    detailM.mockResolvedValue({ id: 11, claims: [waiting()] });
    await ready('11');
    expect(await screen.findByTestId('claim-waiting-info')).toHaveTextContent(/₹1,000\.00 already reported and waiting for Acme Foods\./);
    expect(screen.queryByTestId('claim-all-reported')).toBeNull();
  });

  it('phrases an overpayment refusal as up to the reportable amount more', async () => {
    invoicesM.mockResolvedValue([inv(11, { reportableAmount: 4000 })]);
    submitM.mockRejectedValue(apiError('CREDIT_OVERPAYMENT', 422, { outstanding: 250 }));
    await ready('11');
    type('claim-reference', 'UTR1');
    await act(async () => { fireEvent.press(sendButton()); });
    expect(await screen.findByTestId('claim-error-overpayment')).toHaveTextContent(/up to ₹250\.00 more/);
  });
});

describe('first screen and cues', () => {
  const scrollEvent = (offset: number, viewport: number, content: number) => ({
    nativeEvent: {
      contentOffset: { x: 0, y: offset },
      layoutMeasurement: { width: 390, height: viewport },
      contentSize: { width: 390, height: content },
    },
  });
  const scroller = () => screen.getByTestId('mandi-screen-scroll');
  const measure = (viewport: number, content: number) => {
    act(() => {
      fireEvent(scroller(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: viewport } } });
      fireEvent(scroller(), 'contentSizeChange', 390, content);
    });
  };

  it('puts the invoice, amount, method chips and Send within the first screen, with a required reference', async () => {
    await ready();
    for (const id of ['claim-invoice', 'claim-amount', 'claim-method-BANK_TRANSFER', 'claim-method-CARD', 'claim-send']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // The chips are one wrapping row, not a column that pushes the form down.
    let node = screen.getByTestId('claim-method-UPI').parent;
    while (node != null && StyleSheet.flatten(node.props.style)?.flexWrap == null) node = node.parent;
    expect(StyleSheet.flatten(node?.props.style).flexWrap).toBe('wrap');
    expect(screen.getByTestId('claim-reference')).toBeTruthy();
    expect(screen.getByText(/^Reference \*$/)).toBeTruthy();
    // The asterisk marks a required reference, and is gone for cash.
    expect(screen.getAllByText('*').length).toBeGreaterThanOrEqual(2);
    fireEvent.press(screen.getByTestId('claim-method-CASH'));
    expect(screen.getByText(/^Reference \(optional\)$/)).toBeTruthy();
  });

  it('shows the more-below cue only while the content is taller than the screen and not at the end', async () => {
    await ready();
    expect(screen.queryByTestId('more-below')).toBeNull();
    measure(500, 900);
    expect(screen.getByTestId('more-below')).toHaveTextContent(/Scroll for reference, date and note/);
    act(() => { fireEvent.scroll(scroller(), scrollEvent(100, 500, 900)); });
    expect(screen.getByTestId('more-below')).toBeTruthy();
    act(() => { fireEvent.scroll(scroller(), scrollEvent(400, 500, 900)); });
    expect(screen.queryByTestId('more-below')).toBeNull();
    act(() => { fireEvent.scroll(scroller(), scrollEvent(200, 500, 900)); });
    expect(screen.getByTestId('more-below')).toBeTruthy();
    measure(500, 480);
    expect(screen.queryByTestId('more-below')).toBeNull();
  });

  it('says why Send is off, in one line, and drops the line when it can send', async () => {
    await ready();
    type('claim-amount', '');
    expect(screen.getByTestId('claim-disabled-reason')).toHaveTextContent('Enter an amount of at least ₹1.');
    type('claim-amount', '100');
    expect(screen.getByTestId('claim-disabled-reason')).toHaveTextContent('Add the reference number to send.');
    type('claim-reference', 'UTR1');
    expect(screen.queryByTestId('claim-disabled-reason')).toBeNull();
    expect(sendDisabled()).toBe(false);
  });
});

describe('keyboard', () => {
  it('lifts the scroll area and the footer button together, and the form scrolls with taps kept', async () => {
    await ready();
    const avoiding = screen.getByTestId('mandi-screen-keyboard-avoiding');
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    expect(within(avoiding).getByTestId('claim-send')).toBeTruthy();
    expect(within(avoiding).getByTestId('claim-note')).toBeTruthy();
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.keyboardDismissMode).toBe('on-drag');
  });

  it('hides the scroll cue while the keyboard is open', async () => {
    let show: ((e: unknown) => void) | undefined;
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, cb: (e: unknown) => void) => {
      if (name === 'keyboardDidShow') show = cb;
      return { remove: () => {} };
    }) as never);
    await ready();
    fireEvent(screen.getByTestId('mandi-screen-scroll'), 'layout', { nativeEvent: { layout: { height: 300 } } });
    fireEvent(screen.getByTestId('mandi-screen-scroll'), 'contentSizeChange', 300, 1200);
    expect(screen.queryByTestId('more-below')).not.toBeNull();
    act(() => { show?.({ endCoordinates: { height: 883 } }); });
    expect(screen.queryByTestId('more-below')).toBeNull();
    jest.restoreAllMocks();
  });
});
