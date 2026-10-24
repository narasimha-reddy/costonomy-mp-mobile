import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreditClaimScreen from '@/app/restaurant/credit/claim';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { istDay } from '@/lib/credit/claims';
import { fetchAgreement, fetchCreditInvoice, fetchInvoices, submitClaim } from '@/services/credit';

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
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outletId: 7, outlet: { id: 7, restaurantId: 1 } }),
}));
let mockMayRepay = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => mockMayRepay }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
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
  amount: '9200.0000', paidAmount: '2700.0000', outstanding: '600.0000', dueDate: '2026-10-20',
  issuedAt: '2026-08-01', dueState: 'DUE_LATER', daysToDue: 15, settledAt: null, ...o,
});
const apiError = (code: string, status: number, details?: Record<string, unknown>) =>
  new ApiError({ code, message: `server says ${code}`, status, details });

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockMayRepay = true; jest.useRealTimers(); });

function Tree() {
  return <CreditClaimScreen />;
}
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><Tree /></QueryClientProvider>);
}
const sendButton = () => screen.getByTestId('claim-send');
const sendDisabled = () => sendButton().props.accessibilityState?.disabled === true;
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const keyOf = (n: number) => submitM.mock.calls[n][3] as string;

async function ready() {
  const view = renderScreen();
  await screen.findByTestId('claim-invoice');
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { agreementId: '3' };
  agreementM.mockResolvedValue({ id: 3, supplierName: 'Acme Foods', storeName: 'Acme Main' });
  invoicesM.mockResolvedValue([inv(11)]);
  submitM.mockReset();
  submitM.mockResolvedValue({ id: 1, status: 'SUBMITTED' });
  detailM.mockResolvedValue({ id: 11, claims: [] });
});

describe('B12 / P04: reporting needs CREDIT_REPAY', () => {
  it('without it: a friendly page, no form and no request', async () => {
    mockMayRepay = false;
    renderScreen();
    expect(await screen.findByTestId('claim-no-permission')).toBeTruthy();
    expect(screen.getByText("You don't have permission to pay or report payments for this outlet. Ask the owner.")).toBeTruthy();
    expect(screen.queryByTestId('claim-send')).toBeNull();
    expect(agreementM).not.toHaveBeenCalled();
    expect(invoicesM).not.toHaveBeenCalled();
    expect(submitM).not.toHaveBeenCalled();
  });

  it('with it: the form', async () => {
    await ready();
    expect(screen.getByTestId('claim-send')).toBeTruthy();
    expect(screen.queryByTestId('claim-no-permission')).toBeNull();
  });
});

describe('R30 for claims: the key outlives the screen', () => {
  it('a dropped connection, back out and open the form again: the same body is sent with the same key', async () => {
    submitM.mockRejectedValue(new NetworkError());
    const first = await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await screen.findByTestId('claim-error-retry');
    first.unmount();

    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
  });
});

describe('B14: the note is part of the attempt', () => {
  it('editing only the note after a 5xx sends a NEW key; the same note again keeps the key', async () => {
    submitM.mockRejectedValue(apiError('UNAVAILABLE', 503));
    await ready();
    type('claim-reference', 'U1');
    type('claim-note', 'first note');
    fireEvent.press(sendButton());
    await screen.findByTestId('claim-error-retry');

    fireEvent.press(screen.getByTestId('claim-retry'));
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));

    await screen.findByTestId('claim-error-retry');
    type('claim-note', 'a different note');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).not.toBe(keyOf(0));
    expect(submitM.mock.calls[2][2]).toMatchObject({ note: 'a different note' });
  });

  it('trailing spaces in the note do not make a new attempt', async () => {
    submitM.mockRejectedValue(apiError('UNAVAILABLE', 503));
    await ready();
    type('claim-reference', 'U1');
    type('claim-note', 'same note');
    fireEvent.press(sendButton());
    await screen.findByTestId('claim-error-retry');
    type('claim-note', '  same note  ');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('adding a note to a body that had none is a different attempt', async () => {
    submitM.mockRejectedValue(apiError('UNAVAILABLE', 503));
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await screen.findByTestId('claim-error-retry');
    type('claim-note', 'now with a note');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });
});

