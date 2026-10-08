import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DeliveryDayChoice } from '@/components/restaurant/DeliveryDayChoice';
import { dayLabel } from '@/lib/delivery/deliveryDay';

jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

describe('the cart delivery day', () => {
  it('offers a short set of chips, not a month of days', () => {
    const onChange = jest.fn();
    render(<DeliveryDayChoice value={{ offset: null, byHour: null }} onChange={onChange} />);
    expect(screen.getByLabelText('Delivery: As soon as possible')).toBeTruthy();
    expect(screen.getByLabelText('Delivery: Later today')).toBeTruthy();
    expect(screen.getByLabelText('Delivery: Tomorrow')).toBeTruthy();
    expect(screen.getByLabelText('Delivery: Pick a date')).toBeTruthy();
    expect(screen.queryByLabelText('Delivery: Immediate')).toBeNull();
    expect(screen.queryByLabelText(`Delivery: ${dayLabel(5)}`)).toBeNull();
  });

  it('Pick a date reveals the rest, and picking one sends its offset unchanged', () => {
    const onChange = jest.fn();
    render(<DeliveryDayChoice value={{ offset: null, byHour: null }} onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Delivery: Pick a date'));
    fireEvent.press(screen.getByLabelText(`Delivery: ${dayLabel(5)}`));
    expect(onChange).toHaveBeenCalledWith({ offset: 5, byHour: null });
  });

  it('Later today is today (offset 0) and As soon as possible is no day', () => {
    const onChange = jest.fn();
    render(<DeliveryDayChoice value={{ offset: 1, byHour: null }} onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Delivery: Later today'));
    expect(onChange).toHaveBeenLastCalledWith({ offset: 0, byHour: null });
    fireEvent.press(screen.getByLabelText('Delivery: As soon as possible'));
    expect(onChange).toHaveBeenLastCalledWith({ offset: null, byHour: null });
  });

  it('a date picked from further out keeps its own chip, selected', () => {
    render(<DeliveryDayChoice value={{ offset: 9, byHour: null }} onChange={jest.fn()} />);
    expect(screen.getByLabelText(`Delivery: ${dayLabel(9)}`).props.accessibilityState.selected).toBe(true);
  });
});
