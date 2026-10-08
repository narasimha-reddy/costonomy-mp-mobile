import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { loadWebMaps } from '@/lib/maps/googleWebLoader';
import { markTilesFailed, markTilesLoaded, tilesFailed, TILE_TIMEOUT_MS } from '@/lib/maps/tileWatchdog';
import { hostHasTiles, hostShown, watchHost } from '@/lib/maps/hostVisibility';
import { toLatLng, turnLerp, type LatLng } from '@/lib/delivery/mapGeometry';
import {
  cameraFor, chipAnchor, chipIcon, chipSide, cssColor, distanceM, fitTargetFor, glideMs, insidePadded, legsFor, lerpPoint,
  MAX_ZOOM, MIN_ZOOM, QUIET_MAP_STYLE, shouldRefit, shouldRefitMoving, truckLook,
} from '@/lib/maps/googleLegs';
import { headingBucket, truckIconUrl } from '@/lib/maps/truckSvg';
import { useTruckHeading } from '@/hooks/useTruckHeading';
import { MandiMapSketch, type MandiMapProps } from './MandiMapSketch';
import { Colors, Radius, TrackLayout } from '@/theme';

const GLIDE_STEP_MS = 40;
/** A map that could not be constructed (the host not ready) is retried this often, this many times, before giving up. */
const CREATE_RETRY_MS = 500;
const CREATE_TRIES = 3;
/** After the user moves the map themselves, the camera is theirs for this long (a mode change still refits). */
const USER_MOVED_HOLD_MS = 30_000;
/** Stacking: pins, then the truck, then the label chips (a chip moves aside rather than hide under the truck). */
const PIN_Z = 10;
const TRUCK_Z = 20;
const CHIP_Z = 30;

type G = any; // the google.maps namespace is loaded at runtime; there is no typings package for it here

/**
 * Google's documented global hook for "this key was refused". It is installed once for the page and fans out to
 * every mounted map, which then falls back to the schematic. A refused key draws a grey map with no error, so
 * without this the restaurant would stare at a useless panel.
 */
const authListeners = new Set<() => void>();
function installAuthHook(): void {
  const w = window as unknown as { gm_authFailure?: () => void };
  if (w.gm_authFailure === authHook) return;
  w.gm_authFailure = authHook;
}
function authHook(): void {
  markTilesFailed('auth');
  authListeners.forEach((l) => l());
}

const pt = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });

/**
 * The delivery map on the web: the real Google map (Maps JavaScript API) drawing the same facts as the native
 * one, the supplier pin, the restaurant pin, the truck and the route legs (see `legsFor`). Any failure (no
 * script, a refused key, no tiles in 6 s) swaps it for the schematic, which is always honest about the same data.
 *
 * <p>The 6 s tile clock runs only while the map's box is on screen with a size (a screen further down the navigation
 * stack stays mounted but hidden and never draws tiles), restarts when it is shown again, and stops at `tilesloaded`,
 * `idle` or tiles found painted in the box. A timeout falls back for this map only; only a refused key
 * (`gm_authFailure`) sends every map of the session to the schematic.
 *
 * <p>The truck is a marker with the top-view truck (lib/maps/truckSvg.ts), turned to its heading (see `useTruckHeading`)
 * and greyed when the fix is stale. A stale fix is drawn differently, never as current.
 */
