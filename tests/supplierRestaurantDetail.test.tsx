import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierCreditAgreementScreen from '@/app/supplier/credit/[id]';
import { ApiError } from '@/lib/api/errors';
import {
  approveCredit, confirmClaim, fetchAgreement, fetchAgreementClaims, fetchAgreementPayments, fetchInvoices,
  fetchLedger, modifyCredit, rejectClaim, rejectCredit, reinstateCredit, suspendCredit, closeCredit,
  previewPayment, recordSupplierPayment,
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
const apiError = (code: string, status: number, message = `server says ${code}`) =>
  new ApiError({ code, message, status });
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
  recordM.mockResolvedValue({
    receiptId: 1, amount: '1000.0000', method: 'CASH', reference: null, paidOn: '2026-10-06',
    allocations: [], agreement: { due: '8888.0000', overdue: '0.0000', available: '1.0000', status: 'ACTIVE' },
  });
});

async function openMore() {
  fireEvent.press(await screen.findByTestId('action-more'));
}

describe('hero, header and terms', () => {
  it('shows the four server figures and the terms summary', async () => {
    renderScreen();
    const hero = await screen.findByTestId('line-hero');
    expect(hero.props.accessibilityLabel).toBe(
      'They owe you ₹12,000.00, ₹36,000.00 available to them of ₹50,000.00 limit, ₹2,000.00 on hold');
    expect(screen.getByText('Spice Co')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    const terms = screen.getByTestId('terms-summary');
    expect(within(terms).getByText('₹50,000.00')).toBeTruthy();
    expect(within(terms).getByText('30 days')).toBeTruthy();
    expect(within(terms).getByText('3 days')).toBeTruthy();
    expect(within(terms).getByText('₹10,000.00')).toBeTruthy();
    expect(within(terms).getByText('v2')).toBeTruthy();
  });

  it('shows the overdue figure when something is overdue', async () => {
    agreementM.mockResolvedValue(agreement({ overdue: '4000.0000' }));
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(within(screen.getByTestId('line-hero-overdue')).getByText(/₹4(,000|K).* overdue/)).toBeTruthy();
    expect(screen.getByTestId('line-hero').props.accessibilityLabel).toContain('₹4,000.00 overdue');
  });

  it('shows a crore-scale amount and a long name without breaking', async () => {
    agreementM.mockResolvedValue(agreement({
      due: '999999999.9900', restaurantName: 'The Extraordinarily Long Restaurant Name Of Bengaluru And Beyond Pvt Ltd',
    }));
    renderScreen();
    const hero = await screen.findByTestId('line-hero');
    expect(hero.props.accessibilityLabel).toContain('₹99,99,99,999.99');
  });
});

describe('banners by status', () => {
  it('has none for an active line', async () => {
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.queryByTestId('line-banner')).toBeNull();
  });

  it('SYSTEM suspension says auto-paused with the overdue number and the threshold', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'SUSPENDED', suspensionSource: 'SYSTEM', overdue: '8200.0000', maxOverdueAmount: '5000.0000',
      suspensionReason: 'Overdue above the limit',
    }));
    renderScreen();
    expect(await screen.findByText(
      'Auto-paused: ₹8,200.00 overdue is above your ₹5,000.00 limit. It reopens when they pay, or you can reinstate.',
    )).toBeTruthy();
    expect(screen.getByText('Suspended')).toBeTruthy();
  });

  it('SUPPLIER suspension shows the reason', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'SUSPENDED', suspensionSource: 'SUPPLIER', suspensionReason: 'Cheque bounced',
    }));
    renderScreen();
    expect(await screen.findByText('You suspended this line')).toBeTruthy();
    expect(screen.getByText(/Cheque bounced/)).toBeTruthy();
  });

  it('APPROVED says the offer is not accepted yet, with its version and when it was sent', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'APPROVED', canFund: false, termsVersion: 3,
      latestRequest: { requestedLimit: '50000', requestedPeriodDays: 30, respondedAt: daysAgo(2) },
    }));
    renderScreen();
    expect(await screen.findByText('Offer v3 sent 2 days ago; not accepted yet')).toBeTruthy();
    expect(screen.queryByTestId('line-hero')).toBeNull();
  });

  it('REQUESTED shows what they asked for and the answers, no hero', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'REQUESTED', approvedLimit: '0', canFund: false,
      latestRequest: { requestedLimit: '30000.0000', requestedPeriodDays: 15, purpose: 'Weekly vegetables' },
    }));
    renderScreen();
    expect(await screen.findByText('₹30,000.00')).toBeTruthy();
    expect(screen.getByText('Weekly vegetables')).toBeTruthy();
    expect(screen.getByText('Approve As Asked')).toBeTruthy();
    expect(screen.queryByTestId('line-hero')).toBeNull();
    expect(screen.queryByTestId('line-actions')).toBeNull();
  });

  it('REJECTED shows the status and no actions at all', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'REJECTED', approvedLimit: '0', canFund: false }));
    renderScreen();
    expect(await screen.findByText('Rejected')).toBeTruthy();
    expect(screen.queryByTestId('line-hero')).toBeNull();
    expect(screen.queryByTestId('action-more')).toBeNull();
    expect(screen.queryByText('Approve As Asked')).toBeNull();
  });
});

