import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierCreditScreen from '@/app/supplier/(tabs)/credit';
import { fetchStoreAgreements, fetchStoreClaims } from '@/services/credit';

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
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchStoreAgreements: jest.fn(),
  fetchStoreClaims: jest.fn(),
}));

const claimsM = fetchStoreClaims as jest.Mock;
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><SupplierCreditScreen /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchStoreAgreements as jest.Mock).mockResolvedValue([]);
});

describe('Claims waiting row on the supplier Credit tab', () => {
  it('shows the count and opens the claims inbox', async () => {
    claimsM.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    renderTab();
    fireEvent.press(await screen.findByTestId('credit-claims-waiting'));
    expect(screen.getByText('Claims waiting (2)')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith('/supplier/credit/claims');
  });

  it('is absent when nothing is waiting', async () => {
    claimsM.mockResolvedValue([]);
    renderTab();
    await screen.findByText('No requests waiting');
    expect(screen.queryByTestId('credit-claims-waiting')).toBeNull();
  });

  it('is absent, and the tab still works, when the claims fail to load', async () => {
    claimsM.mockRejectedValue(new Error('boom'));
    renderTab();
    await screen.findByText('No requests waiting');
    expect(screen.queryByTestId('credit-claims-waiting')).toBeNull();
  });
});
