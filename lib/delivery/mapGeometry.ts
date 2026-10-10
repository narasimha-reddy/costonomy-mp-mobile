/**
 * Map geometry for the tracking map. Pure; display only: nothing decides anything on it.
 * Shared by the native map, the schematic and the web map.
 */
import type { DeliveryLocation } from '@/models/delivery';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

const EARTH_RADIUS_M = 6371000;
/** Street level at the closest, and never wider than a city. */
export const MIN_DELTA = 0.004;
export const MAX_DELTA = 0.3;
/** Each side of the box is widened by this share of its span. */
export const REGION_PAD = 0.25;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** The box around the points, each side widened by `padPct` (0.25 = 25%) of that side's span. */
export function boundsFor(points: LatLng[], padPct: number = REGION_PAD): Bounds {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * padPct;
  const padLng = (maxLng - minLng) * padPct;
  return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
}

const clamp = (v: number) => Math.min(MAX_DELTA, Math.max(MIN_DELTA, v));

/** A react-native-maps region that fits the points with 25% padding, clamped to street level .. city. */
export function regionFor(points: LatLng[]): MapRegion {
  const b = boundsFor(points, REGION_PAD);
  return {
    latitude: (b.minLat + b.maxLat) / 2,
    longitude: (b.minLng + b.maxLng) / 2,
    latitudeDelta: clamp(b.maxLat - b.minLat),
    longitudeDelta: clamp(b.maxLng - b.minLng),
  };
}

/** A move shorter than this between fixes is GPS jitter or a truck standing still: it does not turn the truck. */
export const MIN_HEADING_MOVE_M = 5;

/** Degrees into 0 (inclusive) .. 360 (exclusive). */
export function normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** The initial compass bearing from a to b: 0 north, 90 east, 180 south, 270 west. */
export function bearingBetween(a: LatLng, b: LatLng): number {
  const f1 = toRad(a.latitude);
  const f2 = toRad(b.latitude);
  const dl = toRad(b.longitude - a.longitude);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return normDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/** The heading for a move from prev to next; a move under MIN_HEADING_MOVE_M (or no prev) keeps the last heading. */
export function headingFrom(prev: LatLng | null, next: LatLng, lastHeading: number): number {
  if (prev == null || haversineM(prev, next) < MIN_HEADING_MOVE_M) return lastHeading;
  return bearingBetween(prev, next);
}

/** The signed turn (-180 .. 180] that takes `from` to `to` the short way round. */
export function shortestTurn(from: number, to: number): number {
  const d = normDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** The heading `t` (0..1) of the way from `from` to `to`, turning the short way: 350 to 10 passes north, not south. */
export function turnLerp(from: number, to: number, t: number): number {
  return normDeg(from + shortestTurn(from, to) * t);
}

/** Where the truck is facing, and the fix that heading was last measured from. */
export interface HeadingState {
  anchor: LatLng | null;
  heading: number;
}

/**
 * The heading after a new fix: the provider's bearing when it sends a readable one, else the direction of the move
 * since the last fix that counted (a move under 5 m, standing at the pickup, keeps the heading and the anchor, so a
 * slow crawl still turns the truck once it adds up to 5 m).
 */
export function advanceHeading(state: HeadingState, fix: DeliveryLocation): HeadingState {
  const at = toLatLng(fix);
  const sent = fix.bearing == null || fix.bearing === '' ? NaN : Number(fix.bearing);
  if (Number.isFinite(sent)) return { anchor: at, heading: normDeg(sent) };
  if (state.anchor == null) return { anchor: at, heading: state.heading };
  if (haversineM(state.anchor, at) < MIN_HEADING_MOVE_M) return state;
  return { anchor: at, heading: headingFrom(state.anchor, at, state.heading) };
}

/** The server sends coordinates as decimal strings. */
export function toLatLng(loc: DeliveryLocation): LatLng {
  return { latitude: Number(loc.latitude), longitude: Number(loc.longitude) };
}