describe('R22 / B1 for claims: IDEMPOTENCY_KEY_REUSE is not silently retried', () => {
  it('refreshes first, says so, holds Send until the refresh is done, then sends with a NEW key', async () => {
    submitM.mockRejectedValueOnce(apiError('IDEMPOTENCY_KEY_REUSE', 409)).mockResolvedValue({ id: 1, status: 'SUBMITTED' });
    await ready();
    let release!: () => void;
    invoicesM.mockReturnValue(new Promise((resolve) => { release = () => resolve([inv(11)]); }));
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    expect(await screen.findByTestId('claim-error-reuse')).toHaveTextContent(
      "Your earlier payment may have gone through. We've refreshed your balance: please check before paying again.");
    // The refresh has begun and is not finished: Send stays off.
    await waitFor(() => expect(invoicesM.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(sendDisabled()).toBe(true);
    fireEvent.press(sendButton());
    expect(submitM).toHaveBeenCalledTimes(1);

    await act(async () => { release(); });
    await waitFor(() => expect(sendDisabled()).toBe(false));
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });
});

describe('B3 for claims', () => {
  it('IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED: plain message, next Send has a NEW key', async () => {
    submitM.mockRejectedValueOnce(apiError('IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED', 409)).mockResolvedValue({ id: 1 });
    await ready();
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    expect(await screen.findByTestId('claim-error-failed')).toHaveTextContent("That didn't go through. Please try again.");
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('IDEMPOTENT_REQUEST_IN_PROGRESS: Still processing, key kept, a re-read after a short delay', async () => {
    submitM.mockRejectedValueOnce(apiError('IDEMPOTENT_REQUEST_IN_PROGRESS', 409)).mockResolvedValue({ id: 1 });
    await ready();
    type('claim-reference', 'U1');
    jest.useFakeTimers();
    fireEvent.press(sendButton());
    expect(await screen.findByTestId('claim-error-processing')).toHaveTextContent("Still processing… we'll check again.");
    const before = invoicesM.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(4100); });
    await waitFor(() => expect(invoicesM.mock.calls.length).toBeGreaterThan(before));
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
  });
});

describe('token expiry mid-flow', () => {
  it('a 401 says Please sign in again and the form keeps what was typed', async () => {
    submitM.mockRejectedValue(apiError('UNAUTHENTICATED', 401));
    await ready();
    type('claim-reference', 'U1');
    type('claim-note', 'keep me');
    fireEvent.press(sendButton());
    expect(await screen.findByTestId('claim-error-auth')).toHaveTextContent('Please sign in again.');
    expect(screen.getByTestId('claim-reference').props.value).toBe('U1');
    expect(screen.getByTestId('claim-note').props.value).toBe('keep me');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('M03 / B5 for claims: below ₹1 only when it is exactly reportable', () => {
  it('prefilled with a reportable of ₹0.50, Send is enabled', async () => {
    invoicesM.mockResolvedValue([inv(11, { outstanding: '0.5000', reportableAmount: 0.5 })]);
    await ready();
    expect(screen.getByTestId('claim-amount').props.value).toBe('0.50');
    type('claim-reference', 'U1');
    expect(sendDisabled()).toBe(false);
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalled());
    expect(submitM.mock.calls[0][2]).toMatchObject({ amount: 0.5 });
  });

  it('typing 0.30 when the reportable is 0.50 is refused with the minimum', async () => {
    invoicesM.mockResolvedValue([inv(11, { outstanding: '0.5000', reportableAmount: 0.5 })]);
    await ready();
    type('claim-reference', 'U1');
    type('claim-amount', '0.30');
    expect(sendDisabled()).toBe(true);
    expect(screen.getByText('Enter at least ₹1.00.')).toBeTruthy();
  });

  it('with a larger reportable amount, 0.50 is refused', async () => {
    await ready();
    type('claim-reference', 'U1');
    type('claim-amount', '0.50');
    expect(sendDisabled()).toBe(true);
  });
});

describe('U11: back during an in-flight claim', () => {
  it('no navigation and no warning after unmount; the toast shows once and the queries are invalidated', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    let release!: () => void;
    submitM.mockReturnValue(new Promise((resolve) => { release = () => resolve({ id: 1, status: 'SUBMITTED' }); }));
    const view = await ready();
    const client = clients[0] as QueryClient;
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await waitFor(() => expect(submitM).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => { release(); });
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('U14 / D: route params and shapes', () => {
  it('a non-numeric agreementId shows Nothing to report and requests nothing', async () => {
    mockParams = { agreementId: 'abc' };
    renderScreen();
    expect(await screen.findByText('Nothing to report here')).toBeTruthy();
    expect(agreementM).not.toHaveBeenCalled();
    expect(invoicesM).not.toHaveBeenCalled();
  });

  it('a missing agreementId behaves the same', async () => {
    mockParams = {};
    renderScreen();
    expect(await screen.findByText('Nothing to report here')).toBeTruthy();
    expect(invoicesM).not.toHaveBeenCalled();
  });

  it('D01: invoices without reportableAmount or dueState (old API) still give a working form', async () => {
    invoicesM.mockResolvedValue([inv(11, { dueState: undefined, daysToDue: undefined, dueDate: null, issuedAt: null })]);
    await ready();
    type('claim-reference', 'U1');
    expect(sendDisabled()).toBe(false);
  });

  it('S38: a SUPERSEDED report of the same amount, method and day is not a duplicate warning', async () => {
    detailM.mockResolvedValue({
      id: 11,
      claims: [{ id: 5, status: 'SUPERSEDED', amount: '600.0000', method: 'BANK_TRANSFER', paidOn: istDay() }],
    });
    await ready();
    type('claim-reference', 'U1');
    await waitFor(() => expect(detailM).toHaveBeenCalled());
    expect(screen.queryByTestId('claim-duplicate-warning')).toBeNull();
    expect(screen.queryByTestId('claim-waiting-info')).toBeNull();
  });

  it('D07: a long supplier name does not break the info line', async () => {
    agreementM.mockResolvedValue({ id: 3, supplierName: `🍅 ${'Very Long '.repeat(12)}`, storeName: null });
    detailM.mockResolvedValue({
      id: 11, claims: [{ id: 5, status: 'SUBMITTED', amount: '100.0000', method: 'UPI', paidOn: '2026-01-01' }],
    });
    await ready();
    expect(await screen.findByTestId('claim-waiting-info')).toHaveTextContent(/🍅 Very Long/);
  });
});

describe('U13 for claims', () => {
  it('a sent report invalidates the outlet credit tree and the agreement', async () => {
    await ready();
    const invalidate = jest.spyOn(clients[0] as QueryClient, 'invalidateQueries');
    type('claim-reference', 'U1');
    fireEvent.press(sendButton());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['outlet', 7, 'credit']),
      JSON.stringify(['credit-agreement', 3]),
    ]));
  });
});
