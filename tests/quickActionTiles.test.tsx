import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QuickActionTiles, type MoneyAction } from '@/components/wallet/QuickActionTiles';

// The icon font loader needs native modules the test runtime does not have.
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

function setup(scanEnabled: boolean) {
  const onScan = jest.fn();
  const onWallet = jest.fn();
  const actions: MoneyAction[] = [
    {
      key: 'quickscan', label: 'Quick Scan', icon: 'qr-code-outline', visible: scanEnabled,
      accessibilityLabel: 'Quick Scan. Pay a shop by scanning its QR.', onPress: onScan,
    },
    { key: 'wallet', label: 'Wallet', icon: 'wallet-outline', visible: true, onPress: onWallet },
  ];
  render(<QuickActionTiles actions={actions} />);
  return { onScan, onWallet };
}

describe('QuickActionTiles (Money Transfers)', () => {
  it('shows the heading, both actions in order, and two empty slots', () => {
    const h = setup(true);
    expect(screen.getByText('Money Transfers')).toBeTruthy();
    expect(screen.getByText('Quick Scan')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
    expect(screen.getAllByTestId('action-spacer')).toHaveLength(2);

    const order = screen.getAllByRole('button').map((b) => b.props.testID);
    expect(order).toEqual(['action-quickscan', 'action-wallet']);
    expect(screen.getByText('icon:qr-code-outline')).toBeTruthy();
    expect(screen.getByText('icon:wallet-outline')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Quick Scan. Pay a shop by scanning its QR.'));
    expect(h.onScan).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Wallet'));
    expect(h.onWallet).toHaveBeenCalledTimes(1);
    expect(h.onScan).toHaveBeenCalledTimes(1);
  });

  it('leaves Quick Scan out when disabled; Wallet takes the first slot', () => {
    setup(false);
    expect(screen.queryByText('Quick Scan')).toBeNull();
    expect(screen.queryByTestId('action-quickscan')).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.props.testID)).toEqual(['action-wallet']);
    expect(screen.getAllByTestId('action-spacer')).toHaveLength(3);
  });

  it('shows no balance or Add money on home', () => {
    setup(true);
    expect(screen.queryByText(/₹/)).toBeNull();
    expect(screen.queryByText(/add money/i)).toBeNull();
  });

  it('caps at four columns and renders no spacers when full', () => {
    const actions: MoneyAction[] = ['a', 'b', 'c', 'd', 'e'].map((k) => ({
      key: k, label: `Act ${k}`, icon: 'add', visible: true, onPress: jest.fn(),
    }));
    render(<QuickActionTiles actions={actions} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.queryAllByTestId('action-spacer')).toHaveLength(0);
  });
});
