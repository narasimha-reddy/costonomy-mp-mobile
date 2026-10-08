/**
 * What the Google web map draws, decided in plain data so it can be tested without a map.
 * The native map (MandiMap.tsx) draws the same legs; display only, nothing decides anything on it.
 */
import { haversineM, mirrored, regionFor, type LatLng } from '@/lib/delivery/mapGeometry';
import { Colors, TrackLayout } from '@/theme';

export type LegMode = 'placed' | 'pending' | 'live' | 'arriving' | 'reached' | undefined;

export interface Leg {
  kind: 'solid' | 'dashed';
  path: LatLng[];
}
export interface Ring {
  center: LatLng;
  radiusM: number;
}
export interface Scene {
  lines: Leg[];
  circles: Ring[];
  showTruck: boolean;
}

/** Straight segments between known points: there is no route source. */
export function legsFor(input: { mode: LegMode; truck: LatLng | null; pickup: LatLng | null; drop: LatLng | null }): Scene {
  const { mode, truck, pickup, drop } = input;
  const lines: Leg[] = [];
  const circles: Ring[] = [];
  if (mode === 'pending' && pickup && drop) lines.push({ kind: 'dashed', path: [pickup, drop] });
  if ((mode === 'live' || mode === 'arriving' || mode === 'reached') && truck) {
    if (pickup) {
      lines.push({ kind: 'solid', path: [truck, pickup] });
      if (drop) lines.push({ kind: 'dashed', path: [pickup, drop] });
    } else if (drop && mode !== 'reached') {
      lines.push({ kind: 'solid', path: [truck, drop] });
    }
  }
  if ((mode === 'arriving' || mode === 'reached') && drop) {
    circles.push({ center: drop, radiusM: mode === 'arriving' ? TrackLayout.geofenceArriveM : TrackLayout.geofenceReachM });
  }
  const showTruck = truck != null && mode !== 'placed' && mode !== 'pending';
  return { lines, circles, showTruck };
}

export function truckLook(input: { bearing: number | string | null | undefined; stale: boolean }) {
  return { flip: mirrored(input.bearing), muted: input.stale, opacity: input.stale ? 0.6 : 1 };
}

