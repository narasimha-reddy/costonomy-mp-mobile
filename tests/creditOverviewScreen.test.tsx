import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
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
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7, outlet: { id: 7, name: 'Indiranagar' } }) }));
let mockMayRepay = true;
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canForOutlet: () => mockMayRepay }),
}));
afterEach(() => { mockMayRepay = true; });
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ online: !mockOffline, offline: mockOffline }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchCreditSummary: jest.fn(),
}));
jest.mock('@/services/wallet', () => ({ fetchWallet: jest.fn().mockResolvedValue({ balance: '5000.0000' }) }));
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

/** The style of the round button's circle (the first child of the pressable). */
const circle = (id: string) => StyleSheet.flatten(
  (screen.getByTestId(id).children[0] as { props: { style: unknown } }).props.style,
) as { backgroundColor?: string };

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

// Cached queries keep a garbage-collection timer alive; clearing them lets jest exit by itself.
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
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
    expect(await screen.findByLabelText('You owe ₹1,700.00, ₹500.00 overdue, ₹30,000.00 available to order of ₹50,000.00 limit')).toBeTruthy();
    expect(screen.getByTestId('credit-hero-overdue')).toHaveTextContent(/₹500 overdue/);
    expect(screen.getByText('icon:alert-circle')).toBeTruthy();
    expect(screen.getByText('Available to order ₹30,000')).toBeTruthy();
    expect(screen.getByText('Dues by supplier')).toBeTruthy();
    const rows = screen.getAllByTestId(/^dues-row-/).map((r) => r.props.testID);
    expect(rows).toEqual(['dues-row-2', 'dues-row-1']);
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Owed ₹600.00')).toBeTruthy();
    expect(screen.getByText(/Next ₹600\.00 on 24th Sep/)).toBeTruthy();
    expect(screen.getByText('I paid')).toBeTruthy();
  });

  it('says Nothing owed with no overdue line and no Pay button', async () => {
    fetchSummary.mockResolvedValue(summary({}, [agreement({ id: 1 })]));
    renderScreen();
    expect(await screen.findByText('Nothing owed')).toBeTruthy();
    expect(screen.queryByTestId('credit-hero-overdue')).toBeNull();
    expect(screen.queryByTestId('pay-from-wallet')).toBeNull();
    expect(screen.getByText('Up to date')).toBeTruthy();
    expect(screen.getByText('Available ₹30,000.00')).toBeTruthy();
  });

  it('opens the sheet directly when one supplier is owed', async () => {
    fetchSummary.mockResolvedValue(summary({ due: '600' }, [
      agreement({ id: 9, supplierName: 'Solo', due: '600', overdue: '100' }),
      agreement({ id: 10, supplierName: 'Other' }),
    ]));
    renderScreen();
    fireEvent.press(await screen.findByTestId('pay-from-wallet'));
    expect(screen.getByTestId('pay-sheet')).toBeTruthy();
    expect(mockSheetProps).toHaveBeenLastCalledWith(expect.objectContaining({
      agreementId: 9, supplierName: 'Solo', due: '600', overdue: '100', visible: true,
    }));
  });

  it('opens the pay-several sheet when several are owed, and Pay one supplier instead reaches the picker then the supplier sheet', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    fireEvent.press(await screen.findByTestId('pay-from-wallet'));
    expect(screen.queryByTestId('pay-sheet')).toBeNull();
    expect(screen.getByText('Pay overdue to')).toBeTruthy();
    expect(screen.queryByText('Pay which supplier?')).toBeNull();
    fireEvent.press(screen.getByTestId('multi-one-instead'));
    expect(screen.queryByText('Pay overdue to')).toBeNull();
    expect(screen.getByText('Pay which supplier?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pick-supplier-1'));
    expect(screen.getByTestId('pay-sheet')).toBeTruthy();
    expect(mockSheetProps).toHaveBeenLastCalledWith(expect.objectContaining({
      agreementId: 1, supplierName: 'Zed Foods', due: '600', overdue: '0',
    }));
  });

  it('I paid goes straight to the claim form when exactly one supplier is owed', async () => {
    fetchSummary.mockResolvedValue(summary({ due: '600' }, [
      agreement({ id: 9, supplierName: 'Solo', due: '600' }),
      agreement({ id: 10, supplierName: 'Other' }),
    ]));
    renderScreen();
    fireEvent.press(await screen.findByTestId('i-paid'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/credit/claim', params: { agreementId: '9' },
    });
    expect(screen.queryByText('Which supplier did you pay?')).toBeNull();
  });

  it('I paid asks which supplier first when several are owed', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    fireEvent.press(await screen.findByTestId('i-paid'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Which supplier did you pay?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pick-supplier-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/credit/claim', params: { agreementId: '1' },
    });
    expect(screen.queryByTestId('pay-sheet')).toBeNull();
  });

  it('without wallet repay the slots drop out: I paid takes the filled emphasis, Get credit stays', async () => {
    fetchSummary.mockResolvedValue({ ...OWING, walletRepayEnabled: false });
    renderScreen();
    await screen.findByTestId('i-paid');
    expect(screen.queryByTestId('pay-from-wallet')).toBeNull();
    expect(circle('i-paid').backgroundColor).toBe(Colors.primary);
    expect(circle('get-credit').backgroundColor).not.toBe(Colors.primary);
  });

  it('puts the actions in a row of three under the hero, Pay in the middle and filled', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    const row = await screen.findByTestId('credit-actions');
    expect(screen.getByTestId('credit-hero')).toBeTruthy();
    const ids = (row.children as unknown as { props: { testID?: string } }[]).map((c) => c.props.testID);
    expect(ids).toEqual(['i-paid', 'pay-from-wallet', 'get-credit']);
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
    expect(circle('pay-from-wallet').backgroundColor).toBe(Colors.primary);
    expect(circle('i-paid').backgroundColor).not.toBe(Colors.primary);
    expect(screen.getByText('Pay')).toBeTruthy();
    expect(screen.getByText('Get credit')).toBeTruthy();
  });

  it('with nothing owed only Get credit is left, and it opens the request screen', async () => {
    fetchSummary.mockResolvedValue(summary({}, [agreement({ id: 1 })]));
    renderScreen();
    await screen.findByText('Nothing owed');
    expect(screen.queryByTestId('pay-from-wallet')).toBeNull();
    expect(screen.queryByTestId('i-paid')).toBeNull();
    expect(circle('get-credit').backgroundColor).toBe(Colors.primary);
    fireEvent.press(screen.getByTestId('get-credit'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/credit/request');
  });

  it('has no purple Pay and no buttons inside the hero', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    const hero = await screen.findByTestId('credit-hero');
    expect(within(hero).queryByRole('button')).toBeNull();
    expect(within(hero).queryByText('Pay')).toBeNull();
  });

  it('hides I paid when nothing is owed', async () => {
    fetchSummary.mockResolvedValue(summary({}, [agreement({ id: 1 })]));
    renderScreen();
    await screen.findByText('Nothing owed');
    expect(screen.queryByTestId('i-paid')).toBeNull();
  });

  it('says a payment is waiting for the supplier on that supplier only', async () => {
    fetchSummary.mockResolvedValue(summary({ due: '1700' }, [
      agreement({ id: 1, supplierName: 'Zed Foods', due: '600', openClaimsAmount: '250.0000' }),
      agreement({ id: 2, supplierName: 'Acme', due: '1100', openClaimsAmount: '0.0000' }),
    ]));
    renderScreen();
    expect(await screen.findByTestId('dues-reported-1'))
      .toHaveTextContent('Payment reported: ₹250.00 · waiting for supplier');
    expect(screen.queryByTestId('dues-reported-2')).toBeNull();
  });

  it('hides Pay when the flag is off or absent', async () => {
    fetchSummary.mockResolvedValue({ ...OWING, walletRepayEnabled: undefined });
    renderScreen();
    await screen.findByText('Dues by supplier');
    expect(screen.queryByTestId('pay-from-wallet')).toBeNull();
    fetchSummary.mockResolvedValue({ ...OWING, walletRepayEnabled: false });
    renderScreen();
    await waitFor(() => expect(screen.queryAllByTestId('pay-from-wallet')).toHaveLength(0));
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

  it('navigates from a due row, an approved line and Get credit', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    fireEvent.press(await screen.findByTestId('dues-row-2'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/credit/2');
    expect(screen.getByText('Terms ready: review and accept')).toBeTruthy();
    fireEvent.press(screen.getByTestId('line-row-4'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/credit/4');
    expect(screen.queryByText('Request credit from another supplier')).toBeNull();
    fireEvent.press(screen.getByTestId('get-credit'));
    expect(mockPush).toHaveBeenLastCalledWith('/restaurant/credit/request');
  });

  it('has exactly one visible Request credit entry per state', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    await screen.findByText('Dues by supplier');
    expect(screen.getAllByText(/Request credit|Get credit/)).toHaveLength(1);
  });

  it('shows the rejection reason on a declined line', async () => {
    fetchSummary.mockResolvedValue(summary({}, [
      agreement({ id: 5, status: 'REJECTED', canFund: false, latestRequest: { responseNote: 'Too new an account' } }),
    ]));
    renderScreen();
    expect(await screen.findByText('Too new an account')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
  });

  it('paints nothing on the screen purple', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    await screen.findByTestId('pay-from-wallet');
    for (const b of screen.getAllByRole('button')) {
      expect(JSON.stringify(b.props.style ?? {})).not.toContain(Colors.credit);
    }
    const seen: string[] = [];
    const walk = (n: unknown): void => {
      if (n == null || typeof n === 'string') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const node = n as { props?: { style?: unknown }; children?: unknown };
      seen.push(JSON.stringify(node.props?.style ?? null));
      walk(node.children);
    };
    walk(screen.toJSON());
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.join('')).not.toContain(Colors.credit);
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

describe('Credit overview hero and lists', () => {
  it('shows the figure split like the wallet, the pill, the meter and its two labels', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    const hero = await screen.findByTestId('credit-hero');
    expect(within(hero).getByText('You owe')).toBeTruthy();
    expect(within(hero).getByText('₹')).toBeTruthy();
    expect(within(hero).getByText('1,700')).toBeTruthy();
    expect(within(hero).getByText('.00')).toBeTruthy();
    expect(within(hero).getByText('₹500 overdue')).toBeTruthy();
    expect(within(hero).getByText('icon:alert-circle')).toBeTruthy();
    expect(within(hero).getByText('Available to order ₹30,000')).toBeTruthy();
    expect(within(hero).getByText('Limit ₹50,000')).toBeTruthy();
    // used 20,000 of 50,000
    const widths: unknown[] = [];
    const walk = (n: unknown): void => {
      if (n == null || typeof n === 'string') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const node = n as { props?: { style?: unknown }; children?: unknown };
      const st = StyleSheet.flatten(node.props?.style as never) as { width?: unknown } | undefined;
      if (st?.width != null) widths.push(st.width);
      walk(node.children);
    };
    walk(screen.toJSON());
    expect(widths).toContain('40%');
    expect(screen.queryByText('Reserved')).toBeNull();
  });

  it('leaves the overdue part out of the spoken label when nothing is overdue', async () => {
    fetchSummary.mockResolvedValue(summary({ due: '600' }, [agreement({ id: 9, due: '600' })]));
    renderScreen();
    expect(await screen.findByLabelText('You owe ₹600.00, ₹30,000.00 available to order of ₹50,000.00 limit')).toBeTruthy();
    expect(screen.queryByTestId('credit-hero-overdue')).toBeNull();
  });

  it('shows ₹0 with Nothing owed and no pill when nothing is owed', async () => {
    fetchSummary.mockResolvedValue(summary({}, [agreement({ id: 1 })]));
    renderScreen();
    const hero = await screen.findByTestId('credit-hero');
    expect(within(hero).getByText('Nothing owed')).toBeTruthy();
    expect(within(hero).getByText('0')).toBeTruthy();
    expect(screen.queryByTestId('credit-hero-overdue')).toBeNull();
  });

  it('has the Wallet header: Credit with the outlet name under it', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    await screen.findByTestId('credit-hero');
    expect(screen.getByText('Credit')).toBeTruthy();
    expect(screen.getByText('Indiranagar')).toBeTruthy();
  });

  it('groups the dues in one card with dividers, overdue first, and the lines in another', async () => {
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    const dues = await screen.findByTestId('dues-list');
    const rows = within(dues).getAllByTestId(/^dues-row-\d+$/).map((r) => r.props.testID);
    expect(rows).toEqual(['dues-row-2', 'dues-row-1']);
    expect(within(dues).queryAllByTestId('divider-dues-row-2')).toHaveLength(1);
    expect(within(dues).queryAllByTestId('divider-dues-row-1')).toHaveLength(0);
    const lines = screen.getByTestId('lines-list');
    expect(within(lines).getByTestId('line-row-3')).toBeTruthy();
    expect(within(lines).getByTestId('line-row-4')).toBeTruthy();
    expect(screen.queryByText('Request credit from another supplier')).toBeNull();
    expect(screen.queryByTestId('card-accent-dues-row-2')).toBeNull();
  });

  it('keeps Pay disabled offline with the hero actions', async () => {
    mockOffline = true;
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    expect((await screen.findByTestId('pay-from-wallet')).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('get-credit').props.accessibilityState?.disabled).not.toBe(true);
  });

  it('hides I paid when the summary says nothing more can be reported, and keeps Pay', async () => {
    fetchSummary.mockResolvedValue({ ...OWING, reportableAmount: 0 });
    renderScreen();
    await screen.findByTestId('pay-from-wallet');
    expect(screen.queryByTestId('i-paid')).toBeNull();
  });

  it('shows I paid when something is reportable or the field is absent (old API)', async () => {
    fetchSummary.mockResolvedValue({ ...OWING, reportableAmount: 250 });
    const first = renderScreen();
    expect(await screen.findByTestId('i-paid')).toBeTruthy();
    first.unmount();
    fetchSummary.mockResolvedValue(OWING);
    renderScreen();
    expect(await screen.findByTestId('i-paid')).toBeTruthy();
  });
});