export function GoogleTrackMap(props: MandiMapProps) {
  const { driver, destination, stale, height = 220, bare = false, pickup = null, mode, accessibilityLabel, audience = 'buyer' } = props;
  const [failed, setFailed] = useState(tilesFailed());
  const heading = useTruckHeading(driver);
  const [ready, setReady] = useState(false);
  const host = useRef<unknown>(null);
  // The host element exists only once the first render had something to draw; the map is created when it does.
  const [hostEl, setHostEl] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const hostRef = (el: unknown) => {
    host.current = el;
    setHostEl((cur: unknown) => (cur === el ? cur : el));
  };
  const map = useRef<G>(null);
  const truck = useRef<{ marker: G; look: string; at: LatLng; heading: number } | null>(null);
  const overlays = useRef<G[]>([]);
  const lastFixAt = useRef<string | null>(null);
  const glide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fittedMode = useRef<string | null>(null);
  const lastFit = useRef<{ at: number; dist: number; truck: LatLng | null }>({ at: 0, dist: 0, truck: null });
  const userMovedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tries = useRef(0);
  const chips = useRef<{ marker: G; pin: LatLng; url: string; width: number; height: number; side: 'above' | 'below' }[]>([]);
  /** Puts each label chip above its pin, or below when the truck is right there (see `chipSide`). */
  const placeChips = useRef<() => void>(() => undefined);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Load the script and create the map once the host element exists (and again if building it threw).
  useEffect(() => {
    if (failed || hostEl == null) return undefined;
    let alive = true;
    let loaded = false;
    const handles: G[] = [];
    setReady(false);
    const fail = () => {
      if (!alive) return;
      clearTimer();
      setFailed(true);
    };
    const succeed = (painted: boolean) => {
      if (!alive) return;
      loaded = true;
      clearTimer();
      if (painted) markTilesLoaded();
    };
    // The tile clock: only while the box is on screen with a size; hidden stops it, shown again restarts it in full.
    const arm = () => {
      if (!alive || loaded || timer.current) return;
      if (!hostShown(host.current)) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!alive || loaded) return;
        if (hostHasTiles(host.current)) {
          succeed(true);
          return;
        }
        if (!hostShown(host.current)) return; // hidden meanwhile: the watcher re-arms it when shown
        console.warn('[maps] this map drew no tiles in 6 s; showing the schematic for it');
        fail();
      }, TILE_TIMEOUT_MS);
    };
    const unwatch = watchHost(host.current, () => {
      if (hostShown(host.current)) arm();
      else clearTimer();
    });
    authListeners.add(fail);
    installAuthHook();
    arm();
    loadWebMaps()
      .then(() => {
        if (!alive) return;
        const g: G = (window as any).google.maps;
        try {
          map.current = new g.Map(host.current, {
            center: { lat: 12.9716, lng: 77.5946 },
            zoom: 14,
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            disableDefaultUI: true,
            // Cooperative: the page still scrolls on a touch drag; ctrl/two fingers move the map.
            gestureHandling: 'cooperative',
            clickableIcons: false,
            styles: QUIET_MAP_STYLE,
          });
        } catch (e) {
          // Not a verdict on Google: try again shortly; only a script error, a refused key or no tiles falls back.
          map.current = null;
          if (tries.current >= CREATE_TRIES) throw e;
          tries.current += 1;
          retry.current = setTimeout(() => alive && setAttempt((a) => a + 1), CREATE_RETRY_MS);
          return;
        }
        tries.current = 0;
        const m = map.current;
        handles.push(
          g.event.addListener(m, 'tilesloaded', () => succeed(true)),
          // idle: the map settled after drawing; also when the chips need placing for a new zoom.
          g.event.addListener(m, 'idle', () => {
            succeed(false);
            placeChips.current();
          }),
          g.event.addListener(m, 'dragstart', () => {
            userMovedAt.current = Date.now();
          }),
        );
        setReady(true);
      })
      .catch(fail);
    return () => {
      alive = false;
      authListeners.delete(fail);
      unwatch();
      clearTimer();
      handles.forEach((h) => h?.remove?.());
      if (retry.current) clearTimeout(retry.current);
      if (glide.current) clearTimeout(glide.current);
      overlays.current.forEach((o) => o.setMap(null));
      truck.current?.marker.setMap(null);
      overlays.current = [];
      chips.current = [];
      truck.current = null;
      map.current = null;
    };
  }, [failed, hostEl, attempt]);

  // The container can paint before it has its final width (tiles over two thirds only): tell the map when it changes.
  useEffect(() => {
    if (!ready || !map.current) return undefined;
    const g: G = (window as any).google.maps;
    const resize = () => {
      if (map.current) g.event.trigger(map.current, 'resize');
    };
    const first = setTimeout(resize, 0);
    const node = host.current as Element | null;
    const Observer = (globalThis as any).ResizeObserver;
    let ro: { observe: (n: Element) => void; disconnect: () => void } | null = null;
    try {
      if (Observer && node) {
        ro = new Observer(resize);
        ro?.observe(node);
      }
    } catch {
      ro = null; // not a DOM node (tests, native): the mount-time resize still ran
    }
    return () => {
      clearTimeout(first);
      ro?.disconnect();
    };
  }, [ready]);

  const driverKey = driver ? `${driver.latitude},${driver.longitude},${driver.bearing ?? ''}` : '';
  const pickupKey = pickup ? `${pickup.latitude},${pickup.longitude}` : '';
  const destKey = destination ? `${destination.latitude},${destination.longitude}` : '';

  // Draw the scene whenever a fix, a point, the mode or staleness changes.
  useEffect(() => {
    if (!ready || !map.current) return;
    const g: G = (window as any).google.maps;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];

    const at = driver ? toLatLng(driver) : null;
    const scene = legsFor({ mode, truck: at, pickup, drop: destination });
    const own = (o: G) => {
      overlays.current.push(o);
      return o;
    };

    scene.lines.forEach((leg) => {
      const solid = leg.kind === 'solid';
      own(
        new g.Polyline({
          map: map.current,
          path: leg.path.map(pt),
          strokeColor: solid ? Colors.deliveryRoute : Colors.routePending,
          strokeWeight: solid ? 4 : 2,
          // Google has no dash option on a polyline: hide the line and repeat a short tick along it.
          ...(solid
            ? {}
            : {
                strokeOpacity: 0,
                icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 }, offset: '0', repeat: '11px' }],
              }),
        }),
      );
    });
    const ring = cssColor(Colors.geofenceFill);
    const edge = cssColor(Colors.geofenceStroke);
    scene.circles.forEach((c) =>
      own(
        new g.Circle({
          map: map.current,
          center: pt(c.center),
          radius: c.radiusM,
          fillColor: ring.color,
          fillOpacity: ring.opacity,
          strokeColor: edge.color,
          strokeOpacity: edge.opacity,
          strokeWeight: 1,
        }),
      ),
    );
    chips.current = [];
    const pin = (p: LatLng, text: string, fill: string) => {
      own(
        new g.Marker({
          map: map.current,
          position: pt(p),
          title: text,
          zIndex: PIN_Z,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: fill,
            fillOpacity: 1,
            strokeColor: Colors.surface,
            strokeWeight: 2,
          },
        }),
      );
      // The label is a white chip of its own above the pin, so road names and the truck cannot swallow it.
      const chip = chipIcon(text);
      const anchor = chipAnchor('above', chip.width, chip.height);
      const marker = own(
        new g.Marker({
          map: map.current,
          position: pt(p),
          clickable: false,
          zIndex: CHIP_Z,
          icon: { url: chip.url, scaledSize: new g.Size(chip.width, chip.height), anchor: new g.Point(anchor.x, anchor.y) },
        }),
      );
      chips.current.push({ marker, pin: p, url: chip.url, width: chip.width, height: chip.height, side: 'above' });
    };
    if (pickup && (mode != null || !driver)) pin(pickup, 'Supplier', Colors.textPrimary);
    if (destination) pin(destination, audience === 'supplier' ? 'Restaurant' : 'You', Colors.success);

    moveTruck(g, scene.showTruck ? at : null);
    const truckAt = scene.showTruck ? at : null;
    placeChips.current = () => {
      if (!map.current) return;
      const zoom = map.current.getZoom?.();
      chips.current.forEach((c) => {
        const side = chipSide(c.pin, truckAt, zoom);
        if (side === c.side) return;
        c.side = side;
        const a = chipAnchor(side, c.width, c.height);
        c.marker.setIcon({ url: c.url, scaledSize: new g.Size(c.width, c.height), anchor: new g.Point(a.x, a.y) });
      });
    };
    placeChips.current();

    // Frame the truck and the NEXT stop (see `fitTargetFor`) on the first draw and whenever the mode or the set of framed
    // stops changes (the order collected, the restaurant coming close). While live a new fix alone must not yank the
    // camera: refit when the truck left the padded view, got twice as close to the next stop, moved over 10% of the view,
    // or 20 s passed (never more than once per 8 s, never within 30 s of the user's drag).
    const pts = fitTargetFor(mode, at, pickup, destination);
    const has = (p: LatLng | null) => p != null && pts.includes(p);
    const modeKey = `${String(mode ?? 'none')}|${has(at) ? 't' : ''}${has(pickup) ? 'p' : ''}${has(destination) ? 'd' : ''}`;
    const next = mode === 'live' && pickup ? pickup : destination;
    const distNow = at && next ? distanceM(at, next) : 0;
    const fit = () => {
      const cam = cameraFor(pts);
      if (!cam) return;
      if (cam.kind === 'center') {
        map.current.setCenter(pt(cam.center));
        map.current.setZoom(cam.zoom);
      } else {
        map.current.fitBounds(cam.bounds, cam.padding);
      }
      lastFit.current = { at: Date.now(), dist: distNow, truck: at };
      userMovedAt.current = 0; // an explicit refit gives the camera back to the app
    };
    if (fittedMode.current !== modeKey) {
      if (pts.length > 0) {
        fit();
        fittedMode.current = modeKey;
      }
    } else if (at && scene.showTruck && has(at)) {
      const raw = map.current.getBounds?.()?.toJSON?.();
      const outside = raw != null && !insidePadded(raw, at);
      const now = Date.now();
      const userHolds = userMovedAt.current > 0 && now - userMovedAt.current < USER_MOVED_HOLD_MS;
      const from = lastFit.current.truck;
      const movedM = from ? distanceM(from, at) : 0;
      const viewSpanM = raw ? distanceM({ latitude: raw.north, longitude: raw.west }, { latitude: raw.south, longitude: raw.east }) : 0;
      if (
        !userHolds &&
        (shouldRefit({ now, lastFitAt: lastFit.current.at, outside, distNow, distAtFit: lastFit.current.dist }) ||
          shouldRefitMoving({ now, lastFitAt: lastFit.current.at, movedM, viewSpanM }))
      ) fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, driverKey, pickupKey, destKey, mode, stale, audience]);

  function moveTruck(g: G, at: LatLng | null) {
    if (!at) {
      truck.current?.marker.setMap(null);
      truck.current = null;
      return;
    }
    const look = truckLook({ stale });
    // Google's marker icon cannot rotate: the turn is baked into the image, one cached image per 5 degree bucket.
    const lookKey = (h: number) => `${look.muted}|${headingBucket(h)}`;
    const icon = (h: number) => ({
      url: truckIconUrl({ muted: look.muted, heading: h }),
      scaledSize: new g.Size(TrackLayout.truckSize, TrackLayout.truckSize),
      anchor: new g.Point(TrackLayout.truckSize / 2, TrackLayout.truckSize / 2),
    });
    const cur = truck.current;
    if (!cur) {
      const marker = new g.Marker({
        map: map.current,
        position: pt(at),
        icon: icon(heading),
        opacity: look.opacity,
        title: stale ? 'Last known position' : 'Delivery partner',
        zIndex: TRUCK_Z,
      });
      truck.current = { marker, look: lookKey(heading), at, heading };
      lastFixAt.current = driver?.recordedAt ?? null;
      return;
    }
    cur.marker.setOpacity(look.opacity);
    // Glide from where the marker is now to the new fix, taking as long as the fixes are apart (1 to 5 s), turning to
    // the new heading the short way round over the same time (a new image only when the 5 degree bucket changes).
    const glideFor = glideMs(lastFixAt.current, driver?.recordedAt);
    lastFixAt.current = driver?.recordedAt ?? null;
    if (glide.current) clearTimeout(glide.current);
    const from = cur.at;
    const fromHeading = cur.heading;
    const started = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / glideFor);
      const here = lerpPoint(from, at, t);
      cur.at = here;
      cur.marker.setPosition(pt(here));
      cur.heading = t < 1 ? turnLerp(fromHeading, heading, t) : heading;
      const key = lookKey(cur.heading);
      if (cur.look !== key) {
        cur.marker.setIcon(icon(cur.heading));
        cur.look = key;
      }
      glide.current = t < 1 ? setTimeout(step, GLIDE_STEP_MS) : null;
    };
    step();
  }

  if (!driver && !destination) return null;
  if (failed) return <MandiMapSketch {...props} />;

  return (
    <View
      style={[styles.container, bare && styles.bare, { height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel ??
        (driver ? (stale ? 'Last known partner position' : 'Partner position') : 'Waiting for the partner')
      }
    >
      <View ref={hostRef as never} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSunken,
  },
  bare: { borderRadius: 0 },
});
