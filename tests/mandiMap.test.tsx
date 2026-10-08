import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { MandiMap } from '@/components/delivery/MandiMap';
import { MandiMap as MandiMapWeb } from '@/components/delivery/MandiMap.web';
import { MandiMapSketch } from '@/components/delivery/MandiMapSketch';
import { TruckIcon } from '@/components/delivery/TruckIcon';
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
  Polyline: 'Polyline',
  Circle: 'Circle',
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

  it('the web build draws the schematic when no web key is configured', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    const { UNSAFE_queryByType } = render(<MandiMapWeb driver={fix} destination={outlet} stale={false} />);
    expect(UNSAFE_queryByType(MandiMapSketch)).toBeTruthy();
  });
});

const pickup = { latitude: 12.95, longitude: 77.57 };
type P = { props: Record<string, unknown> };

describe('MandiMap modes (native)', () => {
  beforeEach(() => {
    mockConfigured = true;
  });

  it('no mode behaves as before', () => {
    const { UNSAFE_queryByType, UNSAFE_queryAllByType } = render(
      <MandiMap driver={fix} destination={outlet} stale={false} pickup={pickup} />,
    );
    expect(UNSAFE_queryByType('MapView' as never)).not.toBeNull();
    expect(UNSAFE_queryAllByType('Polyline' as never)).toHaveLength(0);
    expect(UNSAFE_queryAllByType('Circle' as never)).toHaveLength(0);
    expect(UNSAFE_queryAllByType('Marker' as never)).toHaveLength(2);
  });

  it('pending draws a dashed line pickup to drop', () => {
    const { UNSAFE_getAllByType } = render(
      <MandiMap driver={null} destination={outlet} pickup={pickup} stale={false} mode="pending" />,
    );
    const lines = UNSAFE_getAllByType('Polyline' as never) as unknown as P[];
    expect(lines).toHaveLength(1);
    expect(lines[0]?.props.lineDashPattern).toEqual([6, 5]);
    expect(lines[0]?.props.strokeColor).toBe(Colors.routePending);
    expect(lines[0]?.props.coordinates).toEqual([pickup, outlet]);
  });

  it('live after pickup draws a solid line truck to drop', () => {
    const { UNSAFE_getAllByType, UNSAFE_queryAllByType } = render(
      <MandiMap driver={fix} destination={outlet} stale={false} mode="live" />,
    );
    const lines = UNSAFE_getAllByType('Polyline' as never) as unknown as P[];
    expect(lines).toHaveLength(1);
    expect(lines[0]?.props.lineDashPattern).toBeUndefined();
    expect(lines[0]?.props.strokeColor).toBe(Colors.deliveryRoute);
    expect(lines[0]?.props.strokeWidth).toBe(4);
    expect(lines[0]?.props.coordinates).toEqual([{ latitude: 12.97, longitude: 77.59 }, outlet]);
    expect(UNSAFE_queryAllByType('Circle' as never)).toHaveLength(0);
    expect(screen.getByTestId('truck-icon')).toBeTruthy();
  });

  it('arriving draws a 300 m circle', () => {
    const { UNSAFE_getAllByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="arriving" />);
    const circles = UNSAFE_getAllByType('Circle' as never) as unknown as P[];
    expect(circles).toHaveLength(1);
    expect(circles[0]?.props.radius).toBe(300);
    expect(circles[0]?.props.center).toEqual(outlet);
    expect(circles[0]?.props.fillColor).toBe(Colors.geofenceFill);
  });

  it('reached draws a 50 m circle', () => {
    const { UNSAFE_getAllByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="reached" />);
    expect((UNSAFE_getAllByType('Circle' as never)[0] as unknown as P).props.radius).toBe(50);
  });

  it('stale mutes the truck', () => {
    const { UNSAFE_getByType } = render(<MandiMap driver={fix} destination={outlet} stale mode="live" />);
    expect(UNSAFE_getByType(TruckIcon).props.muted).toBe(true);
  });
});

describe('MandiMapSketch modes', () => {
  it('no mode behaves as before: no pickup pin, no truck, no ring', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} stale={false} pickup={pickup} />);
    expect(screen.queryByTestId('truck-icon')).toBeNull();
    expect(screen.queryByTestId('map-geofence')).toBeNull();
    expect(screen.queryByTestId('map-route-pending')).toBeNull();
  });

  it('pending draws the dashed route and no truck', () => {
    render(<MandiMapSketch driver={null} destination={outlet} pickup={pickup} stale={false} mode="pending" />);
    expect(screen.getByTestId('map-route-pending')).toBeTruthy();
    expect(screen.getByTestId('map-pickup')).toBeTruthy();
    expect(screen.queryByTestId('truck-icon')).toBeNull();
  });

  it('pending route is drawn as dashes (several short segments), live is one solid run', () => {
    // Android renders borderStyle dashed on a thin View as solid, so the dashes are real segments.
    const { unmount } = render(<MandiMapSketch driver={null} destination={outlet} pickup={pickup} stale={false} mode="pending" />);
    expect(screen.getAllByTestId('map-dash').length).toBeGreaterThan(4);
    for (const d of screen.getAllByTestId('map-dash')) {
      expect(StyleSheet.flatten(d.props.style).borderStyle).toBeUndefined();
    }
    unmount();
    render(<MandiMapSketch driver={fix} destination={outlet} stale={false} mode="live" />);
    expect(screen.queryAllByTestId('map-dash')).toHaveLength(0);
    expect(screen.getByTestId('map-route-live')).toBeTruthy();
  });

  it('live draws the solid route to the truck, and the truck', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} stale={false} mode="live" />);
    expect(screen.getByTestId('truck-icon')).toBeTruthy();
    expect(screen.getByTestId('map-route-live')).toBeTruthy();
    expect(screen.queryByTestId('map-route-pending')).toBeNull();
  });

  it('arriving and reached draw the geofence ring', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} stale={false} mode="arriving" />);
    expect(screen.getByTestId('map-geofence')).toBeTruthy();
  });

  it('stale mutes the truck', () => {
    const { UNSAFE_getByType } = render(<MandiMapSketch driver={fix} destination={outlet} stale mode="live" />);
    expect(UNSAFE_getByType(TruckIcon).props.muted).toBe(true);
  });
});