describe('action bar (extension points)', () => {
  it('Record and Remind are both live (no "Coming soon")', async () => {
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.getByTestId('action-record').props.accessibilityState).not.toMatchObject({ disabled: true });
    expect(screen.queryByTestId('action-record-soon')).toBeNull();
    expect(screen.getByTestId('action-remind').props.accessibilityState).not.toMatchObject({ disabled: true });
    expect(screen.queryByTestId('action-remind-soon')).toBeNull();
  });

  it('hides Record and Remind from people who cannot collect, and keeps Statement', async () => {
    mockGranted = [];
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.queryByTestId('action-record')).toBeNull();
    expect(screen.queryByTestId('action-remind')).toBeNull();
    expect(screen.getByTestId('action-statement')).toBeTruthy();
  });

  it('opens the statement for this line', async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId('action-statement'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/supplier/credit/statement', params: { agreementId: '3' } });
  });

  it('lists Edit terms, Suspend and Close line in More for an active line, and not Write off yet', async () => {
    renderScreen();
    await openMore();
    expect(screen.getByTestId('more-terms')).toBeTruthy();
    expect(screen.getByTestId('more-suspend')).toBeTruthy();
    expect(screen.getByTestId('more-close')).toBeTruthy();
    expect(screen.queryByTestId('more-reinstate')).toBeNull();
    expect(screen.queryByTestId('more-writeoff')).toBeNull();
  });

  it('lists Reinstate, not Suspend, for a suspended line', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'SUSPENDED', suspensionSource: 'SUPPLIER', suspensionReason: 'x y z' }));
    renderScreen();
    await openMore();
    expect(screen.getByTestId('more-reinstate')).toBeTruthy();
    expect(screen.queryByTestId('more-suspend')).toBeNull();
  });
});

describe('payments to confirm', () => {
  it('lists this line\'s waiting claims, asking by status SUBMITTED', async () => {
    claimsM.mockResolvedValue([claim(1), claim(2, { amount: '1200.5000', method: 'CASH', reference: null })]);
    renderScreen();
    expect(await screen.findByTestId('detail-claim-1')).toBeTruthy();
    expect(screen.getByTestId('detail-claim-2')).toBeTruthy();
    expect(claimsM).toHaveBeenCalledWith('tok', 3, 'SUBMITTED');
    expect(screen.getByText('INV-11 · ₹5,000.00')).toBeTruthy();
  });

  it('has no section when nothing waits', async () => {
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.queryByText('Payments to confirm')).toBeNull();
  });

  it('Confirm opens the review sheet and confirming sends the claim with an idempotency key', async () => {
    claimsM.mockResolvedValue([claim(1)]);
    renderScreen();
    fireEvent.press(await screen.findByTestId('detail-claim-1-confirm'));
    fireEvent.press(await screen.findByTestId('claim-confirm'));
    await waitFor(() => expect(confirmM).toHaveBeenCalledTimes(1));
    expect(confirmM.mock.calls[0][1]).toBe(1);
    expect(typeof confirmM.mock.calls[0][2]).toBe('string');
  });

  it('Reject goes straight to the reason step and sends the reason', async () => {
    claimsM.mockResolvedValue([claim(1)]);
    renderScreen();
    fireEvent.press(await screen.findByTestId('detail-claim-1-reject'));
    fireEvent.press(await screen.findByTestId('reject-reason-Not received'));
    fireEvent.press(screen.getByTestId('claim-reject-send'));
    await waitFor(() => expect(rejectClaimM).toHaveBeenCalledWith('tok', 1, 'Not received'));
  });

  it('shows the claims to a user who may only view, with no Confirm or Reject', async () => {
    mockGranted = [];
    claimsM.mockResolvedValue([claim(1)]);
    renderScreen();
    expect(await screen.findByTestId('detail-claim-1')).toBeTruthy();
    expect(screen.queryByTestId('detail-claim-1-confirm')).toBeNull();
    expect(screen.queryByTestId('detail-claim-1-reject')).toBeNull();
  });

  it('lets CREDIT_COLLECT alone confirm', async () => {
    mockGranted = ['CREDIT_COLLECT'];
    claimsM.mockResolvedValue([claim(1)]);
    renderScreen();
    expect(await screen.findByTestId('detail-claim-1-confirm')).toBeTruthy();
  });
});

