import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PhoneScreen from '@/app/auth/phone';
import OtpScreen from '@/app/auth/otp';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => ({ phone: '9876543210' }),
  Redirect: () => null,
}));
const mockSignIn = jest.fn();
// The Verify handler as the screen hands it over, even while the button is inert and drops it: a tap that was already
// queued when the automatic send began still reaches that handler.
let mockVerifyHandler: (() => void) | undefined;
jest.mock('@/components/common/MandiButton', () => {
  const actual = jest.requireActual('@/components/common/MandiButton');
  return {
    ...actual,
    MandiButton: (props: { label: string; onPress: () => void }) => {
      if (props.label === 'Verify') mockVerifyHandler = props.onPress;
      return actual.MandiButton(props);
    },
  };
});
jest.mock('@/contexts/SessionProvider', () => ({ useSession: () => ({ signIn: mockSignIn }) }));
jest.mock('@/services/auth', () => ({ requestOtp: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  mockSignIn.mockReset().mockResolvedValue(undefined);
});

describe('phone screen', () => {
  it('focuses the number field', () => {
    render(<PhoneScreen />);
    expect(screen.getByLabelText(/Mobile number/).props.autoFocus).toBe(true);
  });

  it('has a back arrow that goes back, or to the welcome page when there is no history', () => {
    render(<PhoneScreen />);
    fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
    mockCanGoBack = false;
    fireEvent.press(screen.getByLabelText('Back'));
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });
});

describe('code screen', () => {
  it('focuses the code field', () => {
    render(<OtpScreen />);
    expect(screen.getByLabelText(/Six-digit code/).props.autoFocus).toBe(true);
  });

  it('signs in by itself on the sixth digit, once', async () => {
    render(<OtpScreen />);
    const field = screen.getByLabelText(/Six-digit code/);
    fireEvent.changeText(field, '12345');
    expect(mockSignIn).not.toHaveBeenCalled();
    fireEvent.changeText(field, '123456');
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('9876543210', '123456'));
    // Pressing Verify while that is in flight, or re-rendering, must not send it twice.
    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('sends the code once even when a tap on Verify races the automatic send', async () => {
    mockSignIn.mockReturnValue(new Promise(() => {}));   // never resolves: the first send is still in flight
    render(<OtpScreen />);
    await act(async () => { fireEvent.changeText(screen.getByLabelText(/Six-digit code/), '123456'); });
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    // The button is already showing its spinner, but a tap queued before that render still reaches the handler.
    await act(async () => { mockVerifyHandler?.(); });
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('asks the keyboard for the SMS code', () => {
    render(<OtpScreen />);
    const field = screen.getByLabelText(/Six-digit code/);
    expect(field.props.textContentType).toBe('oneTimeCode');
    expect(field.props.autoComplete).toBe('sms-otp');
  });
});
