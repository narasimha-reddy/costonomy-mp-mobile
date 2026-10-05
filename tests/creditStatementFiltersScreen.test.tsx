import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FiltersScreen from '@/app/restaurant/credit/statement-filters';

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
  usePathname: () => '/restaurant/credit/statement-filters',
  useLocalSearchParams: () => mockParams,
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
afterEach(cleanup);
beforeEach(() => { jest.clearAllMocks(); mockParams = { agreementId: '3' }; });

function renderScreen() {
  return render(<SafeAreaProvider initialMetrics={METRICS}><FiltersScreen /></SafeAreaProvider>);
}
const applied = () => mockNavigate.mock.calls[0][0];
const isDisabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === true;

describe('Credit statement Filters screen', () => {
  it('has the Period, Type and Paid by sections and nothing else', () => {
    renderScreen();
    expect(screen.getByTestId('rail-period')).toBeTruthy();
    expect(screen.getByTestId('rail-types')).toBeTruthy();
    expect(screen.getByTestId('rail-paidBy')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('Period offers the quick choices with the default ticked, then months', () => {
    renderScreen();
    for (const label of ['Last 30 days', 'Last 90 days', 'Last 6 months', 'Last year', 'Specific months']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByTestId('choice-d90').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('choice-d30').props.accessibilityState.checked).toBe(false);
    expect(screen.getAllByTestId(/^choice-\d{4}-\d{2}$/)).toHaveLength(12);
  });

  it('lists the Type and Paid by choices', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('rail-types'));
    expect(screen.getByText('Orders on credit')).toBeTruthy();
    expect(screen.getByText('Repayments')).toBeTruthy();
    fireEvent.press(screen.getByTestId('rail-paidBy'));
    for (const label of ['Wallet', 'UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('Apply is off until something changes, then sends the filters and the agreement back as params', () => {
    renderScreen();
    expect(isDisabled('apply-filters')).toBe(true);
    fireEvent.press(screen.getByTestId('choice-d30'));
    fireEvent.press(screen.getByTestId('rail-types'));
    fireEvent.press(screen.getByTestId('choice-REPAYMENTS'));
    fireEvent.press(screen.getByTestId('rail-paidBy'));
    fireEvent.press(screen.getByTestId('choice-UPI'));
    fireEvent.press(screen.getByTestId('apply-filters'));
    expect(applied()).toEqual({
      pathname: '/restaurant/credit/statement',
      params: { agreementId: '3', period: 'd30', months: '', types: 'REPAYMENTS', paidBy: 'UPI' },
    });
  });

  it('starts from the filters in the route and Clear all empties them', () => {
    mockParams = { agreementId: '3', period: 'd180', types: 'ORDERS' };
    renderScreen();
    expect(screen.getByTestId('choice-d180').props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByTestId('clear-all'));
    expect(screen.getByTestId('choice-d90').props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByTestId('apply-filters')); // clearing applied filters is allowed
    expect(applied().params).toEqual({ agreementId: '3', period: '', months: '', types: '', paidBy: '' });
  });

  it('a month choice replaces the preset', () => {
    renderScreen();
    const month = screen.getAllByTestId(/^choice-\d{4}-\d{2}$/)[1];
    fireEvent.press(month);
    expect(screen.getByTestId('choice-d90').props.accessibilityState.checked).toBe(false);
    expect(month.props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByTestId('apply-filters'));
    expect(applied().params.months).toMatch(/^\d{4}-\d{2}$/);
  });

  it('refuses a span of over a year (e.g. from a link) with the friendly message', () => {
    mockParams = { agreementId: '3', months: '2020-01,2026-10' };
    renderScreen();
    expect(screen.getByText('Choose a range of up to a year')).toBeTruthy();
    expect(isDisabled('apply-filters')).toBe(true);
    // Unticking the old month brings it back inside a year.
    fireEvent.press(screen.getByTestId('choice-2020-01'));
    expect(screen.queryByText('Choose a range of up to a year')).toBeNull();
    expect(isDisabled('apply-filters')).toBe(false);
  });
});
