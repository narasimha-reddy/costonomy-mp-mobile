import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierCreditAgreementScreen from '@/app/supplier/credit/[id]';
import { ApiError } from '@/lib/api/errors';
import {
  approveCredit, confirmClaim, fetchAgreement, fetchAgreementClaims, fetchAgreementPayments, fetchInvoices,
  fetchLedger, modifyCredit, rejectClaim, rejectCredit, reinstateCredit, suspendCredit, closeCredit,
  previewPayment, recordSupplierPayment, reverseReceipt, reversePayment, previewReminder, sendReminder, fetchReminders,
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
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  usePathname: () => '/supplier/credit/3',
  useLocalSearchParams: () => ({ id: '3' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
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
  fetchAgreement: jest.fn(),
  fetchInvoices: jest.fn(),
  fetchLedger: jest.fn(),
  fetchAgreementClaims: jest.fn(),
  fetchAgreementPayments: jest.fn(),
  approveCredit: jest.fn(),
  modifyCredit: jest.fn(),
  rejectCredit: jest.fn(),
  suspendCredit: jest.fn(),
  reinstateCredit: jest.fn(),
  confirmClaim: jest.fn(),
  rejectClaim: jest.fn(),
  closeCredit: jest.fn(),
  previewPayment: jest.fn(),
  recordSupplierPayment: jest.fn(),
  reverseReceipt: jest.fn(),
  reversePayment: jest.fn(),
  previewReminder: jest.fn(),
  sendReminder: jest.fn(),
  fetchReminders: jest.fn(),
}));

const agreementM = fetchAgreement as jest.Mock;
const invoicesM = fetchInvoices as jest.Mock;
const ledgerM = fetchLedger as jest.Mock;
const claimsM = fetchAgreementClaims as jest.Mock;
const paymentsM = fetchAgreementPayments as jest.Mock;
const approveM = approveCredit as jest.Mock;
const modifyM = modifyCredit as jest.Mock;
const rejectCreditM = rejectCredit as jest.Mock;
const suspendM = suspendCredit as jest.Mock;
const reinstateM = reinstateCredit as jest.Mock;
const confirmM = confirmClaim as jest.Mock;
const rejectClaimM = rejectClaim as jest.Mock;
const closeM = closeCredit as jest.Mock;
const previewM = previewPayment as jest.Mock;
const recordM = recordSupplierPayment as jest.Mock;
const reverseReceiptM = reverseReceipt as jest.Mock;
const reversePaymentM = reversePayment as jest.Mock;
const previewReminderM = previewReminder as jest.Mock;
const sendReminderM = sendReminder as jest.Mock;
const remindersM = fetchReminders as jest.Mock;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const agreement = (over: Record<string, unknown> = {}) => ({
  id: 3, outletId: 7, outletName: 'Indiranagar', restaurantName: 'Spice Co', outletLocality: 'Indiranagar',
  outletCity: 'Bengaluru', distanceKm: null, supplierStoreId: 5, storeName: 'Main', supplierName: 'Fresh Farms',
  status: 'ACTIVE', approvedLimit: '50000.0000', reserved: '2000.0000', utilized: '12000.0000', available: '36000.0000',
  due: '12000.0000', overdue: '0.0000', creditPeriodDays: 30, gracePeriodDays: 3, maxSingleOrderCredit: '10000.0000',
  termsVersion: 2, effectiveFrom: null, reviewDate: null, suspensionReason: null, canFund: true, activatedAt: null,
  latestRequest: null, ...over,
});
const invoice = (id: number, over: Record<string, unknown> = {}) => ({
  id, invoiceNumber: `INV-${id}`, creditAgreementId: 3, supplierOrderId: 90 + id, orderNumber: `ORD-${90 + id}`,
  status: 'ISSUED', amount: '6000.0000', paidAmount: '0.0000', outstanding: '6000.0000', dueDate: '2026-10-10',
  overdueAfter: '2026-10-13', issuedAt: '2026-09-10T00:00:00Z', settledAt: null, dueState: 'DUE_SOON', daysToDue: 4, ...over,
});
const claim = (id: number, over: Record<string, unknown> = {}) => ({
  id, invoiceId: 10 + id, invoiceNumber: `INV-${10 + id}`, agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', amount: '5000.0000', method: 'UPI', reference: `UTR${id}`, paidOn: '2026-10-01',
  note: null, status: 'SUBMITTED', decisionNote: null, confirmedAmount: null, creditPaymentId: null,
  createdAt: daysAgo(3), decidedAt: null, ...over,
});
const payment = (id: number, source: string, over: Record<string, unknown> = {}) => ({
  id, paidAt: '2026-10-02T06:00:00Z', paidOn: '2026-10-02', agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', invoiceId: 20 + id, invoiceNumber: `INV-${20 + id}`, amount: '1500.0000', source,
  method: 'UPI', reference: `REF${id}`, ...over,
});
const pageOf = (items: unknown[], over: Record<string, unknown> = {}) =>
  ({ items, page: 0, size: 20, total: items.length, hasNext: false, ...over });

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockOffline = false; mockGranted = ['CREDIT_MODIFY']; });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><SupplierCreditAgreementScreen /></QueryClientProvider>);
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  agreementM.mockResolvedValue(agreement());
  invoicesM.mockResolvedValue([invoice(1), invoice(2, { dueState: 'OVERDUE', daysToDue: -3, outstanding: '4000.0000' })]);
  ledgerM.mockResolvedValue([]);
  claimsM.mockResolvedValue([]);
  paymentsM.mockResolvedValue(pageOf([]));
  approveM.mockResolvedValue(agreement());
  modifyM.mockResolvedValue(agreement());
  suspendM.mockResolvedValue(agreement({ status: 'SUSPENDED' }));
  reinstateM.mockResolvedValue(agreement());
  rejectCreditM.mockResolvedValue(agreement({ status: 'REJECTED' }));
  confirmM.mockResolvedValue(claim(1, { status: 'CONFIRMED', confirmedAmount: '5000.0000' }));
  rejectClaimM.mockResolvedValue(claim(1, { status: 'REJECTED' }));
  closeM.mockResolvedValue(agreement({ status: 'CLOSED' }));
  previewM.mockResolvedValue({
    amount: '1000.0000',
    allocations: [{ invoiceId: 1, invoiceNumber: 'INV-1', amount: '1000.0000', statusAfter: 'PARTIALLY_PAID' }],
    agreement: { due: '8888.0000', overdue: '0.0000', available: '1.0000', status: 'ACTIVE' },
    pendingClaims: [],
  });
  reverseReceiptM.mockReset(); reversePaymentM.mockReset(); previewReminderM.mockReset(); sendReminderM.mockReset(); remindersM.mockReset();
  reverseReceiptM.mockResolvedValue({ receiptId: 9, paymentId: null, amount: '1500.0000', reason: 'x', reversedAt: '2026-10-06T10:00:00Z', allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' } });
  reversePaymentM.mockResolvedValue({ receiptId: null, paymentId: 31, amount: '1500.0000', reason: 'x', reversedAt: '2026-10-06T10:00:00Z', allocations: [], agreement: { due: '0', overdue: '0', available: '0', status: 'ACTIVE' } });
  previewReminderM.mockResolvedValue({
    canRemind: true, reason: null, nextAllowedAt: null, message: 'Spice Co: ₹4,000 overdue.', channels: ['IN_APP', 'PUSH'],
    status: 'SENT', sendAt: null,
    invoices: [{ invoiceId: 2, invoiceNumber: 'INV-2', outstanding: '4000.0000', dueDate: '2026-10-01', dueState: 'OVERDUE', included: true, skipReason: null }],
  });
  sendReminderM.mockResolvedValue({ id: 7, status: 'SENT', sendAt: null });
  remindersM.mockResolvedValue(pageOf([]));
  recordM.mockResolvedValue({
    receiptId: 1, amount: '1000.0000', method: 'CASH', reference: null, paidOn: '2026-10-06',
    allocations: [], agreement: { due: '8888.0000', overdue: '0.0000', available: '1.0000', status: 'ACTIVE' },
  });
});


