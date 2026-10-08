import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { loadWebMaps } from '@/lib/maps/googleWebLoader';
import { markTilesFailed, tilesFailed, TILE_TIMEOUT_MS } from '@/lib/maps/tileWatchdog';
import { toLatLng, type LatLng } from '@/lib/delivery/mapGeometry';
import { cssColor, legsFor, lerpPoint, truckLook, truckSvgDataUrl, viewportFor } from '@/lib/maps/googleLegs';
import { MandiMapSketch, type MandiMapProps } from './MandiMapSketch';
import { Colors, Radius, TrackLayout } from '@/theme';

/** The truck glides to a new fix over this long instead of jumping. */
const GLIDE_MS = 1000;
const GLIDE_STEP_MS = 40;

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
  markTilesFailed();
  authListeners.forEach((l) => l());
}

const pt = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });

/**
 * The delivery map on the web: the real Google map (Maps JavaScript API) drawing the same facts as the native
 * one, the supplier pin, the restaurant pin, the truck and the route legs (see `legsFor`). Any failure (no
 * script, a refused key, no tiles in 6 s) swaps it for the schematic, which is always honest about the same data.
 *
 * <p>The truck is a marker with the TruckIcon artwork, mirrored by bearing and greyed when the fix is stale. A stale
 * fix is drawn differently, never as current.
 */
export function GoogleTrackMap(props: MandiMapProps) {
  const { driver, destination, stale, height = 220, bare = false, pickup = null, mode, accessibilityLabel } = props;
  const [failed, setFailed] = useState(tilesFailed());
  const [ready, setReady] = useState(false);
  const host = useRef<unknown>(null);
  const map = useRef<G>(null);
  const truck = useRef<{ marker: G; look: string; at: LatLng } | null>(null);
  const overlays = useRef<G[]>([]);
  const glide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fittedMode = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Load the script and create the map, once per mount.
  useEffect(() => {
    if (failed) return undefined;
    let alive = true;
    const fail = () => {
      if (!alive) return;
      clearTimer();
      setFailed(true);
    };
    authListeners.add(fail);
    installAuthHook();
    timer.current = setTimeout(() => {
      markTilesFailed();
      fail();
    }, TILE_TIMEOUT_MS);
    loadWebMaps()
      .then(() => {
        if (!alive) return;
        const g: G = (window as any).google.maps;
        map.current = new g.Map(host.current, {
          center: { lat: 12.9716, lng: 77.5946 },
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: 'none',
          clickableIcons: false,
        });
        g.event.addListenerOnce(map.current, 'tilesloaded', clearTimer);
        setReady(true);
      })
      .catch(fail);
    return () => {
      alive = false;
      authListeners.delete(fail);
      clearTimer();
      if (glide.current) clearTimeout(glide.current);
      overlays.current.forEach((o) => o.setMap(null));
      truck.current?.marker.setMap(null);
      overlays.current = [];
      truck.current = null;
      map.current = null;
    };
  }, [failed]);

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
    const pin = (p: LatLng, text: string, fill: string) =>
      own(
        new g.Marker({
          map: map.current,
          position: pt(p),
          title: text,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: fill,
            fillOpacity: 1,
            strokeColor: Colors.surface,
            strokeWeight: 2,
            labelOrigin: new g.Point(0, 2.6),
          },
          label: { text, color: Colors.textPrimary, fontSize: '12px', fontWeight: '600' },
        }),
      );
    if (pickup && (mode != null || !driver)) pin(pickup, 'Supplier', Colors.textPrimary);
    if (destination) pin(destination, 'Restaurant', Colors.success);

    moveTruck(g, scene.showTruck ? at : null);

    // Fit on the first draw and when the mode changes; a new fix alone must not yank the camera.
    const modeKey = String(mode ?? 'none');
    if (fittedMode.current !== modeKey) {
      const pts = [at, pickup, destination].filter((p): p is LatLng => p != null);
      if (pts.length > 0) {
        map.current.fitBounds(viewportFor(pts), 0);
        fittedMode.current = modeKey;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, driverKey, pickupKey, destKey, mode, stale]);

  function moveTruck(g: G, at: LatLng | null) {
    if (!at) {
      truck.current?.marker.setMap(null);
      truck.current = null;
      return;
    }
    const look = truckLook({ bearing: driver?.bearing, stale });
    const lookKey = `${look.flip}|${look.muted}`;
    const icon = () => ({
      url: truckSvgDataUrl(look),
      scaledSize: new g.Size(TrackLayout.truckWidth, (TrackLayout.truckWidth * 24) / 40),
      anchor: new g.Point(TrackLayout.truckWidth / 2, (TrackLayout.truckWidth * 24) / 80),
    });
    const cur = truck.current;
    if (!cur) {
      const marker = new g.Marker({
        map: map.current,
        position: pt(at),
        icon: icon(),
        opacity: look.opacity,
        title: stale ? 'Last known position' : 'Delivery partner',
        zIndex: 10,
      });
      truck.current = { marker, look: lookKey, at };
      return;
    }
    if (cur.look !== lookKey) {
      cur.marker.setIcon(icon());
      cur.look = lookKey;
    }
    cur.marker.setOpacity(look.opacity);
    // Glide from where the marker is now to the new fix.
    if (glide.current) clearTimeout(glide.current);
    const from = cur.at;
    const started = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / GLIDE_MS);
      const here = lerpPoint(from, at, t);
      cur.at = here;
      cur.marker.setPosition(pt(here));
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
      <View ref={host as never} style={StyleSheet.absoluteFill} />
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
