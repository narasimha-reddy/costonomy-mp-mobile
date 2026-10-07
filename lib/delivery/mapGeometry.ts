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

/** True when the truck (drawn facing right) should be mirrored: a bearing from 180 up to, not including, 360. */
export function mirrored(bearing: number | string | null | undefined): boolean {
  if (bearing == null) return false;
  const n = Number(bearing);
  if (!Number.isFinite(n)) return false;
  const d = ((n % 360) + 360) % 360;
  return d >= 180;
}

/** The server sends coordinates as decimal strings. */
export function toLatLng(loc: DeliveryLocation): LatLng {
  return { latitude: Number(loc.latitude), longitude: Number(loc.longitude) };
}
