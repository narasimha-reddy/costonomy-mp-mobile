import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import SupplierInvoiceScreen from '@/app/supplier/credit/invoice/[id]';
import { ApiError, NetworkError } from '@/lib/api/errors';
import {
  confirmClaim, extendInvoiceDue, fetchCreditInvoice, previewPayment, recordSupplierPayment, rejectClaim,
} from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/supplier/credit/invoice/11',
  useLocalSearchParams: () => ({ id: '11' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/lib/server-clock', () => ({ serverNow: () => Date.parse('2026-10-06T06:00:00Z') }));
let mockGranted: string[] = ['CREDIT_MODIFY'];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForStore: (p: string) => mockGranted.includes(p) }),
}));
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
  fetchCreditInvoice: jest.fn(),
  extendInvoiceDue: jest.fn(),
  previewPayment: jest.fn(),
  recordSupplierPayment: jest.fn(),
  confirmClaim: jest.fn(),
  rejectClaim: jest.fn(),
}));

const invoiceM = fetchCreditInvoice as jest.Mock;
const extendM = extendInvoiceDue as jest.Mock;
const previewM = previewPayment as jest.Mock;
const recordM = recordSupplierPayment as jest.Mock;
const confirmM = confirmClaim as jest.Mock;
const rejectM = rejectClaim as jest.Mock;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const claim = (id: number, over: Record<string, unknown> = {}) => ({
  id, invoiceId: 11, invoiceNumber: 'INV-11', agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', amount: '5000.0000', method: 'UPI', reference: `UTR${id}`, paidOn: '2026-10-01',
  note: null, status: 'SUBMITTED', decisionNote: null, confirmedAmount: null, creditPaymentId: null,
  createdAt: daysAgo(3), decidedAt: null, ageDays: 3, ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  id: 11, invoiceNumber: 'INV-11', agreementId: 3, supplierOrderId: 90, status: 'PARTIALLY_PAID',
  amount: '9000.0000', paidAmount: '2500.0000', outstanding: '6500.0000', dueDate: '2026-10-10',
  overdueAfter: '2026-10-13', issuedAt: '2026-09-10T00:00:00Z', settledAt: null, dueState: 'DUE_SOON', daysToDue: 4,
  orderNumber: 'ORD-90', supplierName: 'Fresh Farms', storeName: 'Main',
  payments: [
    { id: 1, amount: '2500.0000', source: 'SUPPLIER_RECORDED', method: 'UPI', reference: 'REF1', paidAt: '2026-10-02T06:00:00Z', walletEntryId: null },
  ],
  claims: [], extensions: [], ...over,
});
const apiError = (code: string, status: number, message = `server says ${code}`, details?: Record<string, unknown>) =>
  new ApiError({ code, message, status, details });
const deferred = <T,>() => {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockOffline = false; mockGranted = ['CREDIT_MODIFY']; });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><SupplierInvoiceScreen /></QueryClientProvider>);
  return { invalidate };
}
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const esc = (t: string) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const ready = () => screen.findByTestId('invoice-outstanding');
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;

beforeEach(() => {
  jest.clearAllMocks();
  invoiceM.mockResolvedValue(detail());
  extendM.mockResolvedValue({
    invoice: detail(), agreementStatus: 'ACTIVE',
    extension: { id: 1, oldDueDate: '2026-10-10', newDueDate: '2026-10-17', reason: 'Festival', extendedBy: 1, createdAt: daysAgo(0) },
  });
  previewM.mockResolvedValue({
    amount: '6500.0000',
    allocations: [{ invoiceId: 11, invoiceNumber: 'INV-11', amount: '6500.0000', statusAfter: 'PAID' }],
    agreement: { due: '0.0000', overdue: '0.0000', available: '9.0000', status: 'ACTIVE' }, pendingClaims: [],
  });
  recordM.mockResolvedValue({
    receiptId: 1, amount: '6500.0000', method: 'CASH', reference: null, paidOn: '2026-10-06', allocations: [],
    agreement: { due: '0.0000', overdue: '0.0000', available: '9.0000', status: 'ACTIVE' },
  });
  confirmM.mockResolvedValue(claim(1, { status: 'CONFIRMED' }));
  rejectM.mockResolvedValue(claim(1, { status: 'REJECTED' }));
});

