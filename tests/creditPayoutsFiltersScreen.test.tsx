import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FiltersScreen from '@/app/supplier/credit/payouts-filters';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: jest.fn(), push: jest.fn() }),
  usePathname: () => '/supplier/credit/payouts-filters',
  useLocalSearchParams: () => mockParams,
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
afterEach(cleanup);
beforeEach(() => { jest.clearAllMocks(); mockParams = {}; });
const renderScreen = () => render(<SafeAreaProvider initialMetrics={METRICS}><FiltersScreen /></SafeAreaProvider>);
const isDisabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;

describe('Payouts Filters screen', () => {
  it('has only the Period section', () => {
    renderScreen();
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByTestId('rail-period')).toBeTruthy();
  });
  it('starts with nothing ticked and Apply off', () => {
    renderScreen();
    expect(isDisabled('apply-filters')).toBe(true);
  });
  it('sends a quick choice back to the payouts screen', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('choice-d30'));
    expect(isDisabled('apply-filters')).toBe(false);
    fireEvent.press(screen.getByTestId('apply-filters'));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/supplier/credit/payouts', params: { period: 'd30', months: '' } });
  });
  it('sends months back', () => {
    renderScreen();
    const month = '2026-09';
    fireEvent.press(screen.getByTestId(`choice-${month}`));
    fireEvent.press(screen.getByTestId('apply-filters'));
    expect(mockNavigate.mock.calls[0][0].params).toEqual({ period: '', months: month });
  });
  it('can clear what is in force', () => {
    mockParams = { period: 'd90' };
    renderScreen();
    expect(isDisabled('apply-filters')).toBe(false);
    fireEvent.press(screen.getByTestId('clear-all'));
    fireEvent.press(screen.getByTestId('apply-filters'));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/supplier/credit/payouts', params: { period: '', months: '' } });
  });
});
