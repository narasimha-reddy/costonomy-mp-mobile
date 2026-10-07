import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DeliveryLocation } from '@/models/delivery';
import { Colors, Radius } from '@/theme';

export interface MandiMapProps {
  /** The driver's last known fix, or null when there is none yet. */
  driver: DeliveryLocation | null;
  /** Where it is going. */
  destination: { latitude: number; longitude: number } | null;
  /** True when the newest fix is older than the freshness threshold (doc 06 §8). */
  stale: boolean;
  height?: number;
  /** Fill the space it is given: no rounded corners, for use as the top of the tracking screen. */
  bare?: boolean;
}

/**
 * The schematic delivery map, plain React Native Views, so it runs on every platform.
 *
 * <p>Used as the web build (`react-native-maps` has no web implementation) and as the native fallback when no
 * Google Maps key is configured (the real MapView is blank without one). It draws a schematic of
 * the same facts: streets, the route from the supplier to the outlet, and where the partner's last fix puts them.
 * It is not to scale; the native map with a key is the real one.
 *
 * <p><b>Honest by construction.</b> The dot exists only when a fix has been reported, is placed from that fix alone
 * (how far it is from the outlet, on a fixed scale) and is never animated or interpolated, so it moves only when a new
 * fix arrives. A stale fix is drawn grey and without its halo. Doc 06 §8: an old position shown as live is worse than
 * none.
 */

/** The straight-line distance at which the dot sits at the supplier end. A scale for the sketch, not a route length. */
const FULL_SCALE_KM = 5;

/** The sketched route, in percent of the panel: up, across, up, across to the outlet. */
const ROUTE = [
  { x: 17, y: 83 },
  { x: 17, y: 63 },
  { x: 42, y: 63 },
  { x: 42, y: 37 },
  { x: 80, y: 37 },
] as const;
const PIN = 20;
const DOT = 18;
const HALO = 40;

export function MandiMapSketch({ driver, destination, stale, height = 220, bare = false }: MandiMapProps) {
  if (!driver && !destination) return null;

  const distanceKm = driver && destination
    ? haversineKm(Number(driver.latitude), Number(driver.longitude), destination.latitude, destination.longitude)
    : null;
  // With no outlet to measure against (a supplier has none) the dot sits mid-route: the sketch cannot place it.
  const progress = distanceKm == null ? 0.5 : Math.min(0.95, Math.max(0.05, 1 - distanceKm / FULL_SCALE_KM));
  const dot = pointAlong(progress);

  return (
    <View
      style={[styles.panel, bare && styles.bare, { height }]}
      accessible
      accessibilityLabel={driver ? (stale ? 'Last known partner position' : 'Partner position') : 'Waiting for the partner'}
    >
      <View style={[styles.water]} />
      <View style={[styles.park, { left: '56%', top: '66%', width: '40%', height: '30%' }]} />
      {[10, 36, 55, 74, 90].map((top) => (
        <View key={`h${top}`} style={[styles.road, { top: `${top}%`, left: 0, right: 0, height: top === 36 ? 10 : 6 }]} />
      ))}
      {[17, 42, 80].map((left) => (
        <View key={`v${left}`} style={[styles.road, { left: `${left}%`, top: 0, bottom: 0, width: 10 }]} />
      ))}

      {ROUTE.slice(1).map((to, i) => {
        const from = ROUTE[i] as { x: number; y: number };
        return <Leg key={i} from={from} to={to} />;
      })}

      <View style={[styles.pin, styles.pickup, at(ROUTE[0].x, ROUTE[0].y)]} />
      <View style={[styles.pin, styles.drop, at(ROUTE[4].x, ROUTE[4].y)]} />

      {driver && (
        <View testID="map-driver" style={[styles.dotSlot, at(dot.x, dot.y)]}>
          {!stale && <View style={styles.halo} />}
          <View style={[styles.dot, stale && styles.dotStale]}>
            <Ionicons name="bicycle" size={12} color={Colors.textInverse} />
          </View>
        </View>
      )}
    </View>
  );
}

/** A point on the sketched route, `progress` of the way from the start (0) to the end (1), by drawn length. */
function pointAlong(progress: number): { x: number; y: number } {
  const lengths = ROUTE.slice(1).map((to, i) => {
    const from = ROUTE[i] as { x: number; y: number };
    return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  });
  let remaining = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i] as number;
    const from = ROUTE[i] as { x: number; y: number };
    const to = ROUTE[i + 1] as { x: number; y: number };
    if (remaining <= length || i === lengths.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, remaining / length);
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    remaining -= length;
  }
  return ROUTE[0];
}

const at = (x: number, y: number): ViewStyle => ({ left: `${x}%`, top: `${y}%` });

/** One straight stretch of the route, always horizontal or vertical. */
function Leg({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const horizontal = from.y === to.y;
  const style: ViewStyle = horizontal
    ? { left: `${Math.min(from.x, to.x)}%`, top: `${from.y}%`, width: `${Math.abs(to.x - from.x)}%`, height: 5, marginTop: -2 }
    : { left: `${from.x}%`, top: `${Math.min(from.y, to.y)}%`, height: `${Math.abs(to.y - from.y)}%`, width: 5, marginLeft: -2 };
  return <View style={[styles.route, style]} />;
}

/** Great-circle distance in km. Display only: nothing decides anything on it. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.mapBackground,
  },
  bare: { borderRadius: 0 },
  water: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '34%',
    height: '14%',
    borderBottomRightRadius: 80,
    backgroundColor: Colors.mapWater,
  },
  park: { position: 'absolute', borderRadius: Radius.md, backgroundColor: Colors.mapPark },
  road: { position: 'absolute', backgroundColor: Colors.mapRoad },
  route: { position: 'absolute', borderRadius: 3, backgroundColor: Colors.primary },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    marginLeft: -PIN / 2,
    marginTop: -PIN / 2,
    borderWidth: 3,
    borderColor: Colors.surface,
  },
  pickup: { borderRadius: PIN / 2, backgroundColor: Colors.textPrimary },
  drop: { borderRadius: Radius.sm - 3, backgroundColor: Colors.deliveryDestination },
  dotSlot: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: Colors.primary,
    opacity: 0.22,
  },
  dot: {
    width: DOT + 6,
    height: DOT + 6,
    borderRadius: (DOT + 6) / 2,
    backgroundColor: Colors.deliveryDriver,
    borderWidth: 3,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotStale: { backgroundColor: Colors.stale },
});