describe('the invoice', () => {
  it('shows the server figures, dates and due chip', async () => {
    renderScreen();
    expect(await screen.findByTestId('invoice-outstanding')).toHaveTextContent(esc('Still owed₹6,500.00'));
    expect(screen.getByTestId('invoice-amount')).toHaveTextContent(esc('₹9,000.00'));
    expect(screen.getByTestId('invoice-paid')).toHaveTextContent(esc('₹2,500.00'));
    expect(screen.getByTestId('invoice-due')).toHaveTextContent(esc('10th Oct 2026'));
    expect(screen.getByTestId('invoice-late-after')).toHaveTextContent(esc('13th Oct 2026'));
    expect(screen.getByTestId('invoice-chip')).toHaveTextContent(esc('Due in 4 days'));
    expect(screen.getByTestId('invoice-status')).toHaveTextContent(esc('Status: Part paid'));
    expect(invoiceM).toHaveBeenCalledWith('tok', 11);
  });

  it('lists the payments on it with who recorded them', async () => {
    renderScreen();
    const row = await screen.findByTestId('invoice-payment-1');
    expect(row).toHaveTextContent(esc('You recorded'));
    expect(row).toHaveTextContent(esc('UPI · ref REF1'));
    expect(row).toHaveTextContent(esc('₹2,500.00'));
  });

  it('shows the extension history, newest first as the server sent it', async () => {
    invoiceM.mockResolvedValue(detail({ extensions: [
      { id: 2, oldDueDate: '2026-10-17', newDueDate: '2026-10-24', reason: 'Second ask', extendedBy: 1, createdAt: '2026-10-05T00:00:00Z' },
      { id: 1, oldDueDate: '2026-10-10', newDueDate: '2026-10-17', reason: 'Festival', extendedBy: 1, createdAt: '2026-10-01T00:00:00Z' },
    ] }));
    renderScreen();
    expect(await screen.findByTestId('invoice-extension-2')).toHaveTextContent(esc('17th Oct 2026 to 24th Oct 2026'));
    expect(screen.getByTestId('invoice-extension-2')).toHaveTextContent(esc('Second ask'));
    expect(screen.getByTestId('invoice-extension-1')).toHaveTextContent(esc('Festival'));
  });

  it('says it is not available on a 404', async () => {
    invoiceM.mockRejectedValue(apiError('NOT_FOUND', 404));
    renderScreen();
    expect(await screen.findByTestId('invoice-not-found')).toBeTruthy();
  });

  it('a settled invoice offers no actions', async () => {
    invoiceM.mockResolvedValue(detail({ status: 'PAID', dueState: 'PAID', outstanding: '0.0000', daysToDue: null, settledAt: '2026-10-03T00:00:00Z' }));
    renderScreen();
    await screen.findByTestId('invoice-outstanding');
    expect(screen.queryByTestId('invoice-record')).toBeNull();
    expect(screen.queryByTestId('invoice-extend')).toBeNull();
  });
});

describe('permissions', () => {
  it('CREDIT_COLLECT can record but not extend', async () => {
    mockGranted = ['CREDIT_COLLECT'];
    renderScreen();
    expect(await screen.findByTestId('invoice-record')).toBeTruthy();
    expect(screen.queryByTestId('invoice-extend')).toBeNull();
  });
  it('CREDIT_MODIFY can do both', async () => {
    renderScreen();
    expect(await screen.findByTestId('invoice-record')).toBeTruthy();
    expect(screen.getByTestId('invoice-extend')).toBeTruthy();
  });
  it('a viewer sees neither', async () => {
    mockGranted = [];
    renderScreen();
    await screen.findByTestId('invoice-outstanding');
    expect(screen.queryByTestId('invoice-record')).toBeNull();
    expect(screen.queryByTestId('invoice-extend')).toBeNull();
  });
});

describe('record payment for this invoice', () => {
  it('opens the sheet for this invoice only, starting at what it owes, and records with invoiceIds [id]', async () => {
    renderScreen();
    await ready();
    press('invoice-record');
    await screen.findByTestId('record-sheet');
    expect(screen.getByTestId('record-amount').props.value).toBe('6500');
    await waitFor(() => expect(previewM).toHaveBeenCalledWith('tok', 3, { amount: '6500.00', invoiceIds: [11] }));
    press('record-submit');
    await waitFor(() => expect(recordM).toHaveBeenCalledTimes(1));
    expect(recordM.mock.calls[0][1]).toBe(3);
    expect(recordM.mock.calls[0][2].invoiceIds).toEqual([11]);
  });
});

