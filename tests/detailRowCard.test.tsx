import React from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DetailRowCard } from '@/components/common/DetailRowCard';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const LONG = 'x'.repeat(200);

function flat(node: { props: { style?: unknown } }): ViewStyle {
  return (StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle;
}

describe('DetailRowCard', () => {
  it('row is at least 56 tall', () => {
    render(<DetailRowCard rows={[{ key: 'a', icon: 'navigate-outline', title: 'Status', onPress: jest.fn() }]} />);
    expect(flat(screen.getByTestId('detail-row-a')).minHeight).toBeGreaterThanOrEqual(56);
  });

  it('subtitle wraps to 2 lines', () => {
    render(<DetailRowCard rows={[{ key: 'a', icon: 'location-outline', title: 'Address', subtitle: 'Line one two three' }]} />);
    expect(screen.getByText('Line one two three').props.numberOfLines).toBe(2);
  });

  it('200-char subtitle never squeezes the title', () => {
    render(
      <DetailRowCard
        rows={[{ key: 'a', icon: 'location-outline', title: 'Delivery address', subtitle: LONG, right: <Text>Edit</Text> }]}
      />,
    );
    const title = screen.getByText('Delivery address');
    expect(title.props.numberOfLines).toBe(1);
    expect(screen.getByText(LONG).props.numberOfLines).toBe(2);
    // The text column may shrink (minWidth 0) while the trailing slot may not.
    const column = flat(screen.getByTestId('detail-row-text-a'));
    expect(column.flex).toBe(1);
    expect(column.minWidth).toBe(0);
    expect(flat(screen.getByTestId('detail-row-right-a')).flexShrink).toBe(0);
  });

  it('renders the trailing slot and fires onPress with a role', () => {
    const onPress = jest.fn();
    render(
      <DetailRowCard
        rows={[{ key: 'a', icon: 'navigate-outline', title: 'Out for delivery', right: <Text>Track</Text>, onPress, accessibilityLabel: 'Track order' }]}
      />,
    );
    fireEvent.press(screen.getByLabelText('Track order'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Track order').props.accessibilityRole).toBe('button');
  });
});
