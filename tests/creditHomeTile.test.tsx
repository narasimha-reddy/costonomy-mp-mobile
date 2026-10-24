import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import RestaurantHome from '@/app/restaurant/(tabs)/index';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));

let mockPermissions: string[] = ['CREDIT_VIEW'];
let mockQuickScan = true;
let mockAttention = { overdue: false, dueSoon: false };
jest.mock('@/contexts/SessionProvider', () => ({
  useSession: () => ({
    accessToken: 'tok',
    me: { memberships: [{ scopeType: 'RESTAURANT', scopeId: 5, permissions: mockPermissions }] },
  }),
}));
jest.mock('@/contexts/OutletProvider', () => ({
  useOutlet: () => ({ outletId: 7, outlet: { id: 7, restaurantId: 5, name: 'O' } }),
}));
jest.mock('@/hooks/useCreditAttention', () => ({ useCreditAttention: () => mockAttention }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey.includes('quickscan-config') ? { enabled: mockQuickScan } : [],
    isPending: false, isError: false, refetch: jest.fn(),
  }),
}));
// Everything below the Money Transfers row is out of scope for this test.
jest.mock('@/components/restaurant/RestaurantHeader', () => ({ RestaurantHeader: () => null }));
jest.mock('@/components/restaurant/PopularSuppliersCarousel', () => ({ PopularSuppliersCarousel: () => null }));
jest.mock('@/components/common', () => ({
  MandiScreen: ({ header, children }: { header: React.ReactNode; children: React.ReactNode }) => <>{header}{children}</>,
  MandiSearchBar: () => null,
  MandiCard: () => null, MandiEmptyState: () => null, MandiErrorState: () => null,
  MandiSectionHeader: () => null, MandiSkeletonList: () => null, toneColors: () => ({}),
}));
jest.mock('@/components/wallet/QuickActionTiles', () => jest.requireActual('@/components/wallet/QuickActionTiles'));
jest.mock('@/components/common/MandiSectionHeader', () => ({ MandiSectionHeader: () => null }));
jest.mock('@/components/common/MandiText', () => {
  const { Text } = jest.requireActual('react-native');
  return { MandiText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});
jest.mock('@/components/request/RestaurantRequestCard', () => ({ RestaurantRequestCard: () => null }));
jest.mock('@/components/product/CategoryTile', () => ({ CategoryTile: () => null }));
jest.mock('@/components/order', () => ({ OrderCardBody: () => null }));

const order = () => screen.getAllByRole('button').map((b) => b.props.testID)
  .filter((id: string) => id?.startsWith('action-'));

beforeEach(() => {
  mockPush.mockClear();
  mockPermissions = ['CREDIT_VIEW'];
  mockQuickScan = true;
  mockAttention = { overdue: false, dueSoon: false };
});

describe('Home Credit tile', () => {
  it('is third, after Quick Scan and Wallet, with the card icon', () => {
    render(<RestaurantHome />);
    expect(order()).toEqual(['action-quickscan', 'action-wallet', 'action-credit']);
    expect(screen.getByText('icon:card-outline')).toBeTruthy();
    expect(screen.getAllByTestId('action-spacer')).toHaveLength(1);
  });

  it('is hidden without CREDIT_VIEW and the others close up', () => {
    mockPermissions = [];
    render(<RestaurantHome />);
    expect(order()).toEqual(['action-quickscan', 'action-wallet']);
  });

  it('takes the second slot when Quick Scan is off', () => {
    mockQuickScan = false;
    render(<RestaurantHome />);
    expect(order()).toEqual(['action-wallet', 'action-credit']);
  });

  it('draws the standard orange disc, not purple', () => {
    render(<RestaurantHome />);
    const tile = screen.getByTestId('action-credit');
    const disc = tile.findAll((n: { props: { style?: unknown } }) => {
      const s = StyleSheet.flatten(n.props.style) as { width?: number; borderRadius?: number } | undefined;
      return s?.width === 64 && s?.borderRadius != null;
    })[0];
    expect(StyleSheet.flatten(disc.props.style).backgroundColor).toBe(Colors.primary);
  });

  it('has no dot and a plain label when nothing is overdue', () => {
    render(<RestaurantHome />);
    expect(screen.queryByTestId('action-credit-badge')).toBeNull();
    expect(screen.getByLabelText('Credit')).toBeTruthy();
  });

  it('shows no dot for due soon', () => {
    mockAttention = { overdue: false, dueSoon: true };
    render(<RestaurantHome />);
    expect(screen.queryByTestId('action-credit-badge')).toBeNull();
    expect(screen.getByLabelText('Credit')).toBeTruthy();
  });

  it('shows the dot, and says so in the label, when overdue', () => {
    mockAttention = { overdue: true, dueSoon: true };
    render(<RestaurantHome />);
    const dot = screen.getByTestId('action-credit-badge');
    expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe(Colors.danger);
    expect(screen.getByLabelText('Credit, payment overdue')).toBeTruthy();
  });

  it('opens the credit screen', () => {
    render(<RestaurantHome />);
    fireEvent.press(screen.getByTestId('action-credit'));
    expect(mockPush).toHaveBeenCalledWith('/restaurant/credit');
  });
});
