import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import QuickScanIndexScreen from '@/app/restaurant/quickscan/index';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/contexts/OutletProvider', () => ({ useOutlet: () => ({ outletId: 7 }) }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));

// The scanner itself needs the camera: stand in for it, keeping the props the screen gives it.
let mockScanned: ((text: string) => void) | undefined;
let mockManual: (() => void) | undefined;
let mockNotice: string | null | undefined;
jest.mock('@/components/quickscan/QrScanner', () => ({
  QrScanner: ({ onScan, onManualEntry, notice, children }: {
    onScan: (t: string) => void; onManualEntry: () => void; notice?: string | null; children?: React.ReactNode;
  }) => {
    const { Text, View } = jest.requireActual('react-native');
    mockScanned = onScan; mockManual = onManualEntry; mockNotice = notice;
    return <View>{children}<Text>{notice ?? ''}</Text></View>;
  },
}));

function renderScreen() {
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 35, left: 0, right: 0, bottom: 0 } }}>
      <QuickScanIndexScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => { mockPush.mockClear(); });

describe('QuickScan screen', () => {
  it('a scanned UPI code goes to the pay screen with what the code carried', () => {
    renderScreen();
    act(() => mockScanned?.('upi://pay?pa=shop@okbank&pn=Sharma%20Dairy&am=120'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/restaurant/quickscan/pay',
      params: { vpa: 'shop@okbank', name: 'Sharma Dairy', amount: '120' },
    });
  });

  it('a code that is not a UPI QR stays on the camera and says so', () => {
    renderScreen();
    act(() => mockScanned?.('https://example.com'));
    expect(mockPush).not.toHaveBeenCalled();
    // Re-render happened: the notice reached the scanner.
    expect(mockNotice).toBeTruthy();
  });

  it('a typed UPI ID goes through the same parser from the sheet', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Help with scanning'));
    expect(screen.getByText('Scanning a QR')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close the scanning help'));

    act(() => mockManual?.());
    expect(screen.getByText('Enter UPI ID or paste a UPI link')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('quickscan-upi-field'), 'nope');
    fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('quickscan-upi-field'), 'shop@okbank');
    fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/restaurant/quickscan/pay', params: { vpa: 'shop@okbank' } });
  });
});
