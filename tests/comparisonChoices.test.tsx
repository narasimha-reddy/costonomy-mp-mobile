import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  ComparisonChoicesBar, DEFAULT_COMPARISON, DISTANCE_CHIPS_FROM, comparisonIsFiltered,
  describeComparisonFilters, type ComparisonChoices,
} from '@/components/restaurant/ComparisonChoices';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

function setup(over: Partial<{ choices: ComparisonChoices; supplierCount: number; need: string }> = {}) {
  const onChange = jest.fn();
  const onNeedChange = jest.fn();
  render(
    <ComparisonChoicesBar
      choices={over.choices ?? DEFAULT_COMPARISON}
      onChange={onChange}
      need={over.need ?? '1'}
      onNeedChange={onNeedChange}
      unit="KG"
      supplierCount={over.supplierCount ?? 3}
    />,
  );
  return { onChange, onNeedChange };
}

describe('the supplier comparison choices', () => {
  it('offers the four sorts, with best value selected, and changes only the sort when one is pressed', () => {
    const { onChange } = setup();

    for (const label of ['Best value', 'Lowest price', 'Nearest', 'Top rated']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByLabelText('Sort by Best value').props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByText('Lowest price'));
    expect(onChange).toHaveBeenCalledWith({ sort: 'price' });
  });

  it('toggles "covers my quantity" and "open now", keeping the sort', () => {
    const { onChange } = setup({ choices: { sort: 'nearest' } });

    fireEvent.press(screen.getByText('Covers my quantity'));
    expect(onChange).toHaveBeenLastCalledWith({ sort: 'nearest', coversQuantity: true });

    fireEvent.press(screen.getByText('Open now'));
    expect(onChange).toHaveBeenLastCalledWith({ sort: 'nearest', openNow: true });
  });

  it('turns a filter off by pressing it again', () => {
    const { onChange } = setup({ choices: { sort: 'best_value', openNow: true } });

    fireEvent.press(screen.getByText('Open now'));

    expect(onChange).toHaveBeenCalledWith({ sort: 'best_value', openNow: undefined });
  });

  it('shows the distance chips only for a long list, or when one is already on', () => {
    setup({ supplierCount: DISTANCE_CHIPS_FROM - 1 });
    expect(screen.queryByText('5 km')).toBeNull();
  });

  it('shows the distance chips on a long list and lets one be picked', () => {
    const { onChange } = setup({ supplierCount: DISTANCE_CHIPS_FROM });

    fireEvent.press(screen.getByText('10 km'));

    expect(onChange).toHaveBeenCalledWith({ sort: 'best_value', radiusKm: 10 });
  });

  it('keeps the distance chips while one is on, even when the filtered list is short', () => {
    setup({ supplierCount: 2, choices: { sort: 'best_value', radiusKm: 5 } });
    expect(screen.getByText('5 km')).toBeTruthy();
  });

  it('takes the quantity the buyer needs, digits and a point only', () => {
    const { onNeedChange } = setup({ need: '1' });

    fireEvent.changeText(screen.getByLabelText('Quantity you need'), '2o.5kg');

    expect(onNeedChange).toHaveBeenCalledWith('2.5');
    expect(screen.getByText('KG')).toBeTruthy();
  });

  it('describes active filters for the empty state, and counts sort as no filter', () => {
    expect(comparisonIsFiltered({ sort: 'rating' })).toBe(false);
    expect(comparisonIsFiltered({ sort: 'best_value', openNow: true })).toBe(true);
    expect(describeComparisonFilters({ sort: 'price', coversQuantity: true, radiusKm: 5 }))
      .toEqual(['covers your quantity', 'within 5 km']);
  });
});
