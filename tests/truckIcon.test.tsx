import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { TruckTopIcon } from '@/components/delivery/TruckTopIcon';
import { LOGO_DEEP_D, LOGO_LIGHT_D } from '@/lib/maps/truckSvg';
import { Colors } from '@/theme';

type TestNode = { props: Record<string, unknown> };

function fills(): string[] {
  return screen.UNSAFE_root
    .findAll((n: TestNode) => typeof n.props?.fill === 'string')
    .map((n: TestNode) => n.props.fill as string);
}
const withD = (d: string) => screen.UNSAFE_root.findAll((n: TestNode) => n.props?.d === d);
const transformOf = () => StyleSheet.flatten(screen.getByTestId('truck-icon').props.style)?.transform;

describe('TruckTopIcon', () => {
  it('draws the white cargo roof, the orange cab and the Costonomy C on the roof', () => {
    render(<TruckTopIcon />);
    expect(fills()).toEqual(
      expect.arrayContaining([Colors.truckRoof, Colors.truckBody, Colors.truckLogoSand, Colors.truckLogoOrange]),
    );
    expect(withD(LOGO_LIGHT_D).length).toBeGreaterThan(0);
    expect(withD(LOGO_DEEP_D).length).toBeGreaterThan(0);
    expect(withD(LOGO_LIGHT_D)[0]!.props.fill).toBe(Colors.truckLogoSand);
    expect(withD(LOGO_DEEP_D)[0]!.props.fill).toBe(Colors.truckLogoOrange);
    expect(fills()).not.toContain(Colors.truckMuted);
  });

  it('muted uses the muted palette', () => {
    render(<TruckTopIcon muted />);
    expect(fills()).toEqual(expect.arrayContaining([Colors.truckMuted, Colors.truckMutedLight, Colors.truckMutedRoof]));
    expect(fills()).not.toContain(Colors.truckBody);
    expect(fills()).not.toContain(Colors.truckLogoOrange);
    expect(fills()).not.toContain(Colors.truckLogoSand);
    // Still a C on the roof, in grey.
    expect(withD(LOGO_DEEP_D).length).toBeGreaterThan(0);
  });

  it('rotates to the heading; north needs no transform', () => {
    const { rerender } = render(<TruckTopIcon />);
    expect(transformOf()).toBeUndefined();
    rerender(<TruckTopIcon heading={135} />);
    expect(transformOf()).toEqual([{ rotate: '135deg' }]);
  });

  it('is a square of the size asked for', () => {
    render(<TruckTopIcon size={30} />);
    const svg = screen.getByLabelText('Delivery truck');
    expect(svg.props.width ?? StyleSheet.flatten(svg.props.style)?.width).toBe(30);
  });
});
