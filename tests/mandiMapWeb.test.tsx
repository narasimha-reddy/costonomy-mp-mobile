import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { MandiMap } from '@/components/delivery/MandiMap.web';
import { resetTileWatchdog, tilesFailed, TILE_TIMEOUT_MS } from '@/lib/maps/tileWatchdog';
import { distanceM, metersPerPixel } from '@/lib/maps/googleLegs';
import { Colors } from '@/theme';
import { LOGO_DEEP_D } from '@/lib/maps/truckSvg';

const mockLoad = jest.fn();
jest.mock('@/lib/maps/googleWebLoader', () => ({
  webMapsKey: () => (process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim(),
  loadWebMaps: (...a: unknown[]) => mockLoad(...a),
}));
// Which map hosts are on screen. Each new host takes `mockNextHidden` the first time it is asked about; a test reveals
// a hidden host by flipping its entry and calling its watcher (what ResizeObserver does in the browser).
const mockShown = new Map<unknown, boolean>();
const mockWatchers = new Map<unknown, () => void>();
let mockNextHidden = false;
let mockHasTiles = false;
jest.mock('@/lib/maps/hostVisibility', () => ({
  hostShown: (n: unknown) => {
    if (!mockShown.has(n)) mockShown.set(n, !mockNextHidden);
    return mockShown.get(n);
  },
  watchHost: (n: unknown, cb: () => void) => {
    mockWatchers.set(n, cb);
    return () => mockWatchers.delete(n);
  },
  hostHasTiles: () => mockHasTiles,
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
let handles: Obj[];

/** Google's addListener: kept per map so a test can fire one map's events; the handle's remove drops it. */
const listen = jest.fn((m: Obj, e: string, cb: () => void) => {
  if (e === 'dragstart') dragStartCb = cb;
  if (e === 'tilesloaded') tilesLoadedCb = cb;
  const list = ((m.listeners ??= {})[e] ??= []) as (() => void)[];
  list.push(cb);
  const h = { remove: jest.fn(() => { const i = list.indexOf(cb); if (i >= 0) list.splice(i, 1); }) };
  handles.push(h);
  return h;
});
const fire = (m: Obj, e: string) => act(() => { [...(m.listeners?.[e] ?? [])].forEach((cb: () => void) => cb()); });
/** The texts of the label chips (SVG markers carrying data-chip). */
const chipText = (m: Obj) => /data-chip="([^"]*)"/.exec(decodeURIComponent(String(m.opts.icon?.url ?? '')))?.[1];
const chips = () => markers.filter((m) => chipText(m) != null);
const truckOf = () => markers.find((m) => String(m.opts.icon?.url ?? '').startsWith('data:image/svg+xml') && chipText(m) == null)!;

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
      const o: Obj = { opts, setMap: jest.fn(), setPosition: jest.fn(), setIcon: jest.fn(), setOpacity: jest.fn(), setPath: jest.fn(), getPosition: () => ({ lat: () => opts.position?.lat, lng: () => opts.position?.lng }) };
      list.push(o);
      return o;
    });
  handles = [];
  maps = {
    Map: jest.fn().mockImplementation((h: unknown, opts: Obj) => {
      if (h == null) throw new Error('Map: Expected mapDiv of type HTMLElement but was passed null');
      const m: Obj = {
        opts, host: h, listeners: {} as Record<string, (() => void)[]>, zoom: 14,
        fitBounds: jest.fn(), setCenter: jest.fn(), setZoom: jest.fn(),
        getZoom() { return this.zoom; },
        getBounds: () => ({ toJSON: () => viewBounds }),
      };
      mapInstances.push(m);
      return m;
    }),
    Marker: mk(markers),
    Polyline: mk(polylines),
    Circle: mk(circles),
    Size: jest.fn().mockImplementation((w: number, h: number) => ({ w, h })),
    Point: jest.fn().mockImplementation((x: number, y: number) => ({ x, y })),
    SymbolPath: { CIRCLE: 0 },
    event: { trigger: jest.fn(), addListener: listen, addListenerOnce: listen, clearInstanceListeners: jest.fn() },
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
  mockShown.clear();
  mockWatchers.clear();
  mockNextHidden = false;
  mockHasTiles = false;
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
    const labels = chips().map(chipText);
    expect(labels).toEqual(expect.arrayContaining(['Supplier', 'You']));
    expect(truckOf()).toBeTruthy();
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
    expect(circles[0]!.opts.fillOpacity).toBe(0); // outline only: a filled ring would wash the whole view
  });

  it('truck marker is the top-view truck with the logo, rotated to the bearing, and mutes when stale', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={{ ...fix, bearing: '270' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    const truck = truckOf();
    const first = decodeURIComponent(truck.opts.icon.url);
    expect(first).toContain('rotate(270 ');
    expect(first).toContain(LOGO_DEEP_D);
    // Square and centred, so any rotation stays on the fix.
    expect(truck.opts.icon.scaledSize.w).toBe(truck.opts.icon.scaledSize.h);
    expect(truck.opts.icon.anchor).toEqual({ x: truck.opts.icon.scaledSize.w / 2, y: truck.opts.icon.scaledSize.h / 2 });
    view.rerender(<MandiMap driver={{ ...fix, bearing: '90' }} destination={outlet} stale mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(1500); });
    const url = decodeURIComponent((truck.setIcon.mock.calls.at(-1) as any[])[0].url);
    expect(url).toContain('rotate(90 ');
    expect(url).toContain(Colors.truckMuted);
    expect(truck.setOpacity).toHaveBeenLastCalledWith(0.6);
  });

  it('turns over the glide the short way round, in 5 degree steps', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={{ ...fix, bearing: '340' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    const truck = truckOf();
    view.rerender(<MandiMap driver={{ ...fix, latitude: '12.971', bearing: '20' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(500); });
    const angles = () => truck.setIcon.mock.calls.map((c: any[]) => Number(/rotate\((\d+) /.exec(decodeURIComponent(c[0].url))![1]));
    const mid = angles().at(-1)!;
    expect(Math.min(mid, 360 - mid)).toBeLessThanOrEqual(10);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(angles().at(-1)).toBe(20);
    // Every step is a 5 degree bucket and none swung through the south.
    for (const a of angles()) {
      expect(a % 5).toBe(0);
      expect(a >= 340 || a <= 20).toBe(true);
    }
    // One icon per bucket crossed, not one per animation frame.
    expect(truck.setIcon.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it('with no bearing the truck faces the way the fixes moved, and keeps it while standing', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const truck = truckOf();
    expect(decodeURIComponent(truck.opts.icon.url)).toContain('rotate(0 ');
    view.rerender(<MandiMap driver={{ ...fix, longitude: '77.6', recordedAt: '2026-01-01T10:00:02Z' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(2500); });
    const last = () => decodeURIComponent((truck.setIcon.mock.calls.at(-1) as any[])[0].url);
    expect(last()).toContain('rotate(90 ');
    const calls = truck.setIcon.mock.calls.length;
    // Standing at the pickup (a 1 m wobble): still facing east.
    view.rerender(<MandiMap driver={{ ...fix, longitude: String(77.6 + 0.00001), recordedAt: '2026-01-01T10:00:04Z' }} destination={outlet} stale={false} mode="live" />);
    await flush();
    act(() => { jest.advanceTimersByTime(2500); });
    expect(truck.setIcon.mock.calls.length).toBe(calls);
  });

  it('moves the truck smoothly between fixes instead of jumping', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
    await flush();
    const truck = truckOf();
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
    const truck = truckOf();
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

  it('pin labels are white chips above the pin, drawn over the truck; the pins carry no Google label', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    await flush();
    const truck = truckOf();
    const pins = markers.filter((m) => m.opts.icon?.path === 0 && m.opts.icon.fillOpacity === 1);
    expect(pins).toHaveLength(2);
    pins.forEach((p) => expect(p.opts.label).toBeUndefined());
    expect(chips().map(chipText).sort()).toEqual(['Supplier', 'You']);
    chips().forEach((c) => {
      expect(c.opts.zIndex).toBeGreaterThan(truck.opts.zIndex);
      expect(c.opts.icon.anchor.y).toBeGreaterThan(c.opts.icon.scaledSize.h); // the chip's bottom edge is above the pin
      expect(c.opts.clickable).toBe(false);
    });
    // The pins are drawn above the truck, so the truck can never hide one.
    pins.forEach((p) => expect(p.opts.zIndex).toBeGreaterThan(truck.opts.zIndex));
    // Each pin has a halo under the truck.
    const halos = markers.filter((m) => m.opts.icon?.path === 0 && m.opts.icon.fillOpacity < 1);
    expect(halos).toHaveLength(2);
    halos.forEach((h) => expect(h.opts.zIndex).toBeLessThan(truck.opts.zIndex));
  });

  it('a truck within 40 m of a pin is drawn pushed clear of it, both stay visible', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    render(<MandiMap driver={{ ...fix, latitude: '12.99005', longitude: '77.62' }} destination={outlet} stale={false} mode="arriving" />);
    await flush();
    const at = truckOf().getPosition();
    const lat = typeof at.lat === 'function' ? at.lat() : at.lat;
    const lng = typeof at.lng === 'function' ? at.lng() : at.lng;
    const shown = { latitude: lat, longitude: lng };
    expect(distanceM(shown, outlet)).toBeGreaterThanOrEqual(39);
  });

  it('a truck right on top of the supplier pushes the Supplier chip below the pin', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    // ~10 m north of the supplier: a few pixels at zoom 14.
    render(<MandiMap driver={{ ...fix, latitude: '12.9501', longitude: '77.57' }} destination={outlet} pickup={pickup} stale={false} mode="live" />);
    await flush();
    const supplier = chips().find((c) => chipText(c) === 'Supplier')!;
    const you = chips().find((c) => chipText(c) === 'You')!;
    const lastIcon = (c: Obj) => (c.setIcon.mock.calls.at(-1)?.[0] ?? c.opts.icon) as Obj;
    expect(lastIcon(supplier).anchor.y).toBeLessThan(0);
    expect(lastIcon(you).anchor.y).toBeGreaterThan(0);
  });

  it('frames the points again when the box changes size (the card grows when the order is close), not when it stays', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
    const observers: (() => void)[] = [];
    (global as Obj).ResizeObserver = class {
      constructor(cb: () => void) { observers.push(cb); }
      observe() {}
      disconnect() {}
    };
    render(<MandiMap driver={fix} destination={outlet} stale={false} mode="arriving" />);
    await flush();
    act(() => { jest.advanceTimersByTime(50); });
    const m = mapInstances[0]!;
    (m.host as Obj).clientHeight = 200;
    act(() => observers.forEach((cb) => cb()));
    const fits = m.fitBounds.mock.calls.length;
    act(() => observers.forEach((cb) => cb()));
    expect(m.fitBounds.mock.calls.length).toBe(fits); // same size: no refit
    (m.host as Obj).clientHeight = 280;
    act(() => observers.forEach((cb) => cb()));
    expect(m.fitBounds.mock.calls.length).toBe(fits + 1);
    delete (global as Obj).ResizeObserver;
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
    viewBounds = { north: 13.1, south: 12.9, east: 77.7, west: 77.5 }; // the truck and the outlet stay well inside the view
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
    const labels = chips().map(chipText);
    expect(labels).toContain('Restaurant');
    expect(labels).not.toContain('You');
  });

  describe('tile watchdog: only for a map on screen, scoped to that map', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k';
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('a hidden map further down the stack cannot switch the visible map, or any later map, to the sketch', async () => {
      // Order 115: the Placed screen stayed mounted (display:none) under Order details -> Track and drew its own map.
      mockNextHidden = true;
      const hidden = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      mockNextHidden = false;
      const visible = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      fire(mapInstances[1]!, 'tilesloaded');
      act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS * 3); });
      expect(visible.queryByTestId('map-driver')).toBeNull();
      expect(hidden.queryByTestId('map-driver')).toBeNull(); // never armed: still the Google map, waiting to be shown
      expect(tilesFailed()).toBe(false);
      expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('[maps] tiles did not load'));
      // The next screen's map (Track again, a new status) is the real map, not the sketch.
      const later = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="arriving" />);
      await flush();
      expect(later.queryByTestId('map-driver')).toBeNull();
      expect(maps.Map).toHaveBeenCalledTimes(3);
    });

    it('a hidden map starts its 6 s only when shown; its own timeout falls back for it alone', async () => {
      mockNextHidden = true;
      const hidden = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS * 2); });
      expect(hidden.queryByTestId('map-driver')).toBeNull();
      const node = [...mockShown.keys()][0];
      act(() => { mockShown.set(node, true); mockWatchers.get(node)?.(); });
      act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS - 100); });
      expect(hidden.queryByTestId('map-driver')).toBeNull();
      act(() => { jest.advanceTimersByTime(200); });
      expect(hidden.getByTestId('map-driver')).toBeTruthy();
      expect(tilesFailed()).toBe(false);
      mockNextHidden = false;
      const next = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      expect(next.queryByTestId('map-driver')).toBeNull();
    });

    it('hidden again before the 6 s are up: the clock stops and restarts in full when shown', async () => {
      const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      const node = [...mockShown.keys()][0];
      act(() => { jest.advanceTimersByTime(4000); });
      act(() => { mockShown.set(node, false); mockWatchers.get(node)?.(); });
      act(() => { jest.advanceTimersByTime(10_000); });
      act(() => { mockShown.set(node, true); mockWatchers.get(node)?.(); });
      act(() => { jest.advanceTimersByTime(4000); });
      expect(view.queryByTestId('map-driver')).toBeNull();
    });

    it('idle as well as tilesloaded counts as loaded', async () => {
      const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      fire(mapInstances[0]!, 'idle');
      act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS * 2); });
      expect(view.queryByTestId('map-driver')).toBeNull();
    });

    it('tiles already painted in the host count as loaded even if the event was missed', async () => {
      mockHasTiles = true;
      const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS * 2); });
      expect(view.queryByTestId('map-driver')).toBeNull();
    });

    it('a visible map with no tiles in 6 s falls back alone and does not poison the session', async () => {
      const first = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS + 1); });
      expect(first.getByTestId('map-driver')).toBeTruthy();
      expect(tilesFailed()).toBe(false);
      const second = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      expect(second.queryByTestId('map-driver')).toBeNull();
    });

    it('a refused key still sends every map, including later ones, to the sketch', async () => {
      render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      act(() => (window as Obj).gm_authFailure());
      expect(tilesFailed()).toBe(true);
      const later = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      expect(later.getByTestId('map-driver')).toBeTruthy();
    });

    it('unmounting removes the map listeners and stops the clock', async () => {
      const view = render(<MandiMap driver={fix} destination={outlet} stale={false} mode="live" />);
      await flush();
      expect(handles.length).toBeGreaterThan(0);
      view.unmount();
      handles.forEach((h) => expect(h.remove).toHaveBeenCalled());
      expect(mockWatchers.size).toBe(0);
      act(() => { jest.advanceTimersByTime(TILE_TIMEOUT_MS * 2); });
      expect(console.warn).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('camera', () => {
    beforeEach(() => { process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k'; });

    it('zoom is clamped 12..17 and a fit gets pixel padding', async () => {
      render(<MandiMap driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
      await flush();
      const m = mapInstances[0]!;
      expect(m.opts.minZoom).toBe(12);
      expect(m.opts.maxZoom).toBe(17);
      const [, padding] = m.fitBounds.mock.calls[0] as any[];
      expect(padding).toEqual(expect.objectContaining({ top: expect.any(Number) }));
      expect(padding.top).toBeGreaterThan(0);
    });

    it('a single point is centred at zoom 16, not fitted', async () => {
      render(<MandiMap driver={fix} destination={null} stale={false} mode="live" />);
      await flush();
      const m = mapInstances[0]!;
      expect(m.fitBounds).not.toHaveBeenCalled();
      expect(m.setCenter).toHaveBeenCalledWith({ lat: 12.97, lng: 77.59 });
      expect(m.setZoom).toHaveBeenCalledWith(16);
    });

    it('a fix far from both stops (a default point) is left out of the frame', async () => {
      render(<MandiMap driver={{ ...fix, latitude: '28.4595', longitude: '77.0266' }} destination={outlet} pickup={pickup} stale={false} mode="live" />);
      await flush();
      const [b] = mapInstances[0]!.fitBounds.mock.calls[0] as any[];
      expect(b.north).toBeLessThan(13.1);
      expect(b.west).toBeGreaterThan(77.5);
    });

    it('the moment the order is collected the camera reframes on the truck and the restaurant', async () => {
      const view = render(<MandiMap driver={fix} destination={outlet} pickup={pickup} stale={false} mode="live" />);
      await flush();
      const fit = mapInstances[0]!.fitBounds;
      expect(fit).toHaveBeenCalledTimes(1);
      view.rerender(<MandiMap driver={fix} destination={outlet} pickup={null} stale={false} mode="live" />);
      await flush();
      expect(fit).toHaveBeenCalledTimes(2);
      const [b] = fit.mock.calls[1] as any[];
      expect(b.south).toBeCloseTo(12.97, 6); // the supplier (12.95) left the frame
    });
  });

  // Seen on the live map (scratchpad fx3/t/live, recorder dumps): fixes arrive every 5 s and the marker glides 5 s to
  // each one, so it is always drawn one fix behind. The line and the camera used the new fix only: in arriving the
  // camera zoomed onto the new fix and the destination, the truck (still at the old fix) was outside the box, and the
  // line ended in the street ahead of it. In reached the truck was pushed 60 m from the pin, which is 26 px at the
  // zoom the camera picked (16), so the 44 px truck covered the pin and its chip and swung round it with each fix.
  describe('the truck, its line and the camera agree', () => {
    beforeEach(() => { process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'k'; });
    const at = (s: number) => `2026-01-01T10:00:${String(s).padStart(2, '0')}Z`;
    const drawn = (m: Obj) => (m.setPosition.mock.calls.at(-1)?.[0] ?? m.opts.position) as { lat: number; lng: number };
    const inside = (b: Obj, p: { lat: number; lng: number }) => p.lat <= b.north + 1e-9 && p.lat >= b.south - 1e-9 && p.lng <= b.east + 1e-9 && p.lng >= b.west - 1e-9;
    const liveLine = () => polylines.filter((l) => !l.setMap.mock.calls.some((c: any[]) => c[0] === null)).at(-1)!;
    const lineStart = (l: Obj) => ((l.setPath.mock.calls.at(-1)?.[0] ?? l.opts.path) as { lat: number; lng: number }[])[0]!;

    async function arriving() {
      const view = render(<MandiMap driver={{ ...fix, latitude: '12.986', longitude: '77.62', recordedAt: at(0) }} destination={outlet} stale={false} mode="live" />);
      await flush();
      mapInstances[0]!.zoom = 17; // street level, as on the device: the fix is ~140 px from the pin, not pushed clear of it
      view.rerender(<MandiMap driver={{ ...fix, latitude: '12.9885', longitude: '77.62', recordedAt: at(5) }} destination={outlet} stale={false} mode="arriving" />);
      await flush();
      return { m: mapInstances[0]!, truck: truckOf() };
    }

    it('a new fix is framed together with where the truck is drawn, so the truck stays in view all through its glide', async () => {
      const { m, truck } = await arriving();
      const [b] = m.fitBounds.mock.calls.at(-1) as any[];
      expect(inside(b, drawn(truck))).toBe(true);
      for (const ms of [1000, 2000, 2500]) {
        act(() => { jest.advanceTimersByTime(ms); });
        expect(inside(b, drawn(truck))).toBe(true);
      }
      expect(drawn(truck).lat).toBeCloseTo(12.9885, 6);
    });

    it('the route line starts where the truck is drawn, all through the glide', async () => {
      const { truck } = await arriving();
      for (const ms of [0, 1000, 2000, 2500]) {
        act(() => { jest.advanceTimersByTime(ms); });
        const s = lineStart(liveLine());
        expect(s.lat).toBeCloseTo(drawn(truck).lat, 7);
        expect(s.lng).toBeCloseTo(drawn(truck).lng, 7);
      }
    });

    /** Screen boxes in px around the pin (x east, y down): the truck icon, the pin dot and the chip. */
    function overlaps(truck: Obj, chip: Obj, zoom: number) {
      const mpp = metersPerPixel(outlet.latitude, zoom);
      const p = drawn(truck);
      const tx = ((p.lng - outlet.longitude) * 111_195 * Math.cos((outlet.latitude * Math.PI) / 180)) / mpp;
      const ty = -((p.lat - outlet.latitude) * 111_195) / mpp;
      const half = 22;
      const hit = (l: number, t: number, r: number, b: number) => tx + half > l && tx - half < r && ty + half > t && ty - half < b;
      const icon = (chip.setIcon.mock.calls.at(-1)?.[0] ?? chip.opts.icon) as Obj;
      return {
        pin: hit(-10, -10, 10, 10),
        chip: hit(-icon.anchor.x, -icon.anchor.y, -icon.anchor.x + icon.scaledSize.w, -icon.anchor.y + icon.scaledSize.h),
        ty,
      };
    }

    it.each([15, 16, 17])('reached at zoom %i: the truck covers neither the pin nor its chip, and does not swing round it', async (zoom) => {
      const north = (m: number) => String(outlet.latitude + m / 111_195);
      const east = (m: number) => String(outlet.longitude + m / (111_195 * Math.cos((outlet.latitude * Math.PI) / 180)));
      const view = render(<MandiMap driver={{ ...fix, latitude: north(-150), longitude: String(outlet.longitude), recordedAt: at(0) }} destination={outlet} stale={false} mode="arriving" />);
      await flush();
      const m = mapInstances[0]!;
      const truck = truckOf();
      const sides = new Set<number>();
      // Jitter round the restaurant as the simulator's fixes do once the partner has reached it.
      const jitter = [[0, 0], [8, 0], [-6, 4], [3, -9], [0, 0]];
      for (const [i, [n, e]] of jitter.entries()) {
        view.rerender(<MandiMap driver={{ ...fix, latitude: north(n!), longitude: east(e!), recordedAt: at(5 * (i + 1)) }} destination={outlet} stale={false} mode="reached" />);
        await flush();
        m.zoom = zoom; // where the camera settled
        fire(m, 'idle');
        act(() => { jest.advanceTimersByTime(5100); });
        const you = chips().find((c) => chipText(c) === 'You' && !c.setMap.mock.calls.some((x: any[]) => x[0] === null))!;
        const o = overlaps(truck, you, zoom);
        expect(o.pin).toBe(false);
        expect(o.chip).toBe(false);
        sides.add(Math.sign(o.ty));
      }
      expect(sides.size).toBe(1);
    });

    it('when the camera zooms out after the truck was placed (arriving at 17, reached settles at 16) the truck is placed again', async () => {
      const view = render(<MandiMap driver={{ ...fix, latitude: String(outlet.latitude - 150 / 111_195), longitude: String(outlet.longitude), recordedAt: at(0) }} destination={outlet} stale={false} mode="arriving" />);
      await flush();
      const m = mapInstances[0]!;
      m.zoom = 17;
      view.rerender(<MandiMap driver={{ ...fix, latitude: String(outlet.latitude), longitude: String(outlet.longitude), recordedAt: at(5) }} destination={outlet} stale={false} mode="reached" />);
      await flush();
      act(() => { jest.advanceTimersByTime(5100); });
      m.zoom = 16;
      fire(m, 'idle');
      act(() => { jest.advanceTimersByTime(400); });
      const you = chips().find((c) => chipText(c) === 'You' && !c.setMap.mock.calls.some((x: any[]) => x[0] === null))!;
      const o = overlaps(truckOf(), you, 16);
      expect(o.pin).toBe(false);
      expect(o.chip).toBe(false);
    });
  });
});