describe('claims on the invoice', () => {
  it('shows each claim and lets a collector confirm one through the review sheet', async () => {
    invoiceM.mockResolvedValue(detail({ claims: [claim(1, { possibleDuplicateOf: 4, possibleDuplicateKind: 'PAYMENT' }), claim(2, { status: 'REJECTED', ageDays: 9 })] }));
    renderScreen();
    expect(await screen.findByTestId('invoice-claim-1')).toHaveTextContent(esc('Waiting for you · Waiting 3 days'));
    expect(screen.getByTestId('invoice-claim-1')).toHaveTextContent(esc('Looks like a payment you already have (same amount and reference)'));
    expect(screen.getByTestId('invoice-claim-2')).toHaveTextContent(esc('Rejected'));
    expect(screen.queryByTestId('invoice-claim-2-confirm')).toBeNull();
    press('invoice-claim-1-confirm');
    press('claim-confirm');
    await waitFor(() => expect(confirmM).toHaveBeenCalledTimes(1));
    expect(confirmM.mock.calls[0][1]).toBe(1);
  });

  it('Reject goes straight to the reason', async () => {
    invoiceM.mockResolvedValue(detail({ claims: [claim(1)] }));
    renderScreen();
    await ready();
    press('invoice-claim-1-reject');
    press('reject-reason-Not received');
    press('claim-reject-send');
    await waitFor(() => expect(rejectM).toHaveBeenCalledWith('tok', 1, 'Not received'));
  });

  it('a viewer sees the claim without buttons', async () => {
    mockGranted = [];
    invoiceM.mockResolvedValue(detail({ claims: [claim(1)] }));
    renderScreen();
    await screen.findByTestId('invoice-claim-1');
    expect(screen.queryByTestId('invoice-claim-1-confirm')).toBeNull();
  });

  it('a waiting claim shows in the record sheet preview and Review opens the same claim sheet', async () => {
    invoiceM.mockResolvedValue(detail({ claims: [claim(1)] }));
    previewM.mockResolvedValue({
      amount: '6500.0000', allocations: [], agreement: { due: '0.0000', overdue: '0.0000', available: '1.0000', status: 'ACTIVE' },
      pendingClaims: [{ invoiceId: 11, invoiceNumber: 'INV-11', amount: '5000.0000' }],
    });
    renderScreen();
    await ready();
    press('invoice-record');
    expect(await screen.findByTestId('record-pending-claim-11')).toHaveTextContent(esc('₹5,000.00 on INV-11'));
    press('record-review-claim-11');
    expect(await screen.findByTestId('claim-review-sheet')).toBeTruthy();
    expect(recordM).not.toHaveBeenCalled();
  });
});

