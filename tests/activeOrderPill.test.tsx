import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActiveOrderPill } from '@/components/delivery/ActiveOrderPill';

jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

describe('ActiveOrderPill', () => {
  it('ETA badge only with etaMins', () => {
    const { rerender } = render(
      <ActiveOrderPill supplierName="Fresh Farms" statusText="Order is on the way" etaMins={14} onPress={jest.fn()} />,
    );
    expect(screen.getByText('arriving in')).toBeTruthy();
    expect(screen.getByText('14 mins')).toBeTruthy();
    expect(screen.getByText('Fresh Farms')).toBeTruthy();
    expect(screen.getByText('Order is on the way')).toBeTruthy();

    rerender(<ActiveOrderPill supplierName="Fresh Farms" statusText="Packing your order" etaMins={null} onPress={jest.fn()} />);
    expect(screen.queryByText('arriving in')).toBeNull();
    expect(screen.queryByText(/mins/)).toBeNull();

    rerender(<ActiveOrderPill supplierName="Fresh Farms" statusText="Packing your order" onPress={jest.fn()} />);
    expect(screen.queryByText('arriving in')).toBeNull();
  });

  it('tap opens tracking', () => {
    const onPress = jest.fn();
    render(<ActiveOrderPill supplierName="Fresh Farms" statusText="Order is on the way" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a request pill carries its own label and no ETA', () => {
    render(
      <ActiveOrderPill
        supplierName="Fresh Farms accepted your request"
        statusText="Place your order before 6:30 pm"
        accessibilityLabel="Request answered: Fresh Farms accepted your request. Place your order"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText(/Request answered/)).toBeTruthy();
    expect(screen.queryByLabelText(/Order in progress/)).toBeNull();
    expect(screen.queryByText('arriving in')).toBeNull();
  });
});
