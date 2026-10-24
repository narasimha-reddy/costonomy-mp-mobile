import {
  truckSvg, truckIconUrl, headingBucket, truckShapes, LOGO_DEEP_D, LOGO_LIGHT_D, TRUCK_VIEWBOX,
} from '@/lib/maps/truckSvg';
import { Colors } from '@/theme';

const decoded = (u: string) => decodeURIComponent(u);

describe('truckSvg', () => {
  it('draws the cargo roof and the C logo, rotated about the centre', () => {
    const svg = truckSvg({ muted: false, heading: 90 });
    const c = TRUCK_VIEWBOX / 2;
    expect(svg).toContain(`rotate(90 ${c} ${c})`);
    expect(svg).toContain(`d="${LOGO_LIGHT_D}"`);
    expect(svg).toContain(`d="${LOGO_DEEP_D}"`);
    expect(svg).toContain(Colors.truckLogoSand);
    expect(svg).toContain(Colors.truckLogoOrange);
    expect(svg).toContain(Colors.truckRoof);
    expect(svg).toContain(Colors.truckBody);
  });

  it('muted is grey all over', () => {
    const svg = truckSvg({ muted: true, heading: 0 });
    expect(svg).toContain(Colors.truckMuted);
    expect(svg).not.toContain(Colors.truckBody);
    expect(svg).not.toContain(Colors.truckLogoOrange);
  });

  it('the shapes are one list for the native icon and the web marker', () => {
    const keys = truckShapes(false).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['cargo', 'cab', 'windscreen', 'mirrorLeft', 'mirrorRight', 'shadow', 'logoLight', 'logoDeep']));
  });

  it('headings snap to 5 degree buckets, 360 is 0', () => {
    expect(headingBucket(0)).toBe(0);
    expect(headingBucket(2.4)).toBe(0);
    expect(headingBucket(2.6)).toBe(5);
    expect(headingBucket(358)).toBe(0);
    expect(headingBucket(-90)).toBe(270);
    expect(headingBucket(452)).toBe(90);
  });

  it('the data url is cached per bucket and carries the bucket rotation', () => {
    const a = truckIconUrl({ muted: false, heading: 89 });
    const b = truckIconUrl({ muted: false, heading: 91.5 });
    expect(a).toBe(b);
    expect(decoded(a)).toContain('rotate(90 ');
    expect(truckIconUrl({ muted: false, heading: 93 })).not.toBe(a);
    expect(decoded(truckIconUrl({ muted: false, heading: 93 }))).toContain('rotate(95 ');
    expect(truckIconUrl({ muted: true, heading: 90 })).not.toBe(a);
    expect(a.startsWith('data:image/svg+xml')).toBe(true);
  });
});
