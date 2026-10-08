import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { MandiMap } from '@/components/delivery/MandiMap';
import { MandiMap as MandiMapWeb } from '@/components/delivery/MandiMap.web';
import { MandiMapSketch } from '@/components/delivery/MandiMapSketch';
import { TruckTopIcon } from '@/components/delivery/TruckTopIcon';
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

  it('frames the same points as the web map: truck and supplier before pickup, a far-off fix ignored', () => {
    const far = { latitude: 13.3, longitude: 78.0 };
    const before = render(<MandiMap driver={fix} destination={far} pickup={pickup} stale={false} mode="live" />);
    const r1 = (before.UNSAFE_getByType('MapView' as never) as unknown as P).props.region as { latitude: number; latitudeDelta: number };
    expect(r1.latitude + r1.latitudeDelta / 2).toBeLessThan(13.0); // the restaurant 40 km away is not framed
    before.unmount();
    const gurugram = { ...fix, latitude: '28.4595', longitude: '77.0266' };
    const bad = render(<MandiMap driver={gurugram} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    const r2 = (bad.UNSAFE_getByType('MapView' as never) as unknown as P).props.region as { latitude: number; latitudeDelta: number };
    expect(r2.latitude + r2.latitudeDelta / 2).toBeLessThan(13.1);
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
    expect(UNSAFE_getByType(TruckTopIcon).props.muted).toBe(true);
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
    expect(UNSAFE_getByType(TruckTopIcon).props.muted).toBe(true);
  });

  it('renders exactly one truck', () => {
    for (const mode of ['live', 'arriving', 'reached'] as const) {
      const { unmount } = render(<MandiMapSketch driver={fix} destination={outlet} pickup={pickup} stale={false} mode={mode} />);
      expect(screen.getAllByTestId('truck-icon')).toHaveLength(1);
      expect(screen.getAllByTestId('map-driver')).toHaveLength(1);
      unmount();
    }
  });

  it('the truck faces along the sketched road it is on: onward to the drop, back to the supplier before pickup', () => {
    const rotation = () => StyleSheet.flatten(screen.getByTestId('truck-icon').props.style)?.transform;
    // ~1.5 km out: on the last, eastbound leg of the sketch.
    const { unmount } = render(<MandiMapSketch driver={fix} destination={outlet} stale={false} mode="live" />);
    expect(rotation()).toEqual([{ rotate: '90deg' }]);
    unmount();
    // Before pickup the truck is driving to the supplier, the other way along the drawn road.
    const before = render(<MandiMapSketch driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    expect(rotation()).toEqual([{ rotate: '270deg' }]);
    before.unmount();
    // Far out: on the first, northbound leg.
    render(<MandiMapSketch driver={{ ...fix, latitude: '12.9', longitude: '77.5' }} destination={outlet} stale={false} mode="live" />);
    expect(rotation()).toBeUndefined();
  });

  it('pickup and drop pins carry labels', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    expect(screen.getByText('Supplier')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
  });

  it('the supplier screen labels the restaurant pin Restaurant, not You', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" audience="supplier" />);
    expect(screen.getByText('Restaurant')).toBeTruthy();
    expect(screen.queryByText('You')).toBeNull();
  });

  it('the supplier pin and label stay after pickup, when the caller no longer passes a pickup', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} stale={false} mode="live" />);
    expect(screen.getByTestId('map-pickup')).toBeTruthy();
    expect(screen.getByText('Supplier')).toBeTruthy();
  });

  it('before pickup draws solid truck-to-pickup and dashed pickup-to-drop', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    expect(screen.getByTestId('map-route-live')).toBeTruthy();
    expect(screen.getByTestId('map-route-pending')).toBeTruthy();
    expect(screen.getAllByTestId('map-dash').length).toBeGreaterThan(4);
  });

  it('assigned with no rider location draws the dashed route and no truck', () => {
    render(<MandiMapSketch driver={null} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    expect(screen.getByTestId('map-route-pending')).toBeTruthy();
    expect(screen.queryByTestId('truck-icon')).toBeNull();
    expect(screen.queryByTestId('map-route-live')).toBeNull();
  });

  it('after pickup draws only truck-to-drop', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} stale={false} mode="live" />);
    expect(screen.getByTestId('map-route-live')).toBeTruthy();
    expect(screen.queryByTestId('map-route-pending')).toBeNull();
    expect(screen.queryAllByTestId('map-dash')).toHaveLength(0);
  });

  it('reached draws no line', () => {
    render(<MandiMapSketch driver={fix} destination={outlet} stale={false} mode="reached" />);
    expect(screen.queryByTestId('map-route-live')).toBeNull();
    expect(screen.queryByTestId('map-route-pending')).toBeNull();
    expect(screen.getByTestId('map-geofence')).toBeTruthy();
    expect(screen.getByTestId('map-pickup')).toBeTruthy();
  });
});

