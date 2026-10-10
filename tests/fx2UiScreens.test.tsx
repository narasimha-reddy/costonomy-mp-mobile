import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import ChatInboxScreen from '@/app/chat/index';
import { OperatingHoursFields } from '@/components/supplier/OperatingHoursFields';
import { DisputeListItem } from '@/components/dispute/DisputeListItem';
import { DeliveryDayChoice } from '@/components/restaurant/DeliveryDayChoice';
import { DisputeRefundLines } from '@/components/order/DisputeRefundLines';
import { fetchDisputes } from '@/services/trust';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockAudience: string | null = 'SUPPLIER';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  usePathname: () => '/chat',
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/contexts/SessionProvider', () => ({
  useSession: () => ({ accessToken: 'tok', audience: mockAudience }),
}));
jest.mock('@/services/chat', () => ({ fetchOutletThreads: jest.fn(), fetchStoreThreads: jest.fn() }));
jest.mock('@/services/trust', () => ({ fetchDisputes: jest.fn() }));

afterEach(() => { cleanup(); jest.clearAllMocks(); mockCanGoBack = true; mockAudience = 'SUPPLIER'; });

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

describe('/chat empty state Go back', () => {
  it('goes back when there is history', () => {
    wrap(<ChatInboxScreen />);
    fireEvent.press(screen.getByText('Go back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('goes to the supplier home when there is no history', () => {
    mockCanGoBack = false;
    wrap(<ChatInboxScreen />);
    fireEvent.press(screen.getByText('Go back'));
    expect(mockReplace).toHaveBeenCalledWith('/supplier');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('goes to the restaurant home for a restaurant', () => {
    mockCanGoBack = false;
    mockAudience = 'RESTAURANT';
    wrap(<ChatInboxScreen />);
    fireEvent.press(screen.getByText('Go back'));
    expect(mockReplace).toHaveBeenLastCalledWith('/restaurant');
  });
  it('goes to the router for no role', () => {
    mockCanGoBack = false;
    mockAudience = null;
    wrap(<ChatInboxScreen />);
    fireEvent.press(screen.getByText('Go back'));
    expect(mockReplace).toHaveBeenLastCalledWith('/');
  });
});

describe('store hours sentence in the editor', () => {
  const hours = (opensAt: string, closesAt: string) => ({ days: ['MONDAY', 'TUESDAY'], opensAt, closesAt });
  it('says hours are not set instead of 00:00-00:00', () => {
    render(<OperatingHoursFields value={hours('00:00', '00:00')} onChange={jest.fn()} />);
    expect(screen.getByText(/Hours not set/)).toBeTruthy();
    expect(screen.queryByText(/00:00/)).toBeNull();
    expect(screen.queryByText(/Restaurants can order from you/)).toBeNull();
  });
  it('still states the window when one is set', () => {
    render(<OperatingHoursFields value={hours('10:00', '21:00')} onChange={jest.fn()} />);
    expect(screen.getByText(/Restaurants can order from you on 2 days, 10:00–21:00/)).toBeTruthy();
  });
});

describe('supplier dispute list chip', () => {
  const dispute = (status: string) => ({
    id: 1, disputeNumber: 'DSP-1', orderNumber: 'ORD-79', category: 'DAMAGED', status, createdAt: '2026-10-01T10:00:00Z',
    refundRequest: null,
  }) as never;
  it('shows the real status in sentence case, not the lowercase enum', () => {
    wrap(<DisputeListItem dispute={dispute('RESOLVED')} viewer="supplier" onPress={jest.fn()} />);
    expect(screen.getByText('Resolved')).toBeTruthy();
    expect(screen.queryByText('open')).toBeNull();
    expect(screen.queryByText('resolved')).toBeNull();
  });
  it('labels open and under review distinctly', () => {
    wrap(<DisputeListItem dispute={dispute('OPEN')} viewer="supplier" onPress={jest.fn()} />);
    expect(screen.getByText('Open')).toBeTruthy();
  });
  it('labels under review', () => {
    wrap(<DisputeListItem dispute={dispute('UNDER_REVIEW')} viewer="supplier" onPress={jest.fn()} />);
    expect(screen.getByText('Under review')).toBeTruthy();
  });
});

describe('cart delivery day spacing', () => {
  it('leaves 12-16 px under the chips so the supplier card does not touch them', () => {
    render(<DeliveryDayChoice value={{ offset: null, byHour: null }} onChange={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByTestId('delivery-day-choice').props.style);
    expect(style.marginBottom).toBeGreaterThanOrEqual(12);
    expect(style.marginBottom).toBeLessThanOrEqual(16);
  });
});

describe('DisputeRefundLines', () => {
  const dispute = (id: number, status: string, amount: string) => ({
    id, disputeNumber: `DSP-${id}`, refundRequest: { id, status, amount },
  });
  it('shows the server amount of each approved dispute refund, as a labelled refund row', async () => {
    (fetchDisputes as jest.Mock).mockResolvedValue([
      dispute(1, 'APPROVED', '25.00'), dispute(2, 'REQUESTED', '40.00'), dispute(3, 'DECLINED', '9.00'),
      dispute(4, 'OPS_APPROVED', '10.00'),
    ]);
    wrap(<DisputeRefundLines orderId={79} />);
    expect(await screen.findByLabelText('Dispute refund DSP-1, -₹25.00')).toBeTruthy();
    expect(screen.getByLabelText('Dispute refund DSP-4, -₹10.00')).toBeTruthy();
    expect(screen.queryByLabelText(/DSP-2/)).toBeNull();
    expect(screen.queryByLabelText(/DSP-3/)).toBeNull();
    expect(fetchDisputes).toHaveBeenCalledWith('tok', 79);
  });
  it('renders nothing when there are no approved refunds or the call fails', async () => {
    (fetchDisputes as jest.Mock).mockRejectedValue(new Error('x'));
    wrap(<DisputeRefundLines orderId={79} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Dispute refund/)).toBeNull();
  });
});
