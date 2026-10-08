import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { MandiMap } from '@/components/delivery/MandiMap.web';
import { resetTileWatchdog, TILE_TIMEOUT_MS } from '@/lib/maps/tileWatchdog';
import { Colors } from '@/theme';

const mockLoad = jest.fn();
jest.mock('@/lib/maps/googleWebLoader', () => ({
  webMapsKey: () => (process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim(),
  loadWebMaps: (...a: unknown[]) => mockLoad(...a),
}));
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{`icon:${name}`}</T> };
});

type Obj = Record<string, any>;
let maps: Obj;
let markers: Obj[];
let polylines: Obj[];
let circles: Obj[];
let tilesLoadedCb: (() => void) | null;

function installGoogle() {
  markers = [];
  polylines = [];
  circles = [];
  tilesLoadedCb = null;
  const mk = (list: Obj[]) =>
    jest.fn().mockImplementation((opts: Obj) => {
      const o: Obj = { opts, setMap: jest.fn(), setPosition: jest.fn(), setIcon: jest.fn(), setOpacity: jest.fn(), getPosition: () => ({ lat: () => opts.position?.lat, lng: () => opts.position?.lng }) };
      list.push(o);
      return o;
    });
  maps = {
    Map: jest.fn().mockImplementation(() => ({ fitBounds: jest.fn() })),
    Marker: mk(markers),
    Polyline: mk(polylines),
    Circle: mk(circles),
    Size: jest.fn(),
    Point: jest.fn(),
    SymbolPath: { CIRCLE: 0 },
    event: { addListenerOnce: jest.fn((_m: unknown, _e: string, cb: () => void) => { tilesLoadedCb = cb; }) },
  };
  (global as Obj).google = { maps };
}

const fix = { latitude: '12.97', longitude: '77.59', bearing: null as string | null, recordedAt: '2026-01-01T10:00:00Z' };
const outlet = { latitude: 12.99, longitude: 77.62 };
const pickup = { latitude: 12.95, longitude: 77.57 };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  jest.useFakeTimers();
  resetTileWatchdog();
  mockLoad.mockReset().mockResolvedValue(undefined);
  delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
  delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  delete process.env.EXPO_PUBLIC_DELIVERY_MAP;
  delete (window as Obj).gm_authFailure;
  (window as Obj).google = undefined;
  installGoogle();
});
afterEach(() => jest.useRealTimers());

describe('MandiMap (web)', () => {
  it('no key renders the sketch', () => {
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    expect(screen.getByTestId('map-driver')).toBeTruthy();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('the API key name is the fallback only when the web key is absent', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'fallback';
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(maps.Map).toHaveBeenCalled();
  });

  it('gm_authFailure switches to the sketch', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(screen.queryByTestId('map-driver')).toBeNull();
    expect(typeof (window as Obj).gm_authFailure).toBe('function');
    act(() => (window as Obj).gm_authFailure());
    expect(screen.getByTestId('map-driver')).toBeTruthy();
  });

  it('a load that never draws tiles in 6 s switches to the sketch', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS + 1); });
    expect(screen.getByTestId('map-driver')).toBeTruthy();
  });

  it('tiles loading in time keeps the real map', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { tilesLoadedCb?.(); jest.advanceTimersByTime(TILE_TIMEOUT_MS + 1); });
    expect(screen.queryByTestId('map-driver')).toBeNull();
  });

  it('a script that fails to load switches to the sketch', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    mockLoad.mockRejectedValue(new Error('x'));
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(screen.getByTestId('map-driver')).toBeTruthy();
  });

  it('loader called once for a map that re-renders with new fixes', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.971' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(maps.Map).toHaveBeenCalledTimes(1);
  });

  it('draws the supplier and restaurant pins, the truck and the live-before-pickup legs', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    await flush();
    const labels = markers.map((m) => m.opts.label?.text).filter(Boolean);
    expect(labels).toEqual(expect.arrayContaining(['Supplier', 'Restaurant']));
    expect(markers.some((m) => String(m.opts.icon?.url ?? '').startsWith('data:image/svg+xml'))).toBe(true);
    expect(polylines).toHaveLength(2);
    expect(polylines[0]!.opts.strokeColor).toBe(Colors.deliveryRoute);
    expect(polylines[1]!.opts.strokeColor).toBe(Colors.routePending);
    expect(polylines[1]!.opts.strokeOpacity).toBe(0);
  });

  it('arriving draws the 300 m ring', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="arriving" />);
    await flush();
    expect(circles).toHaveLength(1);
    expect(circles[0]!.opts.radius).toBe(300);
  });

  it('truck marker flips with bearing and mutes when stale', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={{ ...fix, bearing: '270' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    const truck = markers.find((m) => String(m.opts.icon?.url ?? '').startsWith('data:image/svg+xml'))!;
    expect(decodeURIComponent(truck.opts.icon.url)).toContain('scale(-1');
    view.rerender(<MandiMap driver={{ ...fix, bearing: '90' }} destination={outlet} stale mode="live" />);
    await flush();
    const url = decodeURIComponent((truck.setIcon.mock.calls.at(-1) as any[])[0].url);
    expect(url).not.toContain('scale(-1');
    expect(url).toContain(Colors.truckMuted);
    expect(truck.setOpacity).toHaveBeenLastCalledWith(0.6);
  });

  it('moves the truck smoothly between fixes instead of jumping', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const truck = markers.find((m) => String(m.opts.icon?.url ?? '').startsWith('data:image/svg+xml'))!;
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.98' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(500); });
    const mid = (truck.setPosition.mock.calls.at(-1) as any[])[0];
    expect(mid.lat).toBeGreaterThan(12.97);
    expect(mid.lat).toBeLessThan(12.98);
    act(() => { jest.advanceTimersByTime(1000); });
    expect((truck.setPosition.mock.calls.at(-1) as any[])[0].lat).toBeCloseTo(12.98, 6);
  });

  it('glide duration follows the gap between fixes, clamped', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const truck = markers.find((m) => String(m.opts.icon?.url ?? '').startsWith('data:image/svg+xml'))!;
    // The next fix is 4 s later by the provider's clock: still moving at 2 s, arrived after 4 s.
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.98', recordedAt: '2026-01-01T10:00:04Z' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(2000); });
    const mid = (truck.setPosition.mock.calls.at(-1) as any[])[0];
    expect(mid.lat).toBeGreaterThan(12.974);
    expect(mid.lat).toBeLessThan(12.977);
    act(() => { jest.advanceTimersByTime(2100); });
    expect((truck.setPosition.mock.calls.at(-1) as any[])[0].lat).toBeCloseTo(12.98, 6);
  });
});
