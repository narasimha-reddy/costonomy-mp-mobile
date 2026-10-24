import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RefundsScreen from '@/app/supplier/credit/refunds';
import { ApiError } from '@/lib/api/errors';
import { fetchRefundsDue, markRefundDue } from '@/services/credit';

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
  usePathname: () => '/supplier/credit/refunds',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
let mockGranted: string[] = ['CREDIT_COLLECT'];
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
  fetchRefundsDue: jest.fn(),
  markRefundDue: jest.fn(),
}));

const listM = fetchRefundsDue as jest.Mock;
const markM = markRefundDue as jest.Mock;
const row = (id: number, over: Record<string, unknown> = {}) => ({
  id, amount: '1500.0000', channel: 'OFF_PLATFORM', status: 'OPEN', note: null, invoiceId: 11, invoiceNumber: `INV-${id}`,
  creditNoteId: 4, creditNoteNumber: `CN-261006-00000${id}`, agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', createdAt: '2026-10-05T10:00:00Z', refundedAt: null, ...over,
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); mockGranted = ['CREDIT_COLLECT']; mockOffline = false; });
beforeEach(() => {
  jest.clearAllMocks();
  listM.mockImplementation(async (_t: string, _s: number, status?: string) =>
    (status === 'REFUNDED'
      ? [row(3, { status: 'REFUNDED', refundedAt: '2026-10-06T10:00:00Z', note: 'Sent by UPI' })]
      : [row(1), row(2, { channel: 'WALLET', amount: '800.0000' })]));
  markM.mockResolvedValue(row(1, { status: 'REFUNDED' }));
});
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><RefundsScreen /></QueryClientProvider>);
  return { invalidate };
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));

describe('Refunds to give back', () => {
  it('lists OPEN rows by default with restaurant, invoice, credit note and amount', async () => {
    renderScreen();
    await screen.findByTestId('refund-row-1');
    expect(listM).toHaveBeenCalledWith('tok', 5, 'OPEN');
    expect(screen.getByTestId('refund-row-1')).toHaveTextContent(/Spice Co/);
    expect(screen.getByTestId('refund-row-1')).toHaveTextContent(/INV-1/);
    expect(screen.getByTestId('refund-row-1')).toHaveTextContent(/CN-261006-000001/);
    expect(screen.getByTestId('refund-row-1')).toHaveTextContent(/₹1,500\.00/);
  });

  it('offers Mark as refunded on an off-platform row, and says our team settles a wallet row, with no action', async () => {
    renderScreen();
    await screen.findByTestId('refund-row-2');
    expect(screen.getByTestId('refund-mark-1')).toBeTruthy();
    expect(screen.queryByTestId('refund-mark-2')).toBeNull();
    expect(screen.getByTestId('refund-row-2')).toHaveTextContent(/Our team will settle this/);
  });

  it('hides Mark as refunded without CREDIT_COLLECT or CREDIT_MODIFY', async () => {
    mockGranted = ['CREDIT_VIEW'];
    renderScreen();
    await screen.findByTestId('refund-row-1');
    expect(screen.queryByTestId('refund-mark-1')).toBeNull();
  });

  it('marks refunded with an optional note, then refreshes', async () => {
    const { invalidate } = renderScreen();
    await screen.findByTestId('refund-row-1');
    press('refund-mark-1');
    expect(await screen.findByTestId('refund-sheet')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('refund-note'), ' Sent by UPI ');
    await act(async () => { press('refund-confirm'); });
    expect(markM).toHaveBeenCalledWith('tok', 1, 'Sent by UPI');
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/marked as refunded/i), 'success'));
    expect(invalidate).toHaveBeenCalled();
  });

  it('sends no note when none is written', async () => {
    renderScreen();
    await screen.findByTestId('refund-row-1');
    press('refund-mark-1');
    await act(async () => { press('refund-confirm'); });
    expect(markM).toHaveBeenCalledWith('tok', 1, undefined);
  });

  it('a double tap marks it once', async () => {
    let resolve!: (v: unknown) => void;
    markM.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderScreen();
    await screen.findByTestId('refund-row-1');
    press('refund-mark-1');
    await act(async () => { press('refund-confirm'); press('refund-confirm'); });
    expect(markM).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(row(1)); });
  });

  it('shows the team message when the server refuses a wallet row', async () => {
    markM.mockRejectedValue(new ApiError({ code: 'CREDIT_REFUND_OPS_ONLY', message: 'x', status: 409 }));
    renderScreen();
    await screen.findByTestId('refund-row-1');
    press('refund-mark-1');
    await act(async () => { press('refund-confirm'); });
    expect(await screen.findByTestId('refund-error')).toHaveTextContent(/Our team will settle this one\./);
  });

  it('switches to REFUNDED and shows the refund day and note without an action', async () => {
    renderScreen();
    await screen.findByTestId('refund-row-1');
    press('refunds-status-REFUNDED');
    await screen.findByTestId('refund-row-3');
    expect(listM).toHaveBeenLastCalledWith('tok', 5, 'REFUNDED');
    expect(screen.getByTestId('refund-row-3')).toHaveTextContent(/Refunded 6th Oct/);
    expect(screen.getByTestId('refund-row-3')).toHaveTextContent(/Sent by UPI/);
    expect(screen.queryByTestId('refund-mark-3')).toBeNull();
  });

  it('says so when there is nothing to give back', async () => {
    listM.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Nothing to give back right now.')).toBeTruthy();
  });

  it('shows an error with a retry when the list cannot load', async () => {
    listM.mockRejectedValue(new Error('x'));
    renderScreen();
    expect(await screen.findByTestId('refunds-error')).toBeTruthy();
  });

  it('cannot mark while offline', async () => {
    mockOffline = true;
    renderScreen();
    await screen.findByTestId('refund-row-1');
    expect(screen.getByTestId('refund-mark-1').props.accessibilityState?.disabled).toBe(true);
  });

  it('copes with a long restaurant name', async () => {
    listM.mockResolvedValue([row(1, { restaurantName: 'R'.repeat(120), amount: '99999999999.0000' })]);
    renderScreen();
    expect(await screen.findByTestId('refund-row-1')).toHaveTextContent(/₹99,99,99,99,999\.00/);
  });
});
