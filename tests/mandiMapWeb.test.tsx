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
let mapInstances: Obj[];
let viewBounds: Obj;
let tilesLoadedCb: (() => void) | null;
let dragStartCb: (() => void) | null;

function installGoogle() {
  markers = [];
  polylines = [];
  circles = [];
  tilesLoadedCb = null;
  dragStartCb = null;
  mapInstances = [];
  viewBounds = { north: 14, south: 12, east: 78, west: 77 };
  const mk = (list: Obj[]) =>
    jest.fn().mockImplementation((opts: Obj) => {
      const o: Obj = { opts, setMap: jest.fn(), setPosition: jest.fn(), setIcon: jest.fn(), setOpacity: jest.fn(), getPosition: () => ({ lat: () => opts.position?.lat, lng: () => opts.position?.lng }) };
      list.push(o);
      return o;
    });
  maps = {
    Map: jest.fn().mockImplementation((h: unknown, opts: Obj) => {
      if (h == null) throw new Error('Map: Expected mapDiv of type HTMLElement but was passed null');
      const m: Obj = { opts, fitBounds: jest.fn(), getBounds: () => ({ toJSON: () => viewBounds }) };
      mapInstances.push(m);
      return m;
    }),
    Marker: mk(markers),
    Polyline: mk(polylines),
    Circle: mk(circles),
    Size: jest.fn(),
    Point: jest.fn(),
    SymbolPath: { CIRCLE: 0 },
    event: {
      trigger: jest.fn(),
      addListener: jest.fn((_m: unknown, e: string, cb: () => void) => { if (e === 'dragstart') dragStartCb = cb; return { remove: jest.fn() }; }),
       addListenerOnce: jest.fn((_m: unknown, _e: string, cb: () => void) => { tilesLoadedCb = cb; }) },
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
    expect(labels).toEqual(expect.arrayContaining(['Supplier', 'You']));
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

  it('sets quiet, cooperative map options', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const o = mapInstances[0]!.opts;
    expect(o.clickableIcons).toBe(false);
    expect(o.gestureHandling).toBe('cooperative');
    expect(JSON.stringify(o.styles)).toContain('"poi"');
    expect(JSON.stringify(o.styles)).toContain('"off"');
  });

  it('puts the pin labels below the pin and the truck above them', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    await flush();
    const pins = markers.filter((m) => m.opts.label);
    const truck = markers.find((m) => String(m.opts.icon?.url ?? '').startsWith('data:image/svg+xml'))!;
    expect(pins).toHaveLength(2);
    pins.forEach((p) => {
      expect(maps.Point).toHaveBeenCalledWith(0, expect.any(Number));
      expect(p.opts.zIndex).toBeLessThan(truck.opts.zIndex);
    });
  });

  it('triggers a resize after mount and when the container changes size', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const observers: (() => void)[] = [];
    (global as Obj).ResizeObserver = class {
      constructor(cb: () => void) { observers.push(cb); }
      observe() {}
      disconnect() {}
    };
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(50); });
    const after = maps.event.trigger.mock.calls.filter((c: any[]) => c[1] === 'resize').length;
    expect(after).toBeGreaterThanOrEqual(1);
    act(() => observers.forEach((cb) => cb()));
    expect(maps.event.trigger.mock.calls.filter((c: any[]) => c[1] === 'resize').length).toBeGreaterThan(after);
    delete (global as Obj).ResizeObserver;
  });

  it('refits when the truck leaves the view, at most once per 8 s', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    viewBounds = { north: 12.96, south: 12.94, east: 77.58, west: 77.56 }; // the truck at 12.97 is outside
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const fit = mapInstances[0]!.fitBounds;
    act(() => { tilesLoadedCb?.(); });
    expect(fit).toHaveBeenCalledTimes(1);
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.972' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(8100); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.974' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it('refits when the mode changes', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    view.rerender(<MandiMap driver={fix} destination={outlet} stale={false} mode="arriving" />);
    await flush();
    expect(mapInstances[0]!.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('after the user drags the map no automatic refit for 30 s, but a mode change still refits', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    viewBounds = { north: 12.96, south: 12.94, east: 77.58, west: 77.56 }; // the truck is always outside
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const fit = mapInstances[0]!.fitBounds;
    act(() => { tilesLoadedCb?.(); });
    expect(fit).toHaveBeenCalledTimes(1);
    expect(dragStartCb).not.toBeNull();
    act(() => { dragStartCb?.(); jest.advanceTimersByTime(8100); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.972' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(20_000); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.973' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(1);
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.973' }} destination={outlet} stale={false} mode="arriving" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(2);
    act(() => { dragStartCb?.(); jest.advanceTimersByTime(31_000); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.975' }} destination={outlet} stale={false} mode="arriving" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(3);
  });

  it('refits when the truck gets half as close to the next stop, even while still in view', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const fit = mapInstances[0]!.fitBounds;
    act(() => { tilesLoadedCb?.(); });
    expect(fit).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(8100); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.975', longitude: '77.6' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(1); // closer, but not yet half the distance
    act(() => { jest.advanceTimersByTime(8100); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.98', longitude: '77.61' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it('creates the Google map (not the sketch) when the first render had nothing to draw', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={null} destination={null} stale={false} mode="live" />);
    await flush();
    view.rerender(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(maps.Map).toHaveBeenCalled();
    expect((maps.Map.mock.calls.at(-1) as any[])[0]).not.toBeNull();
    expect(screen.queryByTestId('map-driver')).toBeNull();
    expect(mapInstances.at(-1)!.fitBounds).toHaveBeenCalled();
  });

  it('retries a failed map construction instead of switching to the sketch', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    maps.Map.mockImplementationOnce(() => { throw new Error('Map: Expected mapDiv'); });
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(600); });
    await flush();
    expect(screen.queryByTestId('map-driver')).toBeNull();
    expect(mapInstances).toHaveLength(1);
  });

  it('before pickup fits the truck and the supplier, not the far restaurant', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const far = { latitude: 13.3, longitude: 78.0 };
    render(<MandiMap driver={fix} destination={far} pickup={pickup} stale={false} mode="live" />);
    await flush();
    const v = (mapInstances[0]!.fitBounds.mock.calls[0] as any[])[0];
    expect(v.north).toBeLessThan(13.0);
    expect(v.south).toBeLessThanOrEqual(12.95);
  });

  it('refits while the truck keeps moving: more than 10% of the view, or every 20 s', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    viewBounds = { north: 13.0, south: 12.9, east: 77.7, west: 77.5 }; // truck stays inside the padded view
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const fit = mapInstances[0]!.fitBounds;
    expect(fit).toHaveBeenCalledTimes(1);
    act(() => { tilesLoadedCb?.(); jest.advanceTimersByTime(9000); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.9701' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(1); // barely moved, not yet 20 s
    act(() => { jest.advanceTimersByTime(12_000); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.9702' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(2); // 20 s passed
    act(() => { jest.advanceTimersByTime(9000); });
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.9702', longitude: '77.62' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    expect(fit).toHaveBeenCalledTimes(3); // moved ~3 km, over 10% of the ~24 km view diagonal, only 9 s after the last fit
  });

  it('labels the restaurant pin by audience', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" audience="supplier" />);
    await flush();
    const labels = markers.map((m) => m.opts.label?.text).filter(Boolean);
    expect(labels).toContain('Restaurant');
    expect(labels).not.toContain('You');
  });
});