/** The TruckIcon artwork (components/delivery/TruckIcon.tsx) as an SVG data URL, mirrored with the flip. */
export function truckSvgDataUrl({ flip, muted }: { flip: boolean; muted: boolean }): string {
  const parcel = muted ? Colors.truckMuted : Colors.truckParcel;
  const light = muted ? Colors.truckMutedLight : Colors.truckParcelLight;
  const body =
    `<rect x="1" y="3" width="24" height="14" rx="2.5" fill="${parcel}"/>` +
    `<rect x="5" y="6" width="16" height="7" rx="1.5" fill="${light}"/>` +
    `<path d="M24 7h8l6 6v4H24z" fill="${parcel}"/>` +
    `<path d="M27 9h4l3 3.5h-7z" fill="${Colors.truckGlass}"/>` +
    `<rect x="1" y="15" width="37" height="3" rx="1" fill="${Colors.truckCab}"/>` +
    `<circle cx="9" cy="19" r="3.2" fill="${Colors.truckCab}" stroke="${Colors.surface}" stroke-width="1"/>` +
    `<circle cx="31" cy="19" r="3.2" fill="${Colors.truckCab}" stroke="${Colors.surface}" stroke-width="1"/>`;
  const inner = flip ? `<g transform="translate(40 0) scale(-1 1)">${body}</g>` : body;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24" viewBox="0 0 40 24">${inner}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Google's shapes take a colour and a separate opacity; split an rgba() token. */
export function cssColor(token: string): { color: string; opacity: number } {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(token);
  if (!m) return { color: token, opacity: 1 };
  const hex = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  return { color: `#${hex}`, opacity: Number(m[4]) };
}

export interface Viewport {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** The mapGeometry region (25% padding, street level to city) as a bounds literal for fitBounds. */
export function viewportFor(points: LatLng[]): Viewport {
  const r = regionFor(points);
  return {
    north: r.latitude + r.latitudeDelta / 2,
    south: r.latitude - r.latitudeDelta / 2,
    east: r.longitude + r.longitudeDelta / 2,
    west: r.longitude - r.longitudeDelta / 2,
  };
}

export function lerpPoint(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/**
 * How long the truck glides to a new fix: the gap between the provider's timestamps of the last two fixes, so the
 * movement looks continuous at whatever pace they arrive, clamped to 1 s..5 s. Unreadable timestamps give 1 s.
 */
export function glideMs(prevRecordedAt?: string | null, nextRecordedAt?: string | null): number {
  const gap = Date.parse(nextRecordedAt ?? '') - Date.parse(prevRecordedAt ?? '');
  if (!Number.isFinite(gap)) return 1000;
  return Math.min(5000, Math.max(1000, gap));
}

/** Hide business and transit labels so they do not collide with our pins; roads and area names stay. */
export const QUIET_MAP_STYLE: { featureType: string; elementType: string; stylers: { visibility: string }[] }[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

export const REFIT_MIN_GAP_MS = 8000;

/** True when the point sits inside the view with a margin (default 15% of each side) to spare. */
export function insidePadded(view: Viewport, p: LatLng, pad: number = 0.15): boolean {
  const dLat = (view.north - view.south) * pad;
  const dLng = (view.east - view.west) * pad;
  return (
    p.latitude <= view.north - dLat && p.latitude >= view.south + dLat &&
    p.longitude <= view.east - dLng && p.longitude >= view.west + dLng
  );
}

/**
 * Whether the camera should be refitted for a moving truck: never more than once per 8 s, and only when the truck left
 * the padded view or the distance to the next stop is half of (or less than) what it was at the last fit.
 */
export function shouldRefit(input: {
  now: number; lastFitAt: number; outside: boolean; distNow: number; distAtFit: number;
}): boolean {
  if (input.now - input.lastFitAt < REFIT_MIN_GAP_MS) return false;
  return input.outside || (input.distAtFit > 0 && input.distNow <= input.distAtFit / 2);
}

export const distanceM = haversineM;

/** The restaurant counts as "close" to the truck (and joins the supplier in the view) inside this distance. */
export const NEAR_DROP_M = 3000;
/** While live the camera is refitted at least this often, and when the truck moved this share of the view. */
export const REFIT_PERIOD_MS = 20_000;
export const REFIT_MOVED_SHARE = 0.1;

/**
 * The points the camera should frame. Before pickup the truck and the supplier (plus the restaurant once it is close);
 * after pickup the truck and the restaurant. With no truck yet, every known stop.
 */
export function fitTargetFor(
  mode: LegMode, truck: LatLng | null, pickup: LatLng | null, drop: LatLng | null,
): LatLng[] {
  const known = (list: (LatLng | null)[]) => list.filter((p): p is LatLng => p != null);
  const moving = truck != null && (mode === 'live' || mode === 'arriving' || mode === 'reached');
  if (!moving) return known([truck, pickup, drop]);
  if (pickup) {
    const dropClose = drop != null && haversineM(truck, drop) <= NEAR_DROP_M;
    return known([truck, pickup, dropClose ? drop : null]);
  }
  return known([truck, drop]);
}

/**
 * Whether a live camera should be refitted for the moving truck: not within 8 s of the last fit, then when the truck
 * moved more than 10% of the current view since the last fit, or when 20 s have passed.
 */
export function shouldRefitMoving(input: {
  now: number; lastFitAt: number; movedM: number; viewSpanM: number;
}): boolean {
  const since = input.now - input.lastFitAt;
  if (since < REFIT_MIN_GAP_MS) return false;
  return since >= REFIT_PERIOD_MS || (input.viewSpanM > 0 && input.movedM > input.viewSpanM * REFIT_MOVED_SHARE);
}
