/**
 * The delivery truck marker, seen from above: one list of shapes drawn by the native icon (TruckTopIcon, through
 * react-native-svg) and, as an SVG string, by the web Google marker and the preview tool (tools/truck-preview).
 *
 * <p>The truck faces up (north) in a square box, so it can turn about the box's centre without leaving it: the cab at
 * the front with its windscreen and mirrors, the cargo box behind it with a white roof, and the Costonomy C on the roof.
 */
import { normDeg } from '@/lib/delivery/mapGeometry';
import { Colors } from '@/theme';

/** The artwork's square viewBox side; the marker centre is (24, 24). */
export const TRUCK_VIEWBOX = 48;
/** Headings snap to this many degrees on the web marker: a new image per bucket, not per animation frame. */
export const HEADING_BUCKET_DEG = 5;

const LOGO_CX = 24;
const LOGO_CY = 29;
const LOGO_R = 7.2;

/** A point on the logo's rim, `deg` counter-clockwise from east (SVG y grows downwards). */
const rim = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return `${(LOGO_CX + LOGO_R * Math.cos(r)).toFixed(2)} ${(LOGO_CY - LOGO_R * Math.sin(r)).toFixed(2)}`;
};

/**
 * The Costonomy C: a disc with a right-angle wedge cut out on the right (from -45 to 45 degrees). The upper quarter
 * (45 to 135) is the light sand tone, the remaining half (135 round through the bottom to 315) the deeper orange.
 */
export const LOGO_LIGHT_D = `M${LOGO_CX} ${LOGO_CY}L${rim(45)}A${LOGO_R} ${LOGO_R} 0 0 0 ${rim(135)}Z`;
export const LOGO_DEEP_D = `M${LOGO_CX} ${LOGO_CY}L${rim(135)}A${LOGO_R} ${LOGO_R} 0 1 0 ${rim(315)}Z`;

export type TruckShape =
  | { key: string; kind: 'rect'; x: number; y: number; width: number; height: number; rx: number; fill: string; stroke?: string; strokeWidth?: number }
  | { key: string; kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string }
  | { key: string; kind: 'path'; d: string; fill: string };

/** The shapes, back to front, in the live or the muted (stale) palette. */
export function truckShapes(muted: boolean): TruckShape[] {
  const body = muted ? Colors.truckMuted : Colors.truckBody;
  const roof = muted ? Colors.truckMutedRoof : Colors.truckRoof;
  const edge = muted ? Colors.truckMutedLight : Colors.truckRoofEdge;
  const dark = muted ? Colors.truckMuted : Colors.truckCab;
  const glass = muted ? Colors.truckMutedLight : Colors.truckGlass;
  const logoLight = muted ? Colors.truckMutedLight : Colors.truckLogoSand;
  const logoDeep = muted ? Colors.truckMuted : Colors.truckLogoOrange;
  return [
    { key: 'shadow', kind: 'ellipse', cx: 24.8, cy: 25.6, rx: 11, ry: 19.6, fill: Colors.truckShadow },
    { key: 'mirrorLeft', kind: 'rect', x: 13.4, y: 9.4, width: 3, height: 1.8, rx: 0.9, fill: dark },
    { key: 'mirrorRight', kind: 'rect', x: 31.6, y: 9.4, width: 3, height: 1.8, rx: 0.9, fill: dark },
    { key: 'hitch', kind: 'rect', x: 19.5, y: 14.5, width: 9, height: 3, rx: 0.6, fill: dark },
    { key: 'cab', kind: 'rect', x: 15.8, y: 5, width: 16.4, height: 10.4, rx: 4, fill: body },
    { key: 'windscreen', kind: 'rect', x: 17.6, y: 6.8, width: 12.8, height: 3.4, rx: 1.5, fill: glass },
    { key: 'cargo', kind: 'rect', x: 14.5, y: 16.8, width: 19, height: 25.4, rx: 2.4, fill: roof, stroke: edge, strokeWidth: 1 },
    { key: 'logoDeep', kind: 'path', d: LOGO_DEEP_D, fill: logoDeep },
    { key: 'logoLight', kind: 'path', d: LOGO_LIGHT_D, fill: logoLight },
  ];
}

/** A heading snapped to its HEADING_BUCKET_DEG bucket, 0..355. */
export function headingBucket(heading: number): number {
  return normDeg(Math.round(normDeg(heading) / HEADING_BUCKET_DEG) * HEADING_BUCKET_DEG);
}

function shapeSvg(s: TruckShape): string {
  switch (s.kind) {
    case 'rect': {
      const stroke = s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.strokeWidth ?? 1}"` : '';
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.rx}" fill="${s.fill}"${stroke}/>`;
    }
    case 'ellipse':
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"/>`;
    case 'path':
      return `<path d="${s.d}" fill="${s.fill}"/>`;
  }
}

/** The truck as a standalone SVG document, turned to `heading` (degrees clockwise from north) about its centre. */
export function truckSvg({ muted, heading, size = TRUCK_VIEWBOX }: { muted: boolean; heading: number; size?: number }): string {
  const c = TRUCK_VIEWBOX / 2;
  const turn = Number.isInteger(heading) ? heading : Number(heading.toFixed(1));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${TRUCK_VIEWBOX} ${TRUCK_VIEWBOX}">` +
    `<g transform="rotate(${turn} ${c} ${c})">${truckShapes(muted).map(shapeSvg).join('')}</g></svg>`
  );
}

const iconCache = new Map<string, string>();

/**
 * The web marker image: Google's marker icon cannot rotate, so the rotation is baked into the SVG. One data URL per
 * palette and 5 degree bucket, built once and reused, so a turning truck does not rebuild an image every frame.
 */
export function truckIconUrl({ muted, heading }: { muted: boolean; heading: number }): string {
  const bucket = headingBucket(heading);
  const key = `${muted ? 'm' : 'l'}${bucket}`;
  let url = iconCache.get(key);
  if (url == null) {
    url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(truckSvg({ muted, heading: bucket }))}`;
    iconCache.set(key, url);
  }
  return url;
}
