import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { formatDay } from '@/lib/wallet/billReview';
import { DateSheet, addDaysISO } from '@/components/wallet/review/DateSheet';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 805 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function setup(props: Partial<React.ComponentProps<typeof DateSheet>> = {}) {
  const onPick = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DateSheet
        visible
        title="Stock-in date"
        value="2026-10-03"
        onPick={onPick}
        onClose={jest.fn()}
        testID="sheet"
        maxDate="2026-10-04"
        tooLateMessage={(max) => `The stock-in date can be at most ${formatDay(max)}.`}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return onPick;
}

describe('DateSheet maxDate', () => {
  it('disables days after maxDate and ignores presses on them', () => {
    const onPick = setup();
    const day = screen.getByTestId('day-2026-10-05');
    expect(day.props.accessibilityState).toMatchObject({ disabled: true });
    expect(day.props.accessibilityLabel).toMatch(/, not available$/);
    fireEvent.press(day);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('lets a day up to maxDate be picked', () => {
    const onPick = setup();
    const day = screen.getByTestId('day-2026-10-04');
    expect(day.props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(day);
    expect(onPick).toHaveBeenCalledWith('2026-10-04');
  });

  it('disables Next month when the whole next month is after maxDate', () => {
    setup();
    expect(screen.getByTestId('date-next').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('keeps Next month enabled when the next month has pickable days', () => {
    setup({ maxDate: '2026-11-02' });
    expect(screen.getByTestId('date-next').props.accessibilityState).toMatchObject({ disabled: false });
  });
});

describe('DateSheet typed date', () => {
  it('picks a typed date', () => {
    const onPick = setup({ maxDate: '2030-01-01' });
    fireEvent.changeText(screen.getByTestId('sheet-typed'), '04/09/2026');
    fireEvent.press(screen.getByTestId('sheet-typed-use'));
    expect(onPick).toHaveBeenCalledWith('2026-09-04');
  });

  it.each([
    ['4 March 2026', '2026-03-04'],
    ['4th September 2026', '2026-09-04'],
    ['March 4, 2026', '2026-03-04'],
  ])('accepts a typed full month name %p', (typed, iso) => {
    const onPick = setup({ maxDate: '2030-01-01' });
    fireEvent.changeText(screen.getByTestId('sheet-typed'), typed);
    fireEvent.press(screen.getByTestId('sheet-typed-use'));
    expect(onPick).toHaveBeenCalledWith(iso);
  });

  it('says when the text is not a date', () => {
    const onPick = setup();
    fireEvent.changeText(screen.getByTestId('sheet-typed'), 'tomorrowish');
    fireEvent(screen.getByTestId('sheet-typed'), 'submitEditing');
    expect(screen.getByText('Enter a date like 04/09/2026.')).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('sheet-typed'), 'tomorrowish2');
    expect(screen.queryByText('Enter a date like 04/09/2026.')).toBeNull();
  });

  it('refuses a typed date after maxDate', () => {
    const onPick = setup();
    fireEvent.changeText(screen.getByTestId('sheet-typed'), '10/10/2026');
    fireEvent.press(screen.getByTestId('sheet-typed-use'));
    expect(screen.getByText('The stock-in date can be at most 4 Oct 2026.')).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('addDaysISO', () => {
  it('crosses month and year ends and leap days', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });
});
