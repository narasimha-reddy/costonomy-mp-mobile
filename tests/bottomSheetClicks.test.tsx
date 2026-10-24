import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { MandiBottomSheet } from '@/components/common/MandiBottomSheet';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

describe('MandiBottomSheet', () => {
  it('stops a click inside the sheet reaching the scrim, so tapping a text box does not close it', () => {
    render(
      <MandiBottomSheet visible onClose={jest.fn()} title="New slot" testID="sheet">
        <Text>Slot name</Text>
      </MandiBottomSheet>,
    );

    const stopPropagation = jest.fn();
    const sheet = screen.getByTestId('sheet');
    // react-native-web turns this prop into a DOM click handler; the test calls it as the DOM would.
    (sheet.props as { onClick: (event: object) => void }).onClick({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
