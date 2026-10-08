import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MandiSearchBar } from '@/components/common/MandiSearchBar';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

const box = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

describe('MandiSearchBar focus indicator', () => {
  it('always has a 2 px border, transparent until focused, so focus changes only the colour', () => {
    render(<MandiSearchBar testID="q" value="" onChangeText={() => {}} />);
    expect(box('q-container')).toMatchObject({ borderWidth: 2, borderColor: 'transparent' });
    fireEvent(screen.getByTestId('q'), 'focus');
    expect(box('q-container')).toMatchObject({ borderWidth: 2, borderColor: Colors.primary });
    fireEvent(screen.getByTestId('q'), 'blur');
    expect(box('q-container')).toMatchObject({ borderWidth: 2, borderColor: 'transparent' });
  });

  it('the caller\'s style cannot override the focus indicator', () => {
    render(<MandiSearchBar testID="q" value="" onChangeText={() => {}} style={{ borderColor: 'red', borderWidth: 0 }} />);
    fireEvent(screen.getByTestId('q'), 'focus');
    expect(box('q-container')).toMatchObject({ borderWidth: 2, borderColor: Colors.primary });
  });

  it('derives the container id from the testID, so two bars never share one', () => {
    render(<>
      <MandiSearchBar testID="a" value="" onChangeText={() => {}} />
      <MandiSearchBar testID="b" value="" onChangeText={() => {}} />
    </>);
    expect(screen.getByTestId('a-container')).toBeTruthy();
    expect(screen.getByTestId('b-container')).toBeTruthy();
    expect(screen.queryByTestId('search-field-container')).toBeNull();
  });
});