describe('open invoices, recent payments, settled', () => {
  it('shows open invoices with number, order, due chip and outstanding, from the server state', async () => {
    renderScreen();
    expect(await screen.findByText('INV-1')).toBeTruthy();
    expect(screen.getAllByText('Order #ORD-91').length).toBeGreaterThan(0);
    expect(screen.getByText('Due in 4 days')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('₹6,000.00 of ₹6,000.00 owed')).toBeTruthy();
  });

  it('keeps settled invoices collapsed until opened', async () => {
    invoicesM.mockResolvedValue([invoice(1), invoice(5, { status: 'PAID', dueState: 'PAID', outstanding: '0.0000', daysToDue: null })]);
    renderScreen();
    await screen.findByText('INV-1');
    expect(screen.queryByText('INV-5')).toBeNull();
    fireEvent.press(screen.getByTestId('settled-toggle'));
    expect(await screen.findByText('INV-5')).toBeTruthy();
  });

  it('badges each payment by who made it', async () => {
    paymentsM.mockResolvedValue(pageOf([
      payment(1, 'SUPPLIER_RECORDED'), payment(2, 'CLAIM_CONFIRMED'), payment(3, 'WALLET', { method: null, reference: null }),
    ]));
    renderScreen();
    expect(await screen.findByTestId('payment-source-1')).toBeTruthy();
    expect(within(screen.getByTestId('payment-source-1')).getByText('You recorded')).toBeTruthy();
    expect(within(screen.getByTestId('payment-source-2')).getByText('Confirmed claim')).toBeTruthy();
    expect(within(screen.getByTestId('payment-source-3')).getByText('Through Mandi')).toBeTruthy();
    expect(paymentsM).toHaveBeenCalledWith('tok', 3, expect.objectContaining({ page: 0 }));
  });

  it('shows the method and reference, and loads the next page on request', async () => {
    paymentsM.mockResolvedValueOnce(pageOf([payment(1, 'SUPPLIER_RECORDED')], { hasNext: true, total: 2 }));
    paymentsM.mockResolvedValueOnce(pageOf([payment(2, 'WALLET')], { page: 1 }));
    renderScreen();
    expect(await screen.findByText('UPI · ref REF1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('payments-more'));
    expect(await screen.findByTestId('agreement-payment-2')).toBeTruthy();
    expect(paymentsM.mock.calls[1][2]).toMatchObject({ page: 1 });
  });

  it('says so when nothing has been paid yet', async () => {
    renderScreen();
    expect(await screen.findByText('No payments yet.')).toBeTruthy();
  });
});

describe('terms editor', () => {
  async function openTerms() {
    renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-terms'));
    return screen.findByTestId('terms-sheet');
  }
  const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);

  it('starts from the line and keeps Save off until a reason is given', async () => {
    await openTerms();
    expect(screen.getByTestId('terms-limit').props.value).toBe('50000');
    expect(screen.getByTestId('terms-days').props.value).toBe('30');
    expect(screen.getByTestId('terms-grace').props.value).toBe('3');
    expect(screen.getByTestId('terms-cap').props.value).toBe('10000');
    expect(screen.getByTestId('terms-save').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('terms-blocked')).toBeTruthy();
    expect(screen.getByText(/A new period or grace applies only to new invoices/)).toBeTruthy();
    expect(screen.getByTestId('terms-effect').props.children).toMatch(/at once/);
  });

  it('refuses limit 0, period 0 or 181, grace 61, a cap under 1 rupee', async () => {
    await openTerms();
    type('terms-reason', 'Good history');
    const saveDisabled = () => screen.getByTestId('terms-save').props.accessibilityState?.disabled === true;
    expect(saveDisabled()).toBe(false);
    type('terms-limit', '0'); expect(saveDisabled()).toBe(true); type('terms-limit', '50000');
    type('terms-days', '0'); expect(saveDisabled()).toBe(true);
    type('terms-days', '181'); expect(saveDisabled()).toBe(true); type('terms-days', '45');
    type('terms-grace', '61'); expect(saveDisabled()).toBe(true); type('terms-grace', '3');
    type('terms-cap', '0.5'); expect(saveDisabled()).toBe(true); type('terms-cap', '');
    expect(saveDisabled()).toBe(false);
  });

  it('chips set the period', async () => {
    await openTerms();
    fireEvent.press(screen.getByTestId('terms-period-45'));
    expect(screen.getByTestId('terms-days').props.value).toBe('45');
  });

  it('sends the same modify body as before, plus grace and the cap it already had', async () => {
    await openTerms();
    type('terms-limit', '60000');
    fireEvent.press(screen.getByTestId('terms-period-45'));
    type('terms-reason', 'Good history');
    fireEvent.press(screen.getByTestId('terms-save'));
    await waitFor(() => expect(modifyM).toHaveBeenCalledTimes(1));
    expect(modifyM).toHaveBeenCalledWith('tok', 3, {
      approvedLimit: '60000', creditPeriodDays: 45, gracePeriodDays: 3, maxSingleOrderCredit: '10000', reason: 'Good history',
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Terms updated. The restaurant has been told.', 'success'));
  });

  it('sends once on a double tap', async () => {
    const d = deferred<unknown>();
    modifyM.mockReturnValue(d.promise);
    await openTerms();
    type('terms-reason', 'Good history');
    fireEvent.press(screen.getByTestId('terms-save'));
    fireEvent.press(screen.getByTestId('terms-save'));
    await waitFor(() => expect(modifyM).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('terms-save'));
    await act(async () => { await Promise.resolve(); });
    expect(modifyM).toHaveBeenCalledTimes(1);
    await act(async () => { d.resolve(agreement()); });
  });

  it('shows the server\'s message when it refuses a cut below what is drawn, and keeps the sheet open', async () => {
    modifyM.mockRejectedValue(apiError('VALIDATION_ERROR', 422, "You've already extended 14000 on this account, so the limit can't go below that."));
    await openTerms();
    type('terms-limit', '1000');
    type('terms-reason', 'Cut');
    fireEvent.press(screen.getByTestId('terms-save'));
    expect(await screen.findByText(/already extended 14000/)).toBeTruthy();
    expect(screen.getByTestId('terms-sheet')).toBeTruthy();
  });

  it('holds the limit to the floor only when the server sends minLimit', async () => {
    agreementM.mockResolvedValue(agreement({ minLimit: '14000.0000' }));
    await openTerms();
    type('terms-reason', 'Cut');
    type('terms-limit', '13999');
    expect(screen.getAllByText('Limit can go no lower than ₹14,000.00 (already drawn or on hold).').length).toBeGreaterThan(0);
    expect(screen.getByTestId('terms-save').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('hides the auto-pause threshold when the server does not send it', async () => {
    await openTerms();
    expect(screen.queryByTestId('terms-max-overdue')).toBeNull();
  });

  it('offers the auto-pause threshold when the server sends it', async () => {
    agreementM.mockResolvedValue(agreement({ maxOverdueAmount: '5000.0000' }));
    await openTerms();
    expect(screen.getByTestId('terms-max-overdue').props.value).toBe('5000');
  });

  it('is disabled while offline', async () => {
    mockOffline = true;
    await openTerms();
    type('terms-reason', 'Good history');
    expect(screen.getByTestId('terms-save').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('says a change on an approved offer needs their acceptance', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'APPROVED', canFund: false, termsVersion: 3 }));
    renderScreen();
    fireEvent.press(await screen.findByTestId('edit-terms'));
    expect(screen.getByTestId('terms-effect').props.children).toMatch(/has to accept/);
  });
});

describe('approve and decline a request', () => {
  const requested = () => agreement({
    status: 'REQUESTED', approvedLimit: '0', canFund: false,
    latestRequest: { requestedLimit: '30000.0000', requestedPeriodDays: 15, purpose: null, note: null },
  });

  it('Approve As Asked sends an empty body', async () => {
    agreementM.mockResolvedValue(requested());
    renderScreen();
    fireEvent.press(await screen.findByText('Approve As Asked'));
    await waitFor(() => expect(approveM).toHaveBeenCalledWith('tok', 3, {}));
  });

  it('Approve On My Terms uses the editor, starts from what they asked, and sends the modification', async () => {
    agreementM.mockResolvedValue(requested());
    renderScreen();
    fireEvent.press(await screen.findByText('Approve On My Terms'));
    expect(screen.getByTestId('terms-limit').props.value).toBe('30000');
    expect(screen.getByTestId('terms-days').props.value).toBe('15');
    fireEvent.changeText(screen.getByTestId('terms-limit'), '20000');
    fireEvent.press(screen.getByTestId('terms-save'));
    await waitFor(() => expect(approveM).toHaveBeenCalledWith('tok', 3, expect.objectContaining({
      approvedLimit: '20000', creditPeriodDays: 15,
    })));
  });

  it('Decline needs a reason, sends it, and returns to the list', async () => {
    agreementM.mockResolvedValue(requested());
    renderScreen();
    fireEvent.press(await screen.findByText('Decline'));
    expect(screen.getByTestId('decline-sheet-confirm').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('decline-sheet-reason'), 'Not extending credit yet');
    fireEvent.press(screen.getByTestId('decline-sheet-confirm'));
    await waitFor(() => expect(rejectCreditM).toHaveBeenCalledWith('tok', 3, 'Not extending credit yet'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/supplier/credit'));
  });

  it('hides the answers from a view-only user', async () => {
    mockGranted = [];
    agreementM.mockResolvedValue(requested());
    renderScreen();
    expect(await screen.findByText('₹30,000.00')).toBeTruthy();
    expect(screen.queryByText('Approve As Asked')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
  });
});

describe('suspend and reinstate sheets', () => {
  it('suspend needs a reason and sends it', async () => {
    renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-suspend'));
    expect(screen.getByTestId('suspend-sheet-confirm').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('suspend-sheet-reason'), 'Overdue balance');
    fireEvent.press(screen.getByTestId('suspend-sheet-confirm'));
    await waitFor(() => expect(suspendM).toHaveBeenCalledWith('tok', 3, 'Overdue balance'));
  });

  it('suspend refuses a two-character reason', async () => {
    renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-suspend'));
    fireEvent.changeText(screen.getByTestId('suspend-sheet-reason'), 'no');
    expect(screen.getByTestId('suspend-sheet-confirm').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('suspend-sheet-confirm'));
    expect(suspendM).not.toHaveBeenCalled();
  });

  it('reinstate needs a reason too', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'SUSPENDED', suspensionSource: 'SUPPLIER', suspensionReason: 'Held' }));
    renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-reinstate'));
    expect(screen.getByTestId('reinstate-sheet-confirm').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('reinstate-sheet-confirm'));
    expect(reinstateM).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('reinstate-sheet-reason'), 'They paid in cash');
    fireEvent.press(screen.getByTestId('reinstate-sheet-confirm'));
    await waitFor(() => expect(reinstateM).toHaveBeenCalledWith('tok', 3, 'They paid in cash'));
  });

  it('reinstating an automatic pause warns it may return', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'SUSPENDED', suspensionSource: 'SYSTEM', overdue: '8200.0000' }));
    renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-reinstate'));
    expect(screen.getByTestId('reinstate-sheet-note')).toBeTruthy();
    expect(screen.getByText(/may pause again on its own/)).toBeTruthy();
  });

  it('a supplier\'s own pause shows no such warning', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'SUSPENDED', suspensionSource: 'SUPPLIER', suspensionReason: 'Held' }));
    renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-reinstate'));
    expect(screen.queryByTestId('reinstate-sheet-note')).toBeNull();
  });

  it('shows the server message on a refused transition and refetches', async () => {
    suspendM.mockRejectedValue(apiError('INVALID_STATE_TRANSITION', 409, 'This line is already suspended.'));
    renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-suspend'));
    fireEvent.changeText(screen.getByTestId('suspend-sheet-reason'), 'Overdue balance');
    fireEvent.press(screen.getByTestId('suspend-sheet-confirm'));
    expect(await screen.findByText('This line is already suspended.')).toBeTruthy();
    await waitFor(() => expect(agreementM.mock.calls.length).toBeGreaterThan(1));
  });

  it('refreshes this line, the list and the receivables after a write', async () => {
    const { invalidate } = renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-suspend'));
    fireEvent.changeText(screen.getByTestId('suspend-sheet-reason'), 'Overdue balance');
    fireEvent.press(screen.getByTestId('suspend-sheet-confirm'));
    await waitFor(() => expect(suspendM).toHaveBeenCalled());
    await waitFor(() => {
      const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
      expect(keys).toContain(JSON.stringify(['credit-agreement', 3]));
      expect(keys).toContain(JSON.stringify(['store', 5, 'credit-agreements']));
      expect(keys).toContain(JSON.stringify(['store', 5, 'credit', 'receivables']));
    });
  });
});