describe('extend due date', () => {
  async function openExtend() {
    const view = renderScreen();
    await ready();
    press('invoice-extend');
    await screen.findByTestId('extend-sheet');
    return view;
  }

  it('starts a day after the current due date, shows the static 60-day hint, and needs a reason', async () => {
    await openExtend();
    expect(screen.getByTestId('extend-date-text')).toHaveTextContent(esc('11th Oct 2026'));
    expect(screen.getByTestId('extend-hint')).toHaveTextContent(esc('You can extend up to 60 days past the original due date'));
    expect(disabled('extend-submit')).toBe(true);
    type('extend-reason', 'ab');
    expect(disabled('extend-submit')).toBe(true);
    type('extend-reason', 'Festival week');
    expect(disabled('extend-submit')).toBe(false);
  });

  it('steps and has quick chips counted from the current due date', async () => {
    await openExtend();
    press('extend-date-next');
    expect(screen.getByTestId('extend-date-text')).toHaveTextContent(esc('12th Oct 2026'));
    press('extend-plus-7');
    expect(screen.getByTestId('extend-date-text')).toHaveTextContent(esc('17th Oct 2026'));
    press('extend-date-prev');
    expect(screen.getByTestId('extend-date-text')).toHaveTextContent(esc('16th Oct 2026'));
  });

  it('sends the new day and reason with an idempotency key, then toasts and refreshes', async () => {
    const { invalidate } = await openExtend();
    press('extend-plus-7');
    type('extend-reason', ' Festival week ');
    press('extend-submit');
    await waitFor(() => expect(extendM).toHaveBeenCalledTimes(1));
    expect(extendM.mock.calls[0].slice(0, 3)).toEqual(['tok', 11, { newDueDate: '2026-10-17', reason: 'Festival week' }]);
    expect(typeof extendM.mock.calls[0][3]).toBe('string');
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/Due date moved to 17th Oct 2026/), 'success'));
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(['credit-invoice']), JSON.stringify(['credit-agreement', 3])]));
  });

  it('shows the server message when the date is not allowed, with the latest allowed day, and keeps the sheet', async () => {
    extendM.mockRejectedValueOnce(apiError('VALIDATION_ERROR', 400, 'You can only extend a due date 60 days past the original.',
      { originalDueDate: '2026-10-10', latestDueDate: '2026-12-09' }));
    await openExtend();
    press('extend-plus-30');
    type('extend-reason', 'Long ask');
    press('extend-submit');
    expect(await screen.findByTestId('extend-error')).toHaveTextContent(esc(
      'You can only extend a due date 60 days past the original. The latest you can pick is 9th Dec 2026.'));
    expect(screen.getByTestId('extend-sheet')).toBeTruthy();
  });

  it('shows the server message when the invoice is paid or written off, and refreshes', async () => {
    extendM.mockRejectedValueOnce(apiError('INVALID_STATE_TRANSITION', 409, 'This invoice is already paid.'));
    const { invalidate } = await openExtend();
    type('extend-reason', 'Festival week');
    press('extend-submit');
    expect(await screen.findByText('This invoice is already paid.')).toBeTruthy();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-invoice'] }));
  });

  it('reuses the key after a dropped connection and takes a fresh one after a failed earlier attempt', async () => {
    extendM.mockRejectedValueOnce(new NetworkError()).mockRejectedValueOnce(apiError('IDEMPOTENT_PREVIOUS_ATTEMPT_FAILED', 409));
    await openExtend();
    type('extend-reason', 'Festival week');
    press('extend-submit');
    expect(await screen.findByText("Couldn't reach the server. Please try again.")).toBeTruthy();
    press('extend-submit');
    await waitFor(() => expect(extendM).toHaveBeenCalledTimes(2));
    expect(extendM.mock.calls[1][3]).toBe(extendM.mock.calls[0][3]);
    expect(await screen.findByText("That didn't go through. Please try again.")).toBeTruthy();
    press('extend-submit');
    await waitFor(() => expect(extendM).toHaveBeenCalledTimes(3));
    expect(extendM.mock.calls[2][3]).not.toBe(extendM.mock.calls[1][3]);
  });

  it('IDEMPOTENCY_KEY_REUSE says an earlier try may have gone through', async () => {
    extendM.mockRejectedValueOnce(apiError('IDEMPOTENCY_KEY_REUSE', 409));
    await openExtend();
    type('extend-reason', 'Festival week');
    press('extend-submit');
    expect(await screen.findByText(/may have gone through/)).toBeTruthy();
  });

  it('a double tap sends once', async () => {
    const d = deferred<unknown>();
    extendM.mockReturnValue(d.promise);
    await openExtend();
    type('extend-reason', 'Festival week');
    press('extend-submit');
    press('extend-submit');
    expect(extendM).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve({ invoice: detail(), agreementStatus: 'ACTIVE', extension: { id: 1, oldDueDate: '2026-10-10', newDueDate: '2026-10-11', reason: 'x', extendedBy: 1, createdAt: '' } }); });
    expect(extendM).toHaveBeenCalledTimes(1);
  });

  it('is off while offline', async () => {
    mockOffline = true;
    renderScreen();
    await screen.findByTestId('invoice-outstanding');
    expect(disabled('invoice-extend')).toBe(true);
    expect(disabled('invoice-record')).toBe(true);
  });

  it('keeps 48 dp targets that grow with the text', async () => {
    await openExtend();
    for (const id of ['extend-plus-7', 'extend-date-prev', 'extend-date-next']) {
      const style = StyleSheet.flatten(screen.getByTestId(id).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.height).toBeUndefined();
    }
    expect(screen.getByLabelText('Previous day').props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('7 days after the current due date')).toBeTruthy();
  });
});
