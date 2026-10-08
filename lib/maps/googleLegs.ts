/**
 * What the Google web map draws, decided in plain data so it can be tested without a map.
 * The native map (MandiMap.tsx) draws the same legs; display only, nothing decides anything on it.
 */
import { mirrored, regionFor, type LatLng } from '@/lib/delivery/mapGeometry';
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
    `<rect x="1" y="3" width="24" height="15" rx="2.5" fill="${parcel}"/>` +
    `<rect x="4" y="6" width="18" height="9" rx="1.5" fill="${light}"/>` +
    `<path d="M26 7h7l5 5v6H26z" fill="${Colors.truckCab}"/>` +
    `<path d="M28 9h4l3 3h-7z" fill="${Colors.truckGlass}"/>` +
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
