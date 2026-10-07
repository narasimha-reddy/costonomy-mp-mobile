import React from 'react';
import { cleanup, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { RoundAction } from '@/components/wallet/RoundAction';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Ionicons: ({ name, color, size }: { name: string; color?: string; size?: number }) =>
      <Text testID={`glyph-${name}`} style={{ color }} accessibilityHint={String(size)}>{`icon:${name}`}</Text>,
    MaterialCommunityIcons: ({ name, color, size }: { name: string; color?: string; size?: number }) =>
      <Text testID={`glyph-${name}`} style={{ color }} accessibilityHint={String(size)}>{`mci:${name}`}</Text>,
  };
});

jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null, PROVIDER_GOOGLE: 'google' }));

afterEach(cleanup);

const glyphColor = (name: string) => (StyleSheet.flatten(screen.getByTestId(`glyph-${name}`).props.style) as { color?: string }).color;

describe('RoundAction icons', () => {
  it('renders an Ionicons name given as a plain string', () => {
    render(<RoundAction icon="wallet-outline" label="Add" onPress={jest.fn()} />);
    expect(screen.getByText('icon:wallet-outline')).toBeTruthy();
  });

  it('renders an ion object and an mci object with the right icon set', () => {
    render(
      <>
        <RoundAction icon={{ set: 'ion', name: 'storefront-outline' }} label="A" onPress={jest.fn()} />
        <RoundAction icon={{ set: 'mci', name: 'cash-check' }} label="B" onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByText('icon:storefront-outline')).toBeTruthy();
    expect(screen.getByText('mci:cash-check')).toBeTruthy();
  });

  it('passes the accessibility hint through', () => {
    render(<RoundAction icon="cash-outline" label="Pay" accessibilityHint="Pays from your Mandi wallet" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Pay')).toHaveProp('accessibilityHint', 'Pays from your Mandi wallet');
  });
});

describe('RoundAction glyphTone', () => {
  it('default tone keeps the wallet colours: primary orange outline, white on filled', () => {
    render(
      <>
        <RoundAction icon="add-outline" label="A" onPress={jest.fn()} />
        <RoundAction icon="remove-outline" label="B" primary onPress={jest.fn()} />
      </>,
    );
    expect(glyphColor('add-outline')).toBe(Colors.primary);
    expect(glyphColor('remove-outline')).toBe(Colors.textInverse);
  });

  it('strong tone darkens only the outline glyph, never the filled one', () => {
    render(
      <>
        <RoundAction icon={{ set: 'mci', name: 'cash-check' }} label="A" glyphTone="strong" onPress={jest.fn()} />
        <RoundAction icon="cash-outline" label="B" primary glyphTone="strong" onPress={jest.fn()} />
      </>,
    );
    expect(glyphColor('cash-check')).toBe(Colors.primaryDark);
    expect(glyphColor('cash-outline')).toBe(Colors.textInverse);
  });
});
