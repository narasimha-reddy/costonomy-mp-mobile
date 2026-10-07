import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { OrderPlacedHero } from '@/components/delivery/OrderPlacedHero';
import { clockTime } from '@/lib/delivery/deliveryPartner';
import { Colors } from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Marker: 'Marker', PROVIDER_GOOGLE: 'google' }));

const PLACED = '2026-10-07T13:21:00Z';
const props = {
  placedAt: PLACED, supplier: 'Sri Balaji Traders', outletName: 'Kitchen',
  address: '408, Medha Prestige, Indiranagar, Bengaluru',
  segments: ['Placed', 'Confirmed', 'Packed', 'On the way', 'Delivered'], segmentIndex: 0,
};

describe('OrderPlacedHero', () => {
  it('placed hero shows the time and the address', () => {
    render(<OrderPlacedHero {...props} />);
    expect(screen.getByText(`Order placed at ${clockTime(PLACED)}`)).toBeTruthy();
    expect(screen.getByText('Sri Balaji Traders')).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
    expect(screen.getByText('408, Medha Prestige, Indiranagar, Bengaluru')).toBeTruthy();
  });

  it('draws a green tick circle and a progress bar', () => {
    render(<OrderPlacedHero {...props} />);
    const circle = screen.getByTestId('placed-tick', { includeHiddenElements: true });
    const style = Array.isArray(circle.props.style) ? Object.assign({}, ...circle.props.style) : circle.props.style;
    expect(style.backgroundColor).toBe(Colors.success);
    expect(style.width).toBe(84);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('copes with no time and no address', () => {
    render(<OrderPlacedHero {...props} placedAt={null} address={null} />);
    expect(screen.getByText('Order placed')).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
  });
});
