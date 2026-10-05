import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreditAgreementScreen from '@/app/restaurant/credit/[id]';
import { ApiError } from '@/lib/api/errors';
import { acceptAgreement, fetchAgreement, fetchCreditSummary, fetchInvoices } from '@/services/credit';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockId = '3';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/restaurant/credit/3',
  useLocalSearchParams: () => ({ id: mockId }),
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
const mockSheet = jest.fn();
jest.mock('@/components/credit/PayFromWalletSheet', () => ({
  PayFromWalletSheet: (props: Record<string, unknown>) => { mockSheet(props); return null; },
}));
jest.mock('@/services/credit', () => ({
  acceptAgreement: jest.fn(),
  fetchAgreement: jest.fn(),
  fetchCreditSummary: jest.fn(),
  fetchInvoices: jest.fn(),
}));

const agreementM = fetchAgreement as jest.Mock;
const summaryM = fetchCreditSummary as jest.Mock;
const invoicesM = fetchInvoices as jest.Mock;
const acceptM = acceptAgreement as jest.Mock;

const agreement = (o: Record<string, unknown> = {}) => ({
  id: 3, status: 'ACTIVE', supplierName: 'Acme Foods', storeName: 'Acme Main',
  approvedLimit: '50000', reserved: '0', utilized: '9200', available: '40800',
  due: '9200', overdue: '0', creditPeriodDays: 30, gracePeriodDays: 5,
  maxSingleOrderCredit: null, termsVersion: null, suspensionReason: null,
  canFund: true, latestRequest: null, ...o,
});
const inv = (id: number, o: Record<string, unknown> = {}) => ({
  id, invoiceNumber: `INV-${id}`, creditAgreementId: 3, supplierOrderId: 100 + id, status: 'ISSUED',
  amount: '9200', paidAmount: '2700', outstanding: '6500', dueDate: '2026-10-20', dueState: 'DUE_LATER',
  daysToDue: 15, settledAt: null, ...o,
});
const MODIFIED = agreement({
  status: 'APPROVED', canFund: false, due: '0', termsVersion: 4, latestRequest: { status: 'MODIFIED', responseNote: null },
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockMayRepay = true; mockId = '3'; });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <CreditAgreementScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  agreementM.mockResolvedValue(agreement());
  summaryM.mockResolvedValue({ walletRepayEnabled: true });
  invoicesM.mockResolvedValue([]);
});

describe('B12 / P04: CREDIT_REPAY on the supplier screen', () => {
  it('without it: no Pay bar, no I paid, no pay sheet', async () => {
    mockMayRepay = false;
    renderScreen();
    await screen.findByTestId('credit-owed');
    expect(screen.queryByTestId('credit-pay-bar-button')).toBeNull();
    expect(screen.queryByTestId('credit-i-paid-bar-button')).toBeNull();
    expect(mockSheet).not.toHaveBeenCalled();
  });

  it('with it: both buttons and the sheet', async () => {
    renderScreen();
    expect(await screen.findByTestId('credit-pay-bar-button')).toBeTruthy();
    expect(screen.getByTestId('credit-i-paid-bar-button')).toBeTruthy();
    expect(mockSheet).toHaveBeenCalled();
  });

  it('without it the statement and the invoices are still reachable', async () => {
    mockMayRepay = false;
    invoicesM.mockResolvedValue([inv(11)]);
    renderScreen();
    expect(await screen.findByTestId('credit-invoice-11')).toBeTruthy();
    expect(screen.getByTestId('credit-statement-row')).toBeTruthy();
  });
});