describe('permissions: view-only', () => {
  it('shows everything and offers no action that changes the line', async () => {
    mockGranted = [];
    claimsM.mockResolvedValue([claim(1)]);
    paymentsM.mockResolvedValue(pageOf([payment(1, 'SUPPLIER_RECORDED')]));
    renderScreen();
    expect(await screen.findByTestId('line-hero')).toBeTruthy();
    expect(screen.getByText('INV-1')).toBeTruthy();
    expect(screen.getByTestId('agreement-payment-1')).toBeTruthy();
    expect(screen.queryByTestId('action-more')).toBeNull();
    expect(screen.queryByTestId('action-record')).toBeNull();
    expect(screen.queryByTestId('edit-terms')).toBeNull();
    expect(screen.getByTestId('action-statement')).toBeTruthy();
  });

  it('a user with only CREDIT_COLLECT can confirm claims but not edit terms', async () => {
    mockGranted = ['CREDIT_COLLECT'];
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.queryByTestId('action-more')).toBeNull();
    expect(screen.getByTestId('action-record')).toBeTruthy();
  });
});

describe('states', () => {
  it('shows a skeleton while loading', () => {
    agreementM.mockReturnValue(new Promise(() => undefined));
    renderScreen();
    expect(screen.queryByTestId('line-hero')).toBeNull();
    expect(screen.queryByText("Couldn't load this credit line.")).toBeNull();
  });

  it('shows an error with Try Again that refetches', async () => {
    agreementM.mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    fireEvent.press(await screen.findByText('Try Again'));
    expect(await screen.findByTestId('line-hero')).toBeTruthy();
  });

  it('shows a friendly page for a line that is not theirs (404), with no retry', async () => {
    agreementM.mockRejectedValue(apiError('NOT_FOUND', 404, 'nope'));
    renderScreen();
    expect(await screen.findByText('This credit line is not available to you')).toBeTruthy();
    expect(screen.queryByText('Try Again')).toBeNull();
  });

  it('shows the offline banner', async () => {
    mockOffline = true;
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('pull to refresh reloads the line, invoices, claims and payments', async () => {
    renderScreen();
    await screen.findByTestId('line-hero');
    await act(async () => { screen.getByTestId('mandi-screen-scroll').props.refreshControl.props.onRefresh(); });
    await waitFor(() => expect(agreementM).toHaveBeenCalledTimes(2));
    expect(invoicesM.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(claimsM.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(paymentsM.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('says so when no invoice has been raised', async () => {
    invoicesM.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Nothing invoiced on this line yet.')).toBeTruthy();
  });

  it('keeps the activity ledger under a collapsed section, loaded on demand', async () => {
    ledgerM.mockResolvedValue([{ id: 1, type: 'REPAYMENT', amount: '1500.0000', description: 'Repayment', availableAfter: '36000.0000' }]);
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(ledgerM).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('activity-toggle'));
    expect(await screen.findByText('Repayment')).toBeTruthy();
  });
});


describe('record a payment (M19)', () => {
  const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
  const press = (id: string) => fireEvent.press(screen.getByTestId(id));
  async function openRecord() {
    const view = renderScreen();
    fireEvent.press(await screen.findByTestId('action-record'));
    await screen.findByTestId('record-sheet');
    return view;
  }

  it('Record opens the sheet starting at the line total the server sent, chips from the server figures', async () => {
    agreementM.mockResolvedValue(agreement({ due: '12000.0000', overdue: '4000.0000' }));
    await openRecord();
    expect(screen.getByTestId('record-amount').props.value).toBe('12000');
    expect(screen.getByTestId('record-chip-full')).toHaveTextContent('Full ₹12,000.00');
    expect(screen.getByTestId('record-chip-overdue')).toHaveTextContent('Overdue only ₹4,000.00');
  });

  it('records with no invoiceIds when nothing is ticked, and refreshes the line, lists and receivables', async () => {
    const { invalidate } = await openRecord();
    press('record-method-UPI');
    type('record-reference', 'UTR12345');
    press('record-submit');
    await waitFor(() => expect(recordM).toHaveBeenCalledTimes(1));
    expect(recordM.mock.calls[0][2]).not.toHaveProperty('invoiceIds');
    expect(recordM.mock.calls[0][2]).toMatchObject({ amount: '12000.00', method: 'UPI', reference: 'UTR12345' });
    expect(await screen.findByTestId('record-success')).toBeTruthy();
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['store', 5, 'credit']), JSON.stringify(['credit-agreement', 3]),
      JSON.stringify(['store', 5, 'credit-claims']), JSON.stringify(['credit-invoice']),
    ]));
  });

  it('hides Record, the checkboxes and Record for selected from people who may not collect', async () => {
    mockGranted = [];
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.queryByTestId('action-record')).toBeNull();
    expect(screen.queryByTestId('pick-invoice-1')).toBeNull();
    expect(screen.queryByTestId('record-sheet')).toBeNull();
  });

  it('CREDIT_COLLECT alone can record', async () => {
    mockGranted = ['CREDIT_COLLECT'];
    renderScreen();
    expect(await screen.findByTestId('action-record')).toBeTruthy();
    expect(screen.getByTestId('pick-invoice-1')).toBeTruthy();
  });

  it('does not offer Record on a closed line', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'CLOSED' }));
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.getByTestId('action-record').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByTestId('pick-invoice-1')).toBeNull();
  });

  describe('Record for selected', () => {
    it('ticking invoices shows the button, and the sheet previews and records with exactly those invoiceIds', async () => {
      renderScreen();
      await screen.findByText('INV-1');
      expect(screen.queryByTestId('record-for-selected')).toBeNull();
      press('pick-invoice-1');
      press('pick-invoice-2');
      expect(screen.getByTestId('pick-invoice-1').props.accessibilityState).toMatchObject({ checked: true });
      expect(screen.getByTestId('pick-invoice-1').props.accessibilityLabel).toBe('Select INV-1 to record a payment');
      expect(screen.getAllByText('Selected')).toHaveLength(2);
      expect(screen.getByTestId('record-for-selected')).toHaveTextContent(/Record for 2 selected/);
      press('record-for-selected');
      await screen.findByTestId('record-sheet');
      // The server has no total for two invoices, so nothing is prefilled or added up.
      expect(screen.getByTestId('record-amount').props.value).toBe('');
      type('record-amount', '1000');
      await waitFor(() => expect(previewM).toHaveBeenCalledWith('tok', 3, { amount: '1000.00', invoiceIds: [2, 1] }));
      press('record-submit');
      await waitFor(() => expect(recordM).toHaveBeenCalledTimes(1));
      expect(recordM.mock.calls[0][2].invoiceIds).toEqual([2, 1]);
    });

    it('one ticked invoice starts at what it owes, and unticking removes the button', async () => {
      renderScreen();
      await screen.findByText('INV-1');
      press('pick-invoice-2');
      press('record-for-selected');
      await screen.findByTestId('record-sheet');
      expect(screen.getByTestId('record-amount').props.value).toBe('4000');
      expect(screen.queryByTestId('record-chip-overdue')).toBeNull();
    });

    it('opening an invoice row goes to its detail', async () => {
      renderScreen();
      fireEvent.press(await screen.findByTestId('credit-invoice-1'));
      expect(mockPush).toHaveBeenCalledWith('/supplier/credit/invoice/1');
    });
  });

  it('a waiting claim on a targeted invoice is flagged, and Review opens the claim sheet, keeping what was typed', async () => {
    claimsM.mockResolvedValue([claim(1, { invoiceId: 2, invoiceNumber: 'INV-2' })]);
    previewM.mockResolvedValue({
      amount: '4000.0000',
      allocations: [{ invoiceId: 2, invoiceNumber: 'INV-2', amount: '4000.0000', statusAfter: 'PAID' }],
      agreement: { due: '8000.0000', overdue: '0.0000', available: '1.0000', status: 'ACTIVE' },
      pendingClaims: [{ invoiceId: 2, invoiceNumber: 'INV-2', amount: '5000.0000' }],
    });
    renderScreen();
    await screen.findByTestId('detail-claim-1');
    fireEvent.press(screen.getByTestId('action-record'));
    type('record-amount', '4000');
    expect(await screen.findByTestId('record-pending-claim-2')).toHaveTextContent(/₹5,000.00 on INV-2/);
    press('record-review-claim-2');
    expect(await screen.findByTestId('claim-review-sheet')).toBeTruthy();
    expect(recordM).not.toHaveBeenCalled();
    // Back from the claim sheet the receipt form is as it was left.
    fireEvent.press(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByTestId('claim-review-sheet')).toBeNull());
    expect(screen.getByTestId('record-amount').props.value).toBe('4000');
  });
});

