import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ClaimsInboxScreen from '@/app/supplier/credit/claims';
import { duplicateWarning, splitStale, waitingText } from '@/lib/credit/claimInbox';
import { lineBanner } from '@/lib/credit/supplierLine';
import { CreditAgreementStatus, resolveStatus } from '@/models/status';
import { fetchStoreClaims } from '@/services/credit';

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
  usePathname: () => '/supplier/credit/claims',
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
jest.mock('@/contexts/StoreProvider', () => ({
  useStore: () => ({ storeId: 5, store: { id: 5, supplierOrganizationId: 1, name: 'Main' }, stores: [], select: jest.fn() }),
}));
jest.mock('@/components/supplier/StoreSelector', () => ({ StoreSelector: () => null }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canForStore: () => true }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ online: true, offline: false }) }));
jest.mock('@/components/common', () => ({
  ...jest.requireActual('@/components/common'),
  useToast: () => ({ show: jest.fn() }),
}));
jest.mock('@/services/credit', () => ({
  ...jest.requireActual('@/services/credit'),
  fetchStoreClaims: jest.fn(),
}));

const listM = fetchStoreClaims as jest.Mock;
const claim = (id: number, o: Record<string, unknown> = {}) => ({
  id, invoiceId: 10 + id, invoiceNumber: `INV-${id}`, agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', amount: '5000.0000', method: 'UPI', reference: `UTR${id}`, paidOn: '2026-10-01',
  note: null, status: 'SUBMITTED', decisionNote: null, confirmedAmount: null, creditPaymentId: null,
  createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), decidedAt: null, ...o,
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><ClaimsInboxScreen /></QueryClientProvider>);
}

describe('claim helpers', () => {
  it('splits on the server flag only, keeping the order', () => {
    const list = [claim(1, { stale: true, ageDays: 2 }), claim(2, { ageDays: 30 }), claim(3, { stale: true }), claim(4, { stale: false })] as never[];
    const { stale, rest } = splitStale(list);
    expect(stale.map((c) => (c as { id: number }).id)).toEqual([1, 3]);
    expect(rest.map((c) => (c as { id: number }).id)).toEqual([2, 4]);
  });
  it('words the age from the server count', () => {
    expect(waitingText({ ageDays: 0 })).toBe('Waiting since today');
    expect(waitingText({ ageDays: 1 })).toBe('Waiting 1 day');
    expect(waitingText({ ageDays: 9 })).toBe('Waiting 9 days');
    expect(waitingText({})).toBeNull();
  });
  it('warns by kind, and not at all without a match', () => {
    expect(duplicateWarning({ possibleDuplicateOf: 4, possibleDuplicateKind: 'PAYMENT' }))
      .toBe('Looks like a payment you already have (same amount and reference)');
    expect(duplicateWarning({ possibleDuplicateOf: 4, possibleDuplicateKind: 'CLAIM' }))
      .toBe('Looks like another report you already have (same amount and reference)');
    expect(duplicateWarning({ possibleDuplicateOf: null, possibleDuplicateKind: null })).toBeNull();
    expect(duplicateWarning({})).toBeNull();
  });
});

describe('status wording', () => {
  it('EXPIRED reads "Offer expired" everywhere the shared map is used', () => {
    expect(resolveStatus(CreditAgreementStatus, 'EXPIRED').label).toBe('Offer expired');
  });
  it('lineBanner words an expired offer and the validity of an approved one', () => {
    const base = { termsVersion: 2, overdue: '0' } as never;
    expect(lineBanner({ ...(base as object), status: 'EXPIRED' } as never, null)?.title).toBe('Offer expired');
    expect(lineBanner({ ...(base as object), status: 'APPROVED', offerExpiresOn: '2026-10-20' } as never, null)?.body)
      .toBe('Offer valid until 20th Oct 2026. Nothing can be drawn until the restaurant accepts these terms.');
  });
});

describe('the inbox with the server extras', () => {
  it('puts the claims the server calls stale in a "Waiting 7+ days" group on top', async () => {
    listM.mockResolvedValue([
      claim(1, { ageDays: 3, stale: false }),
      claim(2, { ageDays: 9, stale: true, restaurantName: 'Dosa House' }),
    ]);
    renderScreen();
    const stale = await screen.findByTestId('claim-group-stale');
    expect(within(stale).getByText(/Waiting 7\+ days/)).toBeTruthy();
    expect(within(stale).getByTestId('claim-row-2')).toBeTruthy();
    expect(within(stale).queryByTestId('claim-row-1')).toBeNull();
    expect(within(stale).getByTestId('claim-waiting-2')).toHaveTextContent('Waiting 9 days');
    // Not repeated under its restaurant.
    expect(screen.queryByTestId('claim-group-Dosa House')).toBeNull();
    expect(screen.getByTestId('claim-waiting-1')).toHaveTextContent('Waiting 3 days');
    expect(screen.getByTestId('claim-group-Spice Co')).toBeTruthy();
  });

  it('is not made from the age: a claim 30 days old without the flag is not in the group', async () => {
    listM.mockResolvedValue([claim(1, { ageDays: 30 })]);
    renderScreen();
    await screen.findByTestId('claim-row-1');
    expect(screen.queryByTestId('claim-group-stale')).toBeNull();
  });

  it('has no stale group when none is flagged, and falls back to "Sent ..." without ageDays', async () => {
    listM.mockResolvedValue([claim(1)]);
    renderScreen();
    await screen.findByTestId('claim-row-1');
    expect(screen.queryByTestId('claim-group-stale')).toBeNull();
    expect(screen.getByTestId('claim-waiting-1')).toHaveTextContent('Sent 3 days ago');
  });

  it('shows what the invoice still owes and the duplicate warning on the row and in the review sheet', async () => {
    listM.mockResolvedValue([claim(1, {
      ageDays: 3, invoiceOutstanding: '2500.0000', invoiceOtherOpenClaimsAmount: '700.0000',
      possibleDuplicateOf: 8, possibleDuplicateKind: 'PAYMENT',
    })]);
    renderScreen();
    expect(await screen.findByTestId('claim-outstanding-1')).toHaveTextContent('Invoice still owes ₹2,500.00');
    expect(screen.getByTestId('claim-duplicate-1')).toHaveTextContent('Looks like a payment you already have (same amount and reference)');
    fireEvent.press(screen.getByTestId('claim-row-1'));
    const sheet = await screen.findByTestId('claim-review-sheet');
    expect(within(sheet).getByText('Invoice still owes')).toBeTruthy();
    expect(within(sheet).getAllByText('₹2,500.00').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Other reports waiting')).toBeTruthy();
    expect(within(sheet).getByText('₹700.00')).toBeTruthy();
    expect(within(sheet).getByTestId('claim-duplicate-warning')).toHaveTextContent(/Looks like a payment you already have/);
    // A warning does not stop the supplier: Confirm is still there.
    expect(within(sheet).getByTestId('claim-confirm')).toBeTruthy();
  });

  it('shows none of it when the server sends none', async () => {
    listM.mockResolvedValue([claim(1)]);
    renderScreen();
    await screen.findByTestId('claim-row-1');
    expect(screen.queryByTestId('claim-outstanding-1')).toBeNull();
    expect(screen.queryByTestId('claim-duplicate-1')).toBeNull();
  });
});