describe('S12 / B8: accepting terms names the version on screen', () => {
  it('sends the termsVersion of the agreement', async () => {
    agreementM.mockResolvedValue(MODIFIED);
    acceptM.mockResolvedValue(agreement());
    renderScreen();
    fireEvent.press(await screen.findByText('Accept These Terms'));
    await waitFor(() => expect(acceptM).toHaveBeenCalledWith('tok', 3, 4));
  });

  it('CREDIT_TERMS_CHANGED refetches the agreement and says to review the terms again', async () => {
    agreementM.mockResolvedValue(MODIFIED);
    acceptM.mockRejectedValue(new ApiError({ code: 'CREDIT_TERMS_CHANGED', message: 'server said', status: 409 }));
    renderScreen();
    fireEvent.press(await screen.findByText('Accept These Terms'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('The supplier changed the terms. Please review them again.', 'error'));
    await waitFor(() => expect(agreementM.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(mockToast).not.toHaveBeenCalledWith('server said', 'error');
  });

  it('shows the new terms after the refetch, and a second accept sends the new version', async () => {
    agreementM.mockResolvedValueOnce(MODIFIED)
      .mockResolvedValue({ ...MODIFIED, termsVersion: 5, approvedLimit: '30000' });
    acceptM.mockRejectedValueOnce(new ApiError({ code: 'CREDIT_TERMS_CHANGED', message: 'x', status: 409 }))
      .mockResolvedValue(agreement());
    renderScreen();
    fireEvent.press(await screen.findByText('Accept These Terms'));
    await screen.findByText(/₹30,000\.00 over 30 days/);
    fireEvent.press(screen.getByText('Accept These Terms'));
    await waitFor(() => expect(acceptM).toHaveBeenLastCalledWith('tok', 3, 5));
  });

  it('another error keeps showing the server message', async () => {
    agreementM.mockResolvedValue(MODIFIED);
    acceptM.mockRejectedValue(new ApiError({ code: 'SOMETHING', message: 'nope', status: 422 }));
    renderScreen();
    fireEvent.press(await screen.findByText('Accept These Terms'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('nope', 'error'));
  });

  it('an old API without a terms version sends no body version', async () => {
    agreementM.mockResolvedValue({ ...MODIFIED, termsVersion: undefined });
    acceptM.mockResolvedValue(agreement());
    renderScreen();
    fireEvent.press(await screen.findByText('Accept These Terms'));
    await waitFor(() => expect(acceptM).toHaveBeenCalledWith('tok', 3, undefined));
  });
});

describe('U14: bad route params', () => {
  it('/credit/abc shows a friendly page and sends no request', async () => {
    mockId = 'abc';
    renderScreen();
    expect(await screen.findByTestId('credit-not-found')).toBeTruthy();
    expect(screen.getByText("This credit line isn't available")).toBeTruthy();
    expect(agreementM).not.toHaveBeenCalled();
    expect(invoicesM).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Go back'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('D / U rows', () => {
  it('D01: no reportableAmount or openClaimsAmount (old API): I paid is offered and no waiting line', async () => {
    renderScreen();
    expect(await screen.findByTestId('credit-i-paid-bar-button')).toBeTruthy();
    expect(screen.queryByTestId('credit-reported')).toBeNull();
  });

  it('null dates: an invoice with no due date and no dueState renders', async () => {
    invoicesM.mockResolvedValue([inv(11, { dueDate: null, dueState: undefined, daysToDue: undefined, supplierOrderId: null })]);
    renderScreen();
    expect(await screen.findByTestId('credit-invoice-11')).toBeTruthy();
  });

  it('U12: two quick presses on an invoice row push once', async () => {
    invoicesM.mockResolvedValue([inv(11)]);
    renderScreen();
    const row = await screen.findByTestId('credit-invoice-11');
    fireEvent.press(row);
    fireEvent.press(row);
    expect(mockPush.mock.calls.filter((c) => c[0] === '/restaurant/credit/invoice/11')).toHaveLength(1);
  });

  it('U12: two quick presses on Statement push once', async () => {
    renderScreen();
    const row = await screen.findByTestId('credit-statement-row');
    fireEvent.press(row);
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('D07: an emoji supplier name stays in a one-line header', async () => {
    agreementM.mockResolvedValue(agreement({ supplierName: `🍅 ${'Long Supplier '.repeat(10)}` }));
    renderScreen();
    await screen.findByTestId('credit-owed');
    expect(screen.getByText(/🍅 Long Supplier/).props.numberOfLines).toBe(1);
  });
});
