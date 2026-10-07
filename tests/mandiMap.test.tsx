import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { MandiMap } from '@/components/delivery/MandiMap';
import { MandiMap as MandiMapWeb } from '@/components/delivery/MandiMap.web';
import { MandiMapSketch } from '@/components/delivery/MandiMapSketch';
import { Colors } from '@/theme';

let mockConfigured = false;
jest.mock('@/lib/maps/config', () => ({
  get MAPS_CONFIGURED() {
    return mockConfigured;
  },
}));
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
  PROVIDER_DEFAULT: null,
}));

const fix = { latitude: '12.97', longitude: '77.59', bearing: null, recordedAt: '2026-01-01T10:00:00Z' };
const outlet = { latitude: 12.98, longitude: 77.6 };

describe('MandiMap (native)', () => {
  it('draws the schematic and does not mount MapView when no Maps key is configured', () => {
    mockConfigured = false;
    const { UNSAFE_queryByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    expect(UNSAFE_queryByType('MapView' as never)).toBeNull();
    expect(screen.getByTestId('map-driver')).toBeTruthy();
    expect(screen.getByLabelText('Partner position')).toBeTruthy();
  });

  it('mounts the real MapView when a key is configured', () => {
    mockConfigured = true;
    const { UNSAFE_queryByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} />);
    expect(UNSAFE_queryByType('MapView' as never)).not.toBeNull();
    expect(screen.queryByTestId('map-driver')).toBeNull();
  });

  it('renders nothing with no fix and no destination, with or without a key', () => {
    for (const configured of [false, true]) {
      mockConfigured = configured;
      const { toJSON } = render(<MandiMap driver={null} destination={null} stale={false} />);
      expect(toJSON()).toBeNull();
    }
  });
});

describe('MandiMapSketch honesty', () => {
  it('draws no driver dot without a fix, only the destination', () => {
    render(<MandiMapSketch driver={null} destination={outlet} stale={false} />);
    expect(screen.queryByTestId('map-driver')).toBeNull();
    expect(screen.getByLabelText('Waiting for the partner')).toBeTruthy();
  });

  it('draws a live fix with its halo in the live colour', () => {
    const { toJSON } = render(<MandiMapSketch driver={fix} destination={outlet} stale={false} />);
    const slot = screen.getByTestId('map-driver');
    expect(slot.children).toHaveLength(2); // halo + dot
    expect(JSON.stringify(toJSON())).toContain(Colors.deliveryDriver);
    expect(screen.getByLabelText('Partner position')).toBeTruthy();
  });

  it('draws a stale fix grey, without its halo, labelled as last known', () => {
    const { toJSON } = render(<MandiMapSketch driver={fix} destination={outlet} stale />);
    const slot = screen.getByTestId('map-driver');
    expect(slot.children).toHaveLength(1); // dot only
    const dot = slot.children[0] as { props: { style: unknown } };
    expect((StyleSheet.flatten(dot.props.style as never) as { backgroundColor?: string }).backgroundColor).toBe(Colors.stale);
    expect(screen.getByLabelText('Last known partner position')).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toContain('"opacity":0.22');
  });

  it('is what the web build exports', () => {
    expect(MandiMapWeb).toBe(MandiMapSketch);
  });
});
