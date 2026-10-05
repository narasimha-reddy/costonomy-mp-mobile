import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CreditOverviewScreen from '@/app/restaurant/credit/index';
import { fetchCreditSummary } from '@/services/credit';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), usePathname: () => '/restaurant/credit' }));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchCreditSummary: jest.fn(),
}));
const mockSheetProps = jest.fn();
jest.mock('@/components/credit/PayFromWalletSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    PayFromWalletSheet: (p: Record<string, unknown>) => {
      mockSheetProps(p);
      return <Text testID="pay-sheet">{`sheet:${p.agreementId}`}</Text>;
    },
  };
});

const fetchSummary = fetchCreditSummary as jest.Mock;

const agreement = (o: Record<string, unknown>) => ({
  id: 1, supplierName: 'Acme', storeName: null, status: 'ACTIVE', approvedLimit: '50000', reserved: '0',
  utilized: '0', available: '30000', due: '0', overdue: '0', nextDueDate: null, nextDueAmount: null,
  suspensionReason: null, canFund: true, latestRequest: null, ...o,
});
const summary = (o: Record<string, unknown> = {}, agreements: unknown[] = []) => ({
  outletId: 7, approvedLimit: '50000', reserved: '0', utilized: '20000', available: '30000',
  due: '0', overdue: '0', walletRepayEnabled: true, agreements, ...o,
});

const OWING = summary({ due: '1700', overdue: '500' }, [
  agreement({ id: 1, supplierName: 'Zed Foods', due: '600', nextDueDate: '2026-09-24', nextDueAmount: '600' }),
  agreement({ id: 2, supplierName: 'Acme', due: '1100', overdue: '500', nextDueDate: '2026-10-30', nextDueAmount: '1100' }),
  agreement({ id: 3, supplierName: 'Quiet', due: '0' }),
  agreement({ id: 4, supplierName: 'Pending Co', status: 'APPROVED', canFund: false }),
]);

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <CreditOverviewScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockSheetProps.mockClear();
  fetchSummary.mockReset();
  mockOffline = false;
});

