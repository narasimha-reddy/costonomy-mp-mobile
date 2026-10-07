import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Modal, Text, TextInput } from 'react-native';
import { MandiBottomSheet } from '@/components/common/MandiBottomSheet';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});

const onClose = jest.fn();
beforeEach(() => onClose.mockClear());

function renderSheet() {
  return render(
    <MandiBottomSheet visible onClose={onClose} title="Pay" closeLabel="Close the pay sheet" testID="sheet">
      <Text testID="plain-text">Some words</Text>
      <TextInput testID="amount-field" />
    </MandiBottomSheet>,
  );
}

describe('MandiBottomSheet taps', () => {
  it('does not close when sheet content is pressed (text, field, the sheet itself)', () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('plain-text'));
    fireEvent.press(screen.getByTestId('amount-field'));
    fireEvent.press(screen.getByTestId('sheet'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the dimmed backdrop is pressed', () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the close button and Android back working', () => {
    renderSheet();
    fireEvent.press(screen.getByLabelText('Close the pay sheet'));
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('puts the backdrop beside the sheet, not around it', () => {
    renderSheet();
    const backdrop = screen.getByTestId('sheet-backdrop');
    const sheet = screen.getByTestId('sheet');
    let node = sheet.parent;
    while (node != null) {
      expect(node).not.toBe(backdrop);
      node = node.parent;
    }
  });
});
