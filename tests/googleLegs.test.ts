import { legsFor, truckLook, truckSvgDataUrl, cssColor, viewportFor, lerpPoint, glideMs } from '@/lib/maps/googleLegs';
import { Colors, TrackLayout } from '@/theme';

const truck = { latitude: 12.97, longitude: 77.59 };
const pickup = { latitude: 12.95, longitude: 77.57 };
const drop = { latitude: 12.99, longitude: 77.62 };

describe('legsFor', () => {
  it('pending: a dashed pickup to drop line and nothing else', () => {
    const s = legsFor({ mode: 'pending', truck: null, pickup, drop });
    expect(s.lines).toEqual([{ kind: 'dashed', path: [pickup, drop] }]);
    expect(s.circles).toEqual([]);
  });

  it('live before pickup: solid truck to pickup and dashed pickup to drop', () => {
    const s = legsFor({ mode: 'live', truck, pickup, drop });
    expect(s.lines).toEqual([
      { kind: 'solid', path: [truck, pickup] },
      { kind: 'dashed', path: [pickup, drop] },
    ]);
    expect(s.circles).toEqual([]);
  });

  it('live after pickup: a solid truck to drop line only', () => {
    const s = legsFor({ mode: 'live', truck, pickup: null, drop });
    expect(s.lines).toEqual([{ kind: 'solid', path: [truck, drop] }]);
  });

  it('arriving: solid line and the 300 m ring on the drop', () => {
    const s = legsFor({ mode: 'arriving', truck, pickup: null, drop });
    expect(s.lines).toEqual([{ kind: 'solid', path: [truck, drop] }]);
    expect(s.circles).toEqual([{ center: drop, radiusM: 300 }]);
    expect(TrackLayout.geofenceArriveM).toBe(300);
  });

  it('reached: no line and the 50 m ring on the drop', () => {
    const s = legsFor({ mode: 'reached', truck, pickup: null, drop });
    expect(s.lines).toEqual([]);
    expect(s.circles).toEqual([{ center: drop, radiusM: 50 }]);
  });

  it('placed and no mode draw no legs', () => {
    expect(legsFor({ mode: 'placed', truck: null, pickup: null, drop }).lines).toEqual([]);
    expect(legsFor({ mode: undefined, truck, pickup: null, drop }).lines).toEqual([]);
  });
});

describe('truck look', () => {
  it('flips with bearing and mutes when stale', () => {
    expect(truckLook({ bearing: 90, stale: false })).toEqual({ flip: false, muted: false, opacity: 1 });
    expect(truckLook({ bearing: 270, stale: false }).flip).toBe(true);
    expect(truckLook({ bearing: null, stale: true })).toEqual({ flip: false, muted: true, opacity: 0.6 });
  });

  it('the svg data url carries the muted palette and the mirror', () => {
    const live = decodeURIComponent(truckSvgDataUrl({ flip: false, muted: false }));
    const stale = decodeURIComponent(truckSvgDataUrl({ flip: true, muted: true }));
    expect(live).toContain(Colors.truckParcel);
    expect(live).not.toContain('scale(-1');
    expect(stale).toContain(Colors.truckMuted);
    expect(stale).not.toContain(Colors.truckParcel);
    expect(stale).toContain('scale(-1');
  });

  it('only shows the truck once a partner is on the way', () => {
    expect(legsFor({ mode: 'pending', truck, pickup, drop }).showTruck).toBe(false);
    expect(legsFor({ mode: 'live', truck, pickup, drop }).showTruck).toBe(true);
    expect(legsFor({ mode: 'live', truck: null, pickup, drop }).showTruck).toBe(false);
    expect(legsFor({ mode: undefined, truck, pickup: null, drop }).showTruck).toBe(true);
  });
});

describe('helpers', () => {
  it('splits rgba into a hex colour and an opacity', () => {
    const fill = cssColor(Colors.geofenceFill);
    expect(fill.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(fill.opacity).toBe(0.15);
    expect(cssColor(Colors.deliveryRoute)).toEqual({ color: Colors.deliveryRoute, opacity: 1 });
  });

  it('viewport fits the points with padding and a street-level minimum', () => {
    const v = viewportFor([pickup, drop]);
    expect(v.north).toBeGreaterThan(drop.latitude);
    expect(v.south).toBeLessThan(pickup.latitude);
    const tight = viewportFor([drop]);
    expect(tight.north - tight.south).toBeCloseTo(0.004, 6);
  });

  it('lerps between fixes', () => {
    expect(lerpPoint(pickup, drop, 0)).toEqual(pickup);
    expect(lerpPoint(pickup, drop, 1)).toEqual(drop);
    expect(lerpPoint(pickup, drop, 0.5).latitude).toBeCloseTo(12.97, 6);
  });
});

describe('glideMs', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, s)).toISOString();
  it('glide duration follows the gap between fixes, clamped', () => {
    expect(glideMs(at(0), at(3))).toBe(3000);
    expect(glideMs(at(0), at(0))).toBe(1000);
    expect(glideMs(at(0), at(30))).toBe(5000);
    expect(glideMs(at(10), at(5))).toBe(1000);
    expect(glideMs(null, at(5))).toBe(1000);
    expect(glideMs('nope', undefined)).toBe(1000);
  });
});
