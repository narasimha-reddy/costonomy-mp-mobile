import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WalletScreen from '@/app/restaurant/wallet/index';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchWallet } from '@/services/wallet';

// Native modules the test runtime does not have.
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
// The real toast animates on a timer that outlives the test; only the calls matter here.
const mockToast = jest.fn();
jest.mock('@/components/common/MandiToast', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
  MandiToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ show: mockToast }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  usePathname: () => '/restaurant/wallet',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'token' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outlet: { id: 7, name: 'Test outlet' } }) }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForOutlet: () => true }) }));
jest.mock('@/services/quickscan', () => ({ fetchQuickScanConfig: jest.fn().mockResolvedValue({ enabled: false }) }));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn(), withdrawFromWallet: jest.fn() }));

const wallet = {
  balance: '500.0000',
  recent: [
    { id: 11, direction: 'CREDIT', kind: 'TOP_UP', amount: '1000.0000', balanceAfter: '500.0000',
      supplierOrderId: null, reason: null, refundStatus: null, status: 'COMPLETED', at: '2026-09-28T10:00:00Z' },
    { id: 12, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '100.0000', balanceAfter: '450.0000',
      supplierOrderId: null, reason: 'Sharma Dairy', refundStatus: null, status: 'COMPLETED', at: '2026-09-28T09:00:00Z' },
  ],
};

describe('wallet screen: Recent', () => {
  it('opens the transaction details when a row is tapped, and See all goes to History', async () => {
    (fetchWallet as jest.Mock).mockResolvedValue(wallet);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <QueryClientProvider client={client}>
          <WalletScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    const rows = await screen.findAllByRole('button', { name: /Sharma Dairy/ });
    expect(rows).toHaveLength(1);
    fireEvent.press(rows[0]);
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/transaction/12');

    fireEvent.press(screen.getByRole('button', { name: /Added to wallet/ }));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/transaction/11');

    fireEvent.press(screen.getByText('See all'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/wallet/history');
    client.clear();
  });
});