describe('close line (M25)', () => {
  async function openClose() {
    const view = renderScreen();
    await openMore();
    fireEvent.press(screen.getByTestId('more-close'));
    await screen.findByTestId('close-sheet');
    return view;
  }
  const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);

  it('is a More entry only for CREDIT_MODIFY', async () => {
    mockGranted = ['CREDIT_COLLECT'];
    renderScreen();
    await screen.findByTestId('line-hero');
    expect(screen.queryByTestId('action-more')).toBeNull();
  });

  it('needs a reason, sends it, closes the sheet and refreshes', async () => {
    const { invalidate } = await openClose();
    expect(screen.getByTestId('close-sheet-confirm').props.accessibilityState).toMatchObject({ disabled: true });
    type('close-sheet-reason', 'Relationship ended');
    fireEvent.press(screen.getByTestId('close-sheet-confirm'));
    await waitFor(() => expect(closeM).toHaveBeenCalledWith('tok', 3, 'Relationship ended'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Credit line closed', 'info'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-agreement', 3] });
    expect(screen.queryByTestId('close-sheet-error')).toBeNull();
  });

  it('shows the server refusal as sent, with the next step, and keeps the sheet open', async () => {
    closeM.mockRejectedValue(apiError('INVALID_STATE_TRANSITION', 409, 'They still owe ₹12,000.00 and ₹2,000.00 is on hold for open orders.'));
    await openClose();
    type('close-sheet-reason', 'Relationship ended');
    fireEvent.press(screen.getByTestId('close-sheet-confirm'));
    const error = await screen.findByTestId('close-sheet-error');
    expect(error).toHaveTextContent('They still owe ₹12,000.00 and ₹2,000.00 is on hold for open orders. Suspend it to stop new orders, close it once it is paid.');
    expect(screen.getByTestId('close-sheet')).toBeTruthy();
  });

  it('a double tap closes once', async () => {
    const d = deferred<unknown>();
    closeM.mockReturnValue(d.promise);
    await openClose();
    type('close-sheet-reason', 'Relationship ended');
    fireEvent.press(screen.getByTestId('close-sheet-confirm'));
    fireEvent.press(screen.getByTestId('close-sheet-confirm'));
    await act(async () => { d.resolve(agreement({ status: 'CLOSED' })); });
    expect(closeM).toHaveBeenCalledTimes(1);
  });
});

