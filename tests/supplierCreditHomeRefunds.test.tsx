import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierCreditScreen from '@/app/supplier/(tabs)/credit';
import {
  fetchReceivableRestaurants, fetchReceivables, fetchRefundsDue, fetchStoreAgreements,
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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/supplier/credit',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/components/supplier/SupplierHeader', () => ({ SupplierHeader: () => null }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchStoreAgreements: jest.fn(),
  fetchReceivables: jest.fn(),
  fetchReceivableRestaurants: jest.fn(),
  fetchRefundsDue: jest.fn(),
}));

const refundsM = fetchRefundsDue as jest.Mock;
const refund = (id: number) => ({ id, amount: '1.0000', channel: 'OFF_PLATFORM', status: 'OPEN' });

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
beforeEach(() => {
  jest.clearAllMocks();
  (fetchReceivables as jest.Mock).mockResolvedValue({
    asOf: '2026-10-06', totalReceivable: 100, overdue: 0, inGrace: 0, dueToday: 0, dueThisWeek: 0, collectedThisMonth: 0,
    exposure: { extended: 0, drawn: 0, availableToLend: 0 },
    counts: { restaurants: 1, linesActive: 1, linesSuspended: 0, requestsPending: 0, claimsWaiting: 0, overdueRestaurants: 0 },
    pendingActions: [],
  });
  (fetchReceivableRestaurants as jest.Mock).mockResolvedValue({ items: [], page: 0, size: 20, total: 0, hasNext: false });
  (fetchStoreAgreements as jest.Mock).mockResolvedValue([]);
});
function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><SupplierCreditScreen /></QueryClientProvider>);
}

describe('Receivables home: refunds to give back', () => {
  it('shows "Refunds to give back (N)" from one OPEN query and opens the refunds screen', async () => {
    refundsM.mockResolvedValue([refund(1), refund(2), refund(3)]);
    renderTab();
    const entry = await screen.findByTestId('refunds-entry');
    expect(entry).toHaveTextContent(/Refunds to give back \(3\)/);
    expect(refundsM).toHaveBeenCalledTimes(1);
    expect(refundsM).toHaveBeenCalledWith('tok', 5, 'OPEN');
    fireEvent.press(entry);
    expect(mockPush).toHaveBeenCalledWith('/supplier/credit/refunds');
  });

  it('is absent when there are none', async () => {
    refundsM.mockResolvedValue([]);
    renderTab();
    await waitFor(() => expect(refundsM).toHaveBeenCalled());
    await screen.findByTestId('receivables-actions');
    expect(screen.queryByTestId('refunds-entry')).toBeNull();
  });

  it('is absent, and the page still works, when the query fails', async () => {
    refundsM.mockRejectedValue(new Error('x'));
    renderTab();
    await screen.findByTestId('receivables-actions');
    expect(screen.queryByTestId('refunds-entry')).toBeNull();
  });
});