describe('MandiMap native legs', () => {
  beforeEach(() => {
    mockConfigured = true;
  });

  it('before pickup draws solid truck-to-pickup and dashed pickup-to-drop', () => {
    const { UNSAFE_getAllByType } = render(<MandiMap driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    const lines = UNSAFE_getAllByType('Polyline' as never) as unknown as P[];
    expect(lines).toHaveLength(2);
    expect(lines[0]?.props.coordinates).toEqual([{ latitude: 12.97, longitude: 77.59 }, pickup]);
    expect(lines[1]?.props.lineDashPattern).toEqual([6, 5]);
    expect(lines[1]?.props.coordinates).toEqual([pickup, outlet]);
  });

  it('reached draws no line, only the ring', () => {
    const { UNSAFE_queryAllByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="reached" />);
    expect(UNSAFE_queryAllByType('Polyline' as never)).toHaveLength(0);
    expect(UNSAFE_queryAllByType('Circle' as never)).toHaveLength(1);
  });

  it('the truck marker is flat, centred and rotated to the heading, turning the short way', () => {
    jest.useFakeTimers();
    try {
      const truckMarker = (r: { UNSAFE_getAllByType: (t: never) => unknown[] }) =>
        (r.UNSAFE_getAllByType('Marker' as never) as unknown as P[]).find((m) => m.props.flat === true)!;
      const view = render(<MandiMap driver={{ ...fix, bearing: '350' }} destination={outlet} stale={false} mode="live" />);
      const m = truckMarker(view);
      expect(m.props.anchor).toEqual({ x: 0.5, y: 0.5 });
      expect(m.props.rotation).toBe(350);
      view.rerender(<MandiMap driver={{ ...fix, bearing: '10' }} destination={outlet} stale={false} mode="live" />);
      act(() => { jest.advanceTimersByTime(300); });
      const mid = truckMarker(view).props.rotation as number;
      // Halfway through a 20 degree turn across north: near 0, never swinging round through 180.
      expect(Math.min(mid, 360 - mid)).toBeLessThan(10);
      act(() => { jest.advanceTimersByTime(1000); });
      expect(truckMarker(view).props.rotation).toBeCloseTo(10, 6);
    } finally {
      jest.useRealTimers();
    }
  });

  it('with no bearing from the provider the marker faces the way the fixes moved', () => {
    jest.useFakeTimers();
    try {
      const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      view.rerender(<MandiMap driver={{ ...fix, longitude: '77.6' }} destination={outlet} stale={false} mode="live" />);
      act(() => { jest.advanceTimersByTime(1500); });
      const m = (view.UNSAFE_getAllByType('Marker' as never) as unknown as P[]).find((x) => x.props.flat === true)!;
      expect(m.props.rotation as number).toBeCloseTo(90, 0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders exactly one truck', () => {
    const { UNSAFE_getAllByType } = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    expect(UNSAFE_getAllByType(TruckTopIcon)).toHaveLength(1);
  });
});