describe('offer wording (EXPIRED, offerExpiresOn)', () => {
  it('EXPIRED reads "Offer expired", with no position and no actions', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'EXPIRED', canFund: false }));
    renderScreen();
    expect((await screen.findAllByText('Offer expired')).length).toBeGreaterThan(0);
    expect(screen.getByText('They did not accept in time. They can ask for credit again.')).toBeTruthy();
    expect(screen.queryByTestId('line-hero')).toBeNull();
  });

  it('an APPROVED offer says how long it is valid', async () => {
    agreementM.mockResolvedValue(agreement({
      status: 'APPROVED', canFund: false, termsVersion: 3, offerExpiresOn: '2026-10-20',
      latestRequest: { requestedLimit: '50000', requestedPeriodDays: 30, respondedAt: daysAgo(2) },
    }));
    renderScreen();
    expect(await screen.findByText(/Offer valid until 20th Oct 2026\./)).toBeTruthy();
  });

  it('an APPROVED offer without an expiry says nothing about validity', async () => {
    agreementM.mockResolvedValue(agreement({ status: 'APPROVED', canFund: false, termsVersion: 3 }));
    renderScreen();
    await screen.findByText(/not accepted yet/);
    expect(screen.queryByText(/Offer valid until/)).toBeNull();
  });
});
