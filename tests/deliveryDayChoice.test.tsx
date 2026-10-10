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
    expect(screen.getByLabelText(`Delivery: Pick a date, ${dayLabel(9)} chosen`).props.accessibilityState.selected).toBe(true);
    expect(screen.getAllByLabelText(`Delivery: ${dayLabel(9)}`)[0].props.accessibilityState.selected).toBe(true);
  });
});

describe('the Pick a date chip', () => {
  it('is not selected while nothing farther is chosen, and says whether it is open', () => {
    render(<DeliveryDayChoice value={{ offset: null, byHour: null }} onChange={jest.fn()} />);
    const chip = screen.getByLabelText('Delivery: Pick a date');
    expect(chip.props.accessibilityState).toMatchObject({ selected: false, expanded: false });
    fireEvent.press(chip);
    expect(screen.getByLabelText('Delivery: Pick a date').props.accessibilityState)
      .toMatchObject({ selected: false, expanded: true });
  });

  it('shows the chosen farther date and is selected', () => {
    render(<DeliveryDayChoice value={{ offset: 5, byHour: null }} onChange={jest.fn()} />);
    expect(screen.queryByLabelText('Delivery: Pick a date')).toBeNull();
    const toggle = screen.getByLabelText(`Delivery: Pick a date, ${dayLabel(5)} chosen`);
    expect(toggle.props.accessibilityState).toMatchObject({ selected: true, expanded: true });
    expect(screen.getAllByText(dayLabel(5)).length).toBe(2);
  });
});

describe('chip rows never clip a chip', () => {
  // A horizontal scroller leaves its last visible chip cut off at the screen edge (seen at 360 px, 1.3x font), and
  // nothing says to swipe. Rows wrap instead, so every chip is whole.
  const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

  it('uses no horizontal scroller, with the farther dates open', () => {
    const { UNSAFE_queryAllByType } = render(<DeliveryDayChoice value={{ offset: 5, byHour: null }} onChange={jest.fn()} />);
    const { ScrollView } = jest.requireActual('react-native');
    expect(UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  });

  it('the day row and the farther-dates row wrap', () => {
    render(<DeliveryDayChoice value={{ offset: 5, byHour: null }} onChange={jest.fn()} />);
    // The nearest host ancestor that is a flex row is the chip row.
    const rowOf = (chip: { parent: any }) => {
      let node = chip.parent;
      while (node != null && flat(node.props.style).flexDirection !== 'row') node = node.parent;
      return node;
    };
    const chips = [screen.getByLabelText('Delivery: As soon as possible'), screen.getAllByLabelText(`Delivery: ${dayLabel(5)}`)[0]];
    for (const chip of chips) {
      const style = flat(rowOf(chip)?.props.style);
      expect(style.flexDirection).toBe('row');
      expect(style.flexWrap).toBe('wrap');
    }
  });
});
