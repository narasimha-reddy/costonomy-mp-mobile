import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { TruckIcon } from '@/components/delivery/TruckIcon';
import { Colors } from '@/theme';

type TestNode = { props: Record<string, unknown> };

function fills(): string[] {
  return screen.UNSAFE_root
    .findAll((n: TestNode) => typeof n.props?.fill === 'string')
    .map((n: TestNode) => n.props.fill as string);
}

describe('TruckIcon', () => {
  it('uses the orange parcel and dark cab by default', () => {
    render(<TruckIcon />);
    expect(fills()).toEqual(expect.arrayContaining([Colors.truckParcel, Colors.truckParcelLight, Colors.truckCab]));
    expect(fills()).not.toContain(Colors.truckMuted);
  });

  it('muted uses the muted palette', () => {
    render(<TruckIcon muted />);
    expect(fills()).toEqual(expect.arrayContaining([Colors.truckMuted, Colors.truckMutedLight]));
    expect(fills()).not.toContain(Colors.truckParcel);
  });

  it('flip mirrors', () => {
    const { rerender } = render(<TruckIcon />);
    expect(StyleSheet.flatten(screen.getByTestId('truck-icon').props.style)?.transform).toBeUndefined();
    rerender(<TruckIcon flip />);
    expect(StyleSheet.flatten(screen.getByTestId('truck-icon').props.style)?.transform).toEqual([{ scaleX: -1 }]);
  });
});
