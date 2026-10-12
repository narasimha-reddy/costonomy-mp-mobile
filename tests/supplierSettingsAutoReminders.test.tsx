import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StoreDetailScreen from '@/app/supplier/settings/store/[id]';
import {
  fetchCreditPolicy, fetchDeliveryPolicy, fetchStore, saveCreditPolicy, saveDeliveryPolicy, updateStore,
} from '@/services/supplier';

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/supplier/settings/store/5',
  useLocalSearchParams: () => ({ id: '5' }),
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({ useStore: () => ({ supplier: { id: 1 }, storeId: 5 }) }));
jest.mock('@/hooks/useDeviceLocation', () => ({ useDeviceLocation: () => ({ coordinates: null, status: 'idle', capture: jest.fn() }) }));
let mockGranted: string[] = ['CREDIT_MODIFY'];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForStore: (p: string) => mockGranted.includes(p) }),
}));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock('@/services/supplier', () => ({
  ...jest.requireActual('@/services/supplier'),
  fetchStore: jest.fn(), fetchDeliveryPolicy: jest.fn(), fetchCreditPolicy: jest.fn(),
  saveCreditPolicy: jest.fn(), saveDeliveryPolicy: jest.fn(), updateStore: jest.fn(),
}));

const store = {
  id: 5, supplierOrganizationId: 1, name: 'Main', addressLine1: '1 Road', addressLine2: null, city: 'Pune', state: 'MH',
  pincode: '411001', latitude: null, longitude: null, contactName: 'Asha', contactPhone: '9876543210',
  operatingHours: { days: ['MON'], opensAt: '10:00', closesAt: '21:00' }, responseSlaSeconds: 600, preparationMinutes: 60,
  directOrdersEnabled: false, status: 'ACTIVE',
};
const policy = (over: Record<string, unknown> = {}) => ({
  supplierStoreId: 5, creditEnabled: true, defaultCreditLimit: '10000.00', defaultCreditPeriodDays: 30,
  defaultGracePeriodDays: 5, maxSingleOrderCredit: null, maxOverdueAmount: null, autoSuspendEnabled: true,
  autoRemindersEnabled: true, ...over,
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><StoreDetailScreen /></QueryClientProvider>);
}
const sw = () => screen.findByLabelText(/^Automatic reminders\./);

afterEach(() => { cleanup(); mockGranted = ['CREDIT_MODIFY']; });
beforeEach(() => {
  jest.clearAllMocks();
  (fetchStore as jest.Mock).mockResolvedValue(store);
  (fetchDeliveryPolicy as jest.Mock).mockResolvedValue({ ownDeliveryEnabled: true, costonomyDeliveryEnabled: false, ownDeliveryFee: '0', ownDeliveryMinOrderValue: null, maxDeliveryRadiusKm: null });
  (fetchCreditPolicy as jest.Mock).mockResolvedValue(policy());
  (saveCreditPolicy as jest.Mock).mockResolvedValue(policy());
  (saveDeliveryPolicy as jest.Mock).mockResolvedValue({});
  (updateStore as jest.Mock).mockResolvedValue(store);
});

describe('Automatic reminders setting', () => {
  it('shows the switch with its plain sentence, on as the server says', async () => {
    renderScreen();
    const control = await sw();
    expect(control.props.accessibilityState.checked).toBe(true);
    expect(control.props.accessibilityLabel).toContain('We remind restaurants 3 days before, on the due date and weekly while overdue.');
  });

  it('shows it off when the server says off', async () => {
    (fetchCreditPolicy as jest.Mock).mockResolvedValue(policy({ autoRemindersEnabled: false }));
    renderScreen();
    expect((await sw()).props.accessibilityState.checked).toBe(false);
  });

  it('is not offered to people without CREDIT_MODIFY', async () => {
    mockGranted = ['CREDIT_VIEW'];
    renderScreen();
    await screen.findByText('Credit you offer');
    expect(screen.queryByLabelText(/^Automatic reminders\./)).toBeNull();
  });

  it('is not offered while credit is off', async () => {
    (fetchCreditPolicy as jest.Mock).mockResolvedValue(policy({ creditEnabled: false }));
    renderScreen();
    await screen.findByText('Credit you offer');
    expect(screen.queryByLabelText(/^Automatic reminders\./)).toBeNull();
  });

  it('saves the change with the credit policy', async () => {
    renderScreen();
    fireEvent.press(await sw());
    await act(async () => { fireEvent.press(screen.getByText('Save changes')); });
    await waitFor(() => expect(saveCreditPolicy).toHaveBeenCalled());
    expect((saveCreditPolicy as jest.Mock).mock.calls[0][2]).toEqual(expect.objectContaining({ autoRemindersEnabled: false }));
  });

  it('leaves it out of a save that did not touch it (the server keeps its value)', async () => {
    renderScreen();
    await sw();
    fireEvent.press(screen.getByLabelText(/^Offer credit\./));
    fireEvent.press(screen.getByLabelText(/^Offer credit\./));
    fireEvent.changeText(screen.getByDisplayValue('30'), '45');
    await act(async () => { fireEvent.press(screen.getByText('Save changes')); });
    await waitFor(() => expect(saveCreditPolicy).toHaveBeenCalled());
    expect((saveCreditPolicy as jest.Mock).mock.calls[0][2]).not.toHaveProperty('autoRemindersEnabled');
  });
});
