import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { DetailRow } from '@/components/restaurant/DetailRow';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

describe('DetailRow', () => {
  it('lets a long value wrap beside its label instead of squeezing the label to a letter a line', () => {
    render(
      <DetailRow
        label="Destination"
        value="Koramangala Main Road, Bengaluru, Karnataka, 560038, near the old post office"
      />,
    );

    const label = StyleSheet.flatten(screen.getByTestId('detail-row-label').props.style);
    const value = StyleSheet.flatten(screen.getByTestId('detail-row-value').props.style);

    // The label keeps its width (it cannot be shrunk to nothing) but never takes more than its share...
    expect(label.flexShrink).toBe(0);
    expect(label.maxWidth).toBe('45%');
    // ...and the value takes the rest and wraps.
    expect(value.flex).toBe(1);
    expect(value.textAlign).toBe('right');
  });

  it('shows the label, its hint and the value', () => {
    render(<DetailRow label="Delivery" hint="Free" value="₹0" />);
    expect(screen.getByText('Delivery')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('₹0')).toBeTruthy();
  });
});
