import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { FilterPills } from '@/components/common';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));

afterEach(cleanup);

const ITEMS = [
  { key: 'a', label: 'Active', count: 3 },
  { key: 'l', label: 'Late', count: 0 },
  { key: 'c', label: 'Needs check-in' },
  { key: 'x', label: 'All' },
];

describe('FilterPills', () => {
  it('renders four pills in one horizontal row', () => {
    const { UNSAFE_getByType } = render(<FilterPills items={ITEMS} selected="a" onSelect={jest.fn()} />);
    const scroll = UNSAFE_getByType(ScrollView);
    expect(scroll.props.horizontal).toBe(true);
    const row = StyleSheet.flatten(scroll.props.contentContainerStyle);
    expect(row.flexWrap).toBeUndefined();
    expect(StyleSheet.flatten(scroll.props.style)?.flexWrap).toBeUndefined();
    const pills = screen.getAllByRole('button');
    expect(pills).toHaveLength(4);
    pills.forEach((p) => expect(StyleSheet.flatten(p.props.style).height).toBe(34));
    expect(pills.filter((p) => p.props.accessibilityState?.selected)).toHaveLength(1);
    expect(pills[0].props.accessibilityState.selected).toBe(true);
  });

  it('shows a count only when given, including zero', () => {
    render(<FilterPills items={ITEMS} selected="a" onSelect={jest.fn()} />);
    expect(screen.getByText('Active 3')).toBeTruthy();
    expect(screen.getByText('Late 0')).toBeTruthy();
    expect(screen.getByText('Needs check-in')).toBeTruthy();
  });

  it('calls onSelect with the key', () => {
    const onSelect = jest.fn();
    render(<FilterPills items={ITEMS} selected="a" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('All'));
    expect(onSelect).toHaveBeenCalledWith('x');
  });
});