const recorded = (id: number, over: Record<string, unknown> = {}) => payment(id, 'SUPPLIER_RECORDED', {
  receiptId: 9, reversible: true, reversibleUntil: '2026-10-12', reversedAt: null, ...over });

describe('Undo a recorded payment (M26)', () => {
  it('offers Undo on a reversible payment, with the last day', async () => {
    paymentsM.mockResolvedValue(pageOf([recorded(31)]));
    renderScreen();
    expect(await screen.findByTestId('undo-payment-31')).toBeTruthy();
    expect(screen.getByText('Undo until 12th Oct')).toBeTruthy();
  });

  it('does not offer Undo when the server says reversible is false', async () => {
    paymentsM.mockResolvedValue(pageOf([recorded(31, { reversible: false })]));
    renderScreen();
    await screen.findByTestId('agreement-payment-31');
    expect(screen.queryByTestId('undo-payment-31')).toBeNull();
  });

  it('does not offer Undo without CREDIT_COLLECT or CREDIT_MODIFY', async () => {
    mockGranted = ['CREDIT_VIEW'];
    paymentsM.mockResolvedValue(pageOf([recorded(31)]));
    renderScreen();
    await screen.findByTestId('agreement-payment-31');
    expect(screen.queryByTestId('undo-payment-31')).toBeNull();
  });

  it('CREDIT_COLLECT alone is enough', async () => {
    mockGranted = ['CREDIT_COLLECT'];
    paymentsM.mockResolvedValue(pageOf([recorded(31)]));
    renderScreen();
    expect(await screen.findByTestId('undo-payment-31')).toBeTruthy();
  });

  it('marks a reversed payment Cancelled and does not offer Undo', async () => {
    paymentsM.mockResolvedValue(pageOf([recorded(31, { reversible: false, reversedAt: '2026-10-05T10:00:00Z', reversibleUntil: null })]));
    renderScreen();
    expect(await screen.findByTestId('payment-cancelled-31')).toBeTruthy();
    expect(screen.queryByTestId('undo-payment-31')).toBeNull();
  });

  it('undoes through the receipt, says what happened and refreshes the line', async () => {
    paymentsM.mockResolvedValue(pageOf([recorded(31)]));
    const { invalidate } = renderScreen();
    fireEvent.press(await screen.findByTestId('undo-payment-31'));
    fireEvent.press(await screen.findByTestId('undo-reason-Wrong restaurant'));
    await act(async () => { fireEvent.press(screen.getByTestId('undo-sheet-confirm')); });
    expect(reverseReceiptM).toHaveBeenCalledWith('tok', 9, 'Wrong restaurant', expect.any(String));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Payment cancelled. They owe ₹1,500.00 again.', 'success'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['store', 5, 'credit'] });
  });

  it('undoes a payment with no receipt through the payment endpoint', async () => {
    paymentsM.mockResolvedValue(pageOf([recorded(31, { receiptId: null })]));
    renderScreen();
    fireEvent.press(await screen.findByTestId('undo-payment-31'));
    fireEvent.press(await screen.findByTestId('undo-reason-Cheque bounced'));
    await act(async () => { fireEvent.press(screen.getByTestId('undo-sheet-confirm')); });
    expect(reversePaymentM).toHaveBeenCalledWith('tok', 31, 'Cheque bounced', expect.any(String));
  });

  it('shows the server refusal in plain words and keeps the sheet open', async () => {
    reverseReceiptM.mockRejectedValue(new ApiError({
      code: 'CREDIT_REVERSAL_NO_HEADROOM', status: 422, message: 'x', details: { needed: 5000, available: 3000, shortBy: 2000 } }));
    paymentsM.mockResolvedValue(pageOf([recorded(31)]));
    renderScreen();
    fireEvent.press(await screen.findByTestId('undo-payment-31'));
    fireEvent.press(await screen.findByTestId('undo-reason-Other'));
    fireEvent.changeText(screen.getByTestId('undo-sheet-reason'), 'Typed twice');
    await act(async () => { fireEvent.press(screen.getByTestId('undo-sheet-confirm')); });
    expect(screen.getByText('Raise their limit by ₹2,000.00 first, or suspend the line.')).toBeTruthy();
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe('Remind (M26)', () => {
  it('opens the reminder preview from the Remind button and sends', async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId('action-remind'));
    expect(await screen.findByText('Spice Co: ₹4,000 overdue.')).toBeTruthy();
    expect(screen.queryByTestId('action-remind-soon')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId('remind-send')); });
    expect(sendReminderM).toHaveBeenCalledWith('tok', 3, {}, expect.any(String));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Reminder sent', 'success'));
  });

  it('says when a queued reminder will go', async () => {
    previewReminderM.mockResolvedValue({ ...(await previewReminderM()), status: 'QUEUED', sendAt: '2026-10-07T03:30:00Z' });
    sendReminderM.mockResolvedValue({ id: 7, status: 'QUEUED', sendAt: '2026-10-07T03:30:00Z' });
    renderScreen();
    fireEvent.press(await screen.findByTestId('action-remind'));
    await screen.findByTestId('remind-queued');
    await act(async () => { fireEvent.press(screen.getByTestId('remind-send')); });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('It will be sent at 9 am on 7th Oct.', 'success'));
  });

  it('hides Remind for people who cannot collect', async () => {
    mockGranted = ['CREDIT_VIEW'];
    renderScreen();
    await screen.findByTestId('line-actions');
    expect(screen.queryByTestId('action-remind')).toBeNull();
    expect(previewReminderM).not.toHaveBeenCalled();
  });

  it('has a Remind button that is off while offline', async () => {
    mockOffline = true;
    renderScreen();
    const button = await screen.findByTestId('action-remind');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('lists the reminders sent once the history is opened', async () => {
    remindersM.mockResolvedValue(pageOf([{
      id: 7, agreementId: 3, kind: 'AUTO_DUE', status: 'SENT', channels: ['IN_APP', 'PUSH'], message: 'm', note: null,
      invoiceIds: [1], skipped: [], requestedAt: '2026-10-06T04:30:00Z', sendAt: null, sentAt: '2026-10-06T04:30:00Z', createdBy: null,
    }]));
    renderScreen();
    fireEvent.press(await screen.findByTestId('reminders-toggle'));
    expect(await screen.findByTestId('reminder-7')).toBeTruthy();
    expect(screen.getByText('Due today')).toBeTruthy();
  });
});
