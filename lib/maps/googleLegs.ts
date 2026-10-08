/**
 * What the Google web map draws, decided in plain data so it can be tested without a map.
 * The native map (MandiMap.tsx) draws the same legs; display only, nothing decides anything on it.
 */
import { haversineM, regionFor, type LatLng } from '@/lib/delivery/mapGeometry';
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

/** The truck's palette and opacity: a stale fix is grey and faded. Its heading is drawn by lib/maps/truckSvg.ts. */
export function truckLook(input: { stale: boolean }) {
  return { muted: input.stale, opacity: input.stale ? 0.6 : 1 };
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

/**
 * Before pickup the restaurant joins the supplier in the view only when the truck is this close to it. The demo route's
 * supplier-to-restaurant leg is ~2 km, so a wider radius framed all three points (and zoomed out) for the whole approach.
 */
export const NEAR_DROP_M = 800;
/** A truck fix farther than this from every known stop is a bad or default fix and is not framed. */
export const FIT_OUTLIER_M = 50_000;
/** While live the camera is refitted at least this often, and when the truck moved this share of the view. */
export const REFIT_PERIOD_MS = 20_000;
export const REFIT_MOVED_SHARE = 0.1;

/** The camera stays between a district (12) and a street (17); one point alone is shown at 16. */
export const MIN_ZOOM = 12;
export const MAX_ZOOM = 17;
export const SINGLE_POINT_ZOOM = 16;
/** Points closer than this are one point to the camera: fitting them would zoom to the maximum. */
export const SAME_POINT_M = 30;
/** Pixels kept clear around the framed points: more on top for the label chip drawn above a pin. */
export const FIT_PADDING = { top: 36, right: 24, bottom: 20, left: 24 };

/** A fix the camera can trust: numbers, not the 0,0 null island, and within 50 km of a known stop (if any). */
function frameable(p: LatLng, anchors: LatLng[]): boolean {
  const { latitude: lat, longitude: lng } = p;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return anchors.length === 0 || anchors.some((a) => haversineM(p, a) <= FIT_OUTLIER_M);
}

/**
 * The points the camera should frame. Before pickup the truck and the supplier (plus the restaurant once the truck is
 * within 800 m of it); after pickup the truck and the restaurant. With no truck yet, every known stop. A truck fix
 * that is not frameable (see `frameable`) is left out, so one bad fix cannot zoom the map out to a whole city.
 */
export function fitTargetFor(
  mode: LegMode, rawTruck: LatLng | null, pickup: LatLng | null, drop: LatLng | null,
): LatLng[] {
  const known = (list: (LatLng | null)[]) => list.filter((p): p is LatLng => p != null);
  const truck = rawTruck != null && frameable(rawTruck, known([pickup, drop])) ? rawTruck : null;
  const moving = truck != null && (mode === 'live' || mode === 'arriving' || mode === 'reached');
  if (!moving) return known([truck, pickup, drop]);
  if (pickup) {
    const dropClose = drop != null && haversineM(truck, drop) <= NEAR_DROP_M;
    return known([truck, pickup, dropClose ? drop : null]);
  }
  return known([truck, drop]);
}

export type Camera =
  | { kind: 'center'; center: LatLng; zoom: number }
  | { kind: 'bounds'; bounds: Viewport; padding: typeof FIT_PADDING };

/**
 * How to show the points: one point (or points within a few metres) is centred at street zoom; several are fitted to
 * their exact box with pixel padding. The map's own minZoom/maxZoom (MIN_ZOOM..MAX_ZOOM) clamp the result.
 */
export function cameraFor(points: LatLng[]): Camera | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const bounds = { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) };
  const diagonal = haversineM({ latitude: bounds.north, longitude: bounds.west }, { latitude: bounds.south, longitude: bounds.east });
  if (diagonal < SAME_POINT_M) {
    const center = points.length === 1 ? points[0]! : { latitude: (bounds.north + bounds.south) / 2, longitude: (bounds.east + bounds.west) / 2 };
    return { kind: 'center', center, zoom: SINGLE_POINT_ZOOM };
  }
  return { kind: 'bounds', bounds, padding: FIT_PADDING };
}

/** Web Mercator ground resolution: metres per CSS pixel at a latitude and zoom. */
export function metersPerPixel(latitude: number, zoom: number): number {
  return (156_543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/** A truck closer than this to a pin (in pixels) would sit on a chip drawn above the pin. */
export const CHIP_CLEAR_PX = 32;
/** The gap between the pin's centre and the near edge of its chip. */
export const CHIP_GAP_PX = 12;
const CHIP_HEIGHT = 22;
const CHIP_FONT_PX = 12;

const escapeXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A pin's label as a small white rounded chip with a thin border (an SVG data URL), so it reads over road names and
 * the map. Google's own marker label has no background. The width is estimated from the text length.
 */
export function chipIcon(text: string): { url: string; width: number; height: number } {
  const width = Math.round(text.length * CHIP_FONT_PX * 0.6 + 16);
  const t = escapeXml(text);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CHIP_HEIGHT}" viewBox="0 0 ${width} ${CHIP_HEIGHT}" data-chip="${t}">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${CHIP_HEIGHT - 1}" rx="${(CHIP_HEIGHT - 1) / 2}" fill="${Colors.surface}" stroke="${Colors.border}" stroke-width="1"/>` +
    `<text x="${width / 2}" y="15" text-anchor="middle" font-family="Source Sans 3, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${CHIP_FONT_PX}" font-weight="600" fill="${Colors.textPrimary}">${t}</text>` +
    '</svg>';
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, width, height: CHIP_HEIGHT };
}

/**
 * Where a pin's chip goes: above the pin, unless the truck is within CHIP_CLEAR_PX of the pin and north of it (where
 * the chip would be), in which case below. Without a zoom the distance in pixels is unknown: above.
 */
export function chipSide(pin: LatLng, truck: LatLng | null, zoom: number | undefined): 'above' | 'below' {
  if (truck == null || zoom == null || !Number.isFinite(zoom)) return 'above';
  const px = haversineM(pin, truck) / metersPerPixel(pin.latitude, zoom);
  return px <= CHIP_CLEAR_PX && truck.latitude >= pin.latitude ? 'below' : 'above';
}

/** The chip's anchor (the pin's position, in chip pixels): above puts the chip's bottom edge CHIP_GAP_PX over the pin. */
export function chipAnchor(side: 'above' | 'below', width: number, height: number): { x: number; y: number } {
  return { x: width / 2, y: side === 'above' ? height + CHIP_GAP_PX : -CHIP_GAP_PX };
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