describe('Credit overview', () => {
  it('leads with what is owed, with the overdue words, and orders overdue first', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    expect(await screen.findByLabelText('You owe ₹1,700.00, ₹500.00 overdue')).toBeTruthy();
    expect(screen.getByTestId('credit-hero-overdue')).toHaveTextContent(/₹500\.00 overdue/);
    expect(screen.getByText('icon:alert-circle')).toBeTruthy();
    expect(screen.getByText('₹30,000.00 available to order')).toBeTruthy();
    expect(screen.getByText('Dues by supplier')).toBeTruthy();
    const rows = screen.getAllByTestId(/^dues-row-/).map((r) => r.props.testID);
    expect(rows).toEqual(['dues-row-2', 'dues-row-1']);
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Owed ₹600.00')).toBeTruthy();
    expect(screen.getByText(/Next ₹600\.00 on 24th Sep/)).toBeTruthy();
    expect(screen.queryByText(/I paid outside/)).toBeNull();
  });

  it('says Nothing owed with no overdue line and no Pay button', async () => {
    fetchSummary.mockResolvedValue(summary({}, [agreement({ id: 1 })]));
    renderScreen();
    expect(await screen.findByText('Nothing owed')).toBeTruthy();
    expect(screen.queryByTestId('credit-hero-overdue')).toBeNull();
    expect(screen.queryByText('Pay from wallet')).toBeNull();
    expect(screen.getByText('Up to date')).toBeTruthy();
    expect(screen.getByText('Available ₹30,000.00')).toBeTruthy();
  });

  it('opens the sheet directly when one supplier is owed', async () => {
    fetchSummary.mockResolvedValue(summary({ due: '600' }, [
      agreement({ id: 9, supplierName: 'Solo', due: '600', overdue: '100' }),
      agreement({ id: 10, supplierName: 'Other' }),
    ]));
    renderScreen();
    fireEvent.press(await screen.findByText('Pay from wallet'));
    expect(screen.getByTestId('pay-sheet')).toBeTruthy();
    expect(mockSheetProps).toHaveBeenLastCalledWith(expect.objectContaining({
      agreementId: 9, supplierName: 'Solo', due: '600', overdue: '100', visible: true,
    }));
  });

  it('shows the picker first when several are owed, then the chosen supplier sheet', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    fireEvent.press(await screen.findByText('Pay from wallet'));
    expect(screen.queryByTestId('pay-sheet')).toBeNull();
    expect(screen.getByText('Pay which supplier?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pick-supplier-1'));
    expect(screen.getByTestId('pay-sheet')).toBeTruthy();
    expect(mockSheetProps).toHaveBeenLastCalledWith(expect.objectContaining({
      agreementId: 1, supplierName: 'Zed Foods', due: '600', overdue: '0',
    }));
  });

  it('hides Pay when the flag is off or absent', async () => {
    fetchSummary.mockResolvedValue({ ...OWING, walletRepayEnabled: undefined });
    renderScreen();
    await screen.findByText('Dues by supplier');
    expect(screen.queryByText('Pay from wallet')).toBeNull();
  });

  it('disables Pay offline and shows the banner', async () => {
    mockOffline = true;
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    const pay = await screen.findByTestId('pay-from-wallet');
    expect(pay.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('shows Suspended with its reason on a suspended row that owes', async () => {
    fetchSummary.mockResolvedValue(summary({ due: '300' }, [
      agreement({ id: 1, status: 'SUSPENDED', due: '300', suspensionReason: 'Pay your invoice' }),
      agreement({ id: 2, supplierName: 'Fine', due: '0' }),
    ]));
    renderScreen();
    expect(await screen.findByText('Suspended')).toBeTruthy();
    expect(screen.getByText('Pay your invoice')).toBeTruthy();
    expect(screen.queryByText(/Ordering on credit is paused/)).toBeNull();
  });

  it('shows the red paused banner when every agreement is suspended', async () => {
    fetchSummary.mockResolvedValue(summary({ due: '300' }, [
      agreement({ id: 1, status: 'SUSPENDED', due: '300' }),
    ]));
    renderScreen();
    expect(await screen.findByText("Ordering on credit is paused. Paying what's overdue can restore it.")).toBeTruthy();
    expect(screen.getByTestId('credit-paused-banner')).toBeTruthy();
  });

  it('keeps the empty state with no agreements', async () => {
    fetchSummary.mockResolvedValue(summary({}, []));
    renderScreen();
    expect(await screen.findByText('No credit yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Request credit'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/credit/request');
  });

  it('navigates from a due row, an approved line and the footer', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    fireEvent.press(await screen.findByTestId('dues-row-2'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/credit/2');
    expect(screen.getByText('Terms ready: review and accept')).toBeTruthy();
    fireEvent.press(screen.getByTestId('line-row-4'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/credit/4');
    fireEvent.press(screen.getByText('Request credit from another supplier'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/credit/request');
  });

  it('shows the rejection reason on a declined line', async () => {
    fetchSummary.mockResolvedValue(summary({}, [
      agreement({ id: 5, status: 'REJECTED', canFund: false, latestRequest: { responseNote: 'Too new an account' } }),
    ]));
    renderScreen();
    expect(await screen.findByText('Too new an account')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
  });

  it('never paints a button purple', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    const pay = await screen.findByTestId('pay-from-wallet');
    const flat = JSON.stringify(StyleSheet.flatten(pay.props.style));
    expect(flat).not.toContain(Colors.credit.toLowerCase());
    expect(flat).not.toContain(Colors.credit);
    for (const b of screen.getAllByRole('button')) {
      expect(JSON.stringify(b.props.style ?? {})).not.toContain(Colors.credit);
    }
  });

  it('shows the loading skeleton, then an error with retry', async () => {
    fetchSummary.mockRejectedValue(new Error('boom'));
    renderScreen();
    await waitFor(() => expect(screen.getByText("Couldn't load your credit.")).toBeTruthy());
    fetchSummary.mockResolvedValue(OWING);
    fireEvent.press(screen.getByText(/Try again|Retry/i));
    expect(await screen.findByText('Dues by supplier')).toBeTruthy();
  });

  it('pull-to-refresh refetches', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    await screen.findByText('Dues by supplier');
    expect(fetchSummary).toHaveBeenCalledTimes(1);
    const { RefreshControl } = jest.requireActual('react-native');
    const control = screen.UNSAFE_getByType(RefreshControl);
    control.props.onRefresh();
    await waitFor(() => expect(fetchSummary).toHaveBeenCalledTimes(2));
  });
});
