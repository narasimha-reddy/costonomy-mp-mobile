import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PayoutsScreen from '@/app/supplier/credit/payouts';
import { fetchPayments, fetchPayouts } from '@/services/credit';
import { CsvExportError, fetchCollectionsCsv, shareCsv } from '@/services/creditExport';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), setParams: mockSetParams, canGoBack: () => true }),
  usePathname: () => '/supplier/credit/payouts',
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/components/supplier/StoreSelector', () => ({ StoreSelector: () => null }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
const mockToast = jest.fn();
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: mockToast }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/services/creditExport', () => ({
  ...jest.requireActual('@/services/creditExport'),
  fetchCollectionsCsv: jest.fn(),
  shareCsv: jest.fn(),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchPayouts: jest.fn(),
  fetchPayments: jest.fn(),
}));

const payoutsM = fetchPayouts as jest.Mock;
const paymentsM = fetchPayments as jest.Mock;
const csvM = fetchCollectionsCsv as jest.Mock;
const shareM = shareCsv as jest.Mock;

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><PayoutsScreen /></QueryClientProvider>);
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockOffline = false;
  payoutsM.mockResolvedValue({
    summary: { pendingNet: '0.0000', appliedNetThisMonth: '0.0000' }, items: [], page: 0, size: 20, totalElements: 0, totalPages: 1, hasNext: false,
  });
  paymentsM.mockResolvedValue({ items: [], page: 0, size: 20, total: 0, hasNext: false });
  csvM.mockResolvedValue({ filename: 'collections-5.csv', body: 'a,b' });
  shareM.mockResolvedValue(undefined);
});

describe('Download collections CSV', () => {
  it('is only on the Recorded by you view', async () => {
    renderScreen();
    await waitFor(() => expect(payoutsM).toHaveBeenCalled());
    expect(screen.queryByTestId('collections-csv')).toBeNull();
    press('tab-recorded');
    expect(await screen.findByTestId('collections-csv')).toBeTruthy();
  });

  it('fetches the CSV for the store and shares it', async () => {
    renderScreen();
    press('tab-recorded');
    await screen.findByTestId('collections-csv');
    await act(async () => { press('collections-csv'); });
    expect(csvM).toHaveBeenCalledWith('tok', 5, expect.any(Object));
    expect(shareM).toHaveBeenCalledWith({ filename: 'collections-5.csv', body: 'a,b' });
  });

  it('passes the period and source on screen', async () => {
    mockParams = { period: 'd30' };
    renderScreen();
    press('tab-recorded');
    press('source-WALLET');
    await screen.findByTestId('collections-csv');
    await act(async () => { press('collections-csv'); });
    expect(csvM).toHaveBeenCalledWith('tok', 5, expect.objectContaining({
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), source: 'WALLET',
    }));
  });

  it('a double tap downloads once', async () => {
    let finish!: (v: unknown) => void;
    csvM.mockReturnValue(new Promise((r) => { finish = r; }));
    renderScreen();
    press('tab-recorded');
    await screen.findByTestId('collections-csv');
    await act(async () => { press('collections-csv'); press('collections-csv'); });
    expect(csvM).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ filename: 'x.csv', body: '' }); });
  });

  it('says it in plain words when there are too many rows', async () => {
    csvM.mockRejectedValue(new CsvExportError('too_large'));
    renderScreen();
    press('tab-recorded');
    await screen.findByTestId('collections-csv');
    await act(async () => { press('collections-csv'); });
    expect(screen.getByTestId('collections-csv-error')).toHaveTextContent(/Too many rows\. Pick a shorter period\./);
  });

  it('offline: does not call the server', async () => {
    mockOffline = true;
    renderScreen();
    press('tab-recorded');
    await screen.findByTestId('collections-csv');
    await act(async () => { press('collections-csv'); });
    expect(csvM).not.toHaveBeenCalled();
    expect(screen.getByTestId('collections-csv-error')).toHaveTextContent(/You are offline\. Connect and try again\./);
  });
});
