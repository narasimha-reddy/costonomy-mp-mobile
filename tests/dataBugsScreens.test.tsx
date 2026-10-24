import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatInboxScreen from '@/app/chat/index';
import { DeliveryPartnerCard } from '@/components/delivery/DeliveryPartnerCard';
import { MapUnavailable } from '@/components/common/MapUnavailable';

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
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/chat',
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ accessToken: 'tok' }) }));
const mockThreads = jest.fn();
jest.mock('@/services/chat', () => ({
  fetchOutletThreads: (...a: unknown[]) => mockThreads(...a),
  fetchStoreThreads: (...a: unknown[]) => mockThreads(...a),
}));

afterEach(() => { cleanup(); mockParams = {}; jest.clearAllMocks(); });

function renderChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ChatInboxScreen /></QueryClientProvider>);
}

describe('/chat without a scope', () => {
  it('says what is missing instead of loading forever, and does not fetch', () => {
    renderChat();
    expect(screen.getByText('Choose where to read messages from')).toBeTruthy();
    expect(screen.getByText('Go back')).toBeTruthy();
    expect(mockThreads).not.toHaveBeenCalled();
  });
  it('treats a non-numeric id as missing', () => {
    mockParams = { outletId: 'abc' };
    renderChat();
    expect(screen.getByText('Choose where to read messages from')).toBeTruthy();
  });
  it('still loads when an outlet is given', () => {
    mockParams = { outletId: '7' };
    mockThreads.mockResolvedValue([]);
    renderChat();
    expect(screen.queryByText('Choose where to read messages from')).toBeNull();
    expect(mockThreads).toHaveBeenCalledWith('tok', 7);
  });
});

describe('DeliveryPartnerCard with a placeholder name', () => {
  it('never prints the placeholder', () => {
    render(<DeliveryPartnerCard name="Rider name" showCall={false} />);
    expect(screen.queryByText('Rider name')).toBeNull();
    expect(screen.getAllByText('Delivery partner').length).toBeGreaterThan(0);
  });
});

describe('MapUnavailable', () => {
  it('explains why and keeps the address visible', () => {
    render(<MapUnavailable height={200} address="1 Road, Pune, 411001" />);
    expect(screen.getByText('Map unavailable')).toBeTruthy();
    expect(screen.getByText(/not set up in this version of the app/)).toBeTruthy();
    expect(screen.getByText('1 Road, Pune, 411001')).toBeTruthy();
  });
  it('omits the address line when there is none', () => {
    render(<MapUnavailable height={200} />);
    expect(screen.queryByText(/Pune/)).toBeNull();
  });
});
