import {
  legsFor, truckLook, cssColor, viewportFor, lerpPoint, glideMs, shouldRefit, shouldRefitMoving, fitTargetFor, insidePadded,
  QUIET_MAP_STYLE, cameraFor, MIN_ZOOM, MAX_ZOOM, SINGLE_POINT_ZOOM, NEAR_DROP_M, chipIcon, chipSide, metersPerPixel, truckShownAt, TRUCK_PIN_CLEAR_M, distanceM,
} from '@/lib/maps/googleLegs';
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
  it('mutes when stale; the heading is not its business', () => {
    expect(truckLook({ stale: false })).toEqual({ muted: false, opacity: 1 });
    expect(truckLook({ stale: true })).toEqual({ muted: true, opacity: 0.6 });
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

describe('quiet map style', () => {
  it('hides business POI and transit labels but leaves roads and areas', () => {
    const hidden = QUIET_MAP_STYLE.filter((r) => r.stylers.some((x) => x.visibility === 'off')).map((r) => r.featureType);
    expect(hidden).toEqual(expect.arrayContaining(['poi', 'transit']));
    expect(hidden).not.toContain('road');
    expect(hidden).not.toContain('administrative.locality');
  });
});

describe('insidePadded', () => {
  const view = { north: 13, south: 12, east: 78, west: 77 };
  it('is true well inside and false near the edge or outside', () => {
    expect(insidePadded(view, { latitude: 12.5, longitude: 77.5 })).toBe(true);
    expect(insidePadded(view, { latitude: 12.99, longitude: 77.5 })).toBe(false);
    expect(insidePadded(view, { latitude: 14, longitude: 77.5 })).toBe(false);
  });
});

describe('shouldRefit', () => {
  const base = { now: 100_000, lastFitAt: 0, outside: false, distNow: 1000, distAtFit: 1000 };
  it('never within 8 s of the last fit', () => {
    expect(shouldRefit({ ...base, lastFitAt: 95_000, outside: true })).toBe(false);
  });
  it('refits when the truck left the padded view', () => {
    expect(shouldRefit({ ...base, outside: true })).toBe(true);
  });
  it('refits when the distance to the next stop halved', () => {
    expect(shouldRefit({ ...base, distNow: 500 })).toBe(true);
    expect(shouldRefit({ ...base, distNow: 600 })).toBe(false);
  });
});

describe('fitTargetFor', () => {
  const far = { latitude: 13.2, longitude: 77.9 };
  it('before pickup: the truck and the supplier, and the restaurant only when it is close', () => {
    expect(fitTargetFor('live', truck, pickup, far)).toEqual([truck, pickup]);
    const near = { latitude: 12.972, longitude: 77.592 };
    expect(fitTargetFor('live', truck, pickup, near)).toEqual([truck, pickup, near]);
  });
  // The demo route (flow review 4, order 116): the truck starts ~1 km south of the supplier in Domlur and the
  // restaurant in Indiranagar is ~2 km north of it. The restaurant must stay out of the approach frame.
  const demoSupplier = { latitude: 12.96109, longitude: 77.63869 };
  const demoRestaurant = { latitude: 12.9784, longitude: 77.64081 };
  it('before pickup the restaurant 2 km away is not framed; it joins only within 800 m of the truck', () => {
    expect(NEAR_DROP_M).toBe(800);
    const approaching = { latitude: 12.95319, longitude: 77.63513 };
    expect(fitTargetFor('live', approaching, demoSupplier, demoRestaurant)).toEqual([approaching, demoSupplier]);
    const atSupplier = { latitude: 12.96109, longitude: 77.63869 };
    expect(fitTargetFor('live', atSupplier, demoSupplier, demoRestaurant)).toEqual([atSupplier, demoSupplier]);
    const near = { latitude: 12.9734, longitude: 77.6408 }; // ~560 m from the restaurant
    expect(fitTargetFor('live', near, demoSupplier, demoRestaurant)).toEqual([near, demoSupplier, demoRestaurant]);
  });
  it('ignores a truck fix more than 50 km from both stops, at 0,0 or not a number', () => {
    const gurugram = { latitude: 28.4595, longitude: 77.0266 };
    expect(fitTargetFor('live', gurugram, demoSupplier, demoRestaurant)).toEqual([demoSupplier, demoRestaurant]);
    expect(fitTargetFor('live', gurugram, null, demoRestaurant)).toEqual([demoRestaurant]);
    expect(fitTargetFor('live', { latitude: 0, longitude: 0 }, null, demoRestaurant)).toEqual([demoRestaurant]);
    expect(fitTargetFor('live', { latitude: NaN, longitude: 77.6 }, null, demoRestaurant)).toEqual([demoRestaurant]);
    // With no stop to compare against a plausible fix is still framed.
    expect(fitTargetFor('live', truck, null, null)).toEqual([truck]);
  });
  it('after pickup (and arriving, reached): the truck and the restaurant, never the supplier', () => {
    for (const m of ['live', 'arriving', 'reached'] as const) {
      expect(fitTargetFor(m, truck, null, drop)).toEqual([truck, drop]);
    }
  });
  it('without a truck or before a partner: every known stop', () => {
    expect(fitTargetFor('pending', null, pickup, drop)).toEqual([pickup, drop]);
    expect(fitTargetFor('live', null, pickup, drop)).toEqual([pickup, drop]);
    expect(fitTargetFor('live', truck, null, null)).toEqual([truck]);
  });
});

describe('shouldRefitMoving', () => {
  const base = { now: 100_000, lastFitAt: 90_000, movedM: 0, viewSpanM: 10_000 };
  it('not within 8 s of the last fit', () => {
    expect(shouldRefitMoving({ ...base, lastFitAt: 95_000, movedM: 5000 })).toBe(false);
  });
  it('when the truck moved more than 10% of the view', () => {
    expect(shouldRefitMoving({ ...base, movedM: 1100 })).toBe(true);
    expect(shouldRefitMoving({ ...base, movedM: 900 })).toBe(false);
  });
  it('every 20 s while live, even if barely moved', () => {
    expect(shouldRefitMoving({ ...base, lastFitAt: 79_000 })).toBe(true);
    expect(shouldRefitMoving({ ...base, lastFitAt: 85_000 })).toBe(false);
  });
});

describe('cameraFor', () => {
  it('a single point is centred at street zoom, never fitted', () => {
    expect(cameraFor([truck])).toEqual({ kind: 'center', center: truck, zoom: SINGLE_POINT_ZOOM });
    expect(SINGLE_POINT_ZOOM).toBe(16);
    // Two fixes a few metres apart are one point for the camera (a fit would zoom to the maximum).
    expect(cameraFor([truck, { latitude: 12.97001, longitude: 77.59001 }])?.kind).toBe('center');
    expect(cameraFor([])).toBeNull();
  });
  it('several points: the exact bounds of the points with pixel padding (no extra 25% box), zoom clamped 12..17', () => {
    const cam = cameraFor([truck, pickup]);
    expect(cam).toEqual({
      kind: 'bounds',
      bounds: { north: 12.97, south: 12.95, east: 77.59, west: 77.57 },
      padding: expect.objectContaining({ top: expect.any(Number), bottom: expect.any(Number) }),
    });
    expect(MIN_ZOOM).toBe(12);
    expect(MAX_ZOOM).toBe(17);
  });
});

describe('pin label chips', () => {
  it('a white rounded chip with a thin border carrying the text', () => {
    const c = chipIcon('Supplier');
    const svg = decodeURIComponent(c.url);
    expect(svg).toContain('data-chip="Supplier"');
    expect(svg).toContain('>Supplier<');
    expect(svg).toContain(`fill="${Colors.surface}"`);
    expect(svg).toContain(`stroke="${Colors.border}"`);
    expect(svg).toMatch(/rx="\d/);
    expect(c.width).toBeGreaterThan(chipIcon('You').width);
  });
  it('escapes markup in the text', () => {
    expect(decodeURIComponent(chipIcon('A & <B>').url)).toContain('A &amp; &lt;B&gt;');
  });
  it('sits above the pin unless the truck is within ~30 px north of it', () => {
    const pin = { latitude: 12.96109, longitude: 77.63869 };
    const mpp = metersPerPixel(pin.latitude, 15);
    expect(mpp).toBeGreaterThan(4);
    expect(mpp).toBeLessThan(5);
    expect(chipSide(pin, null, 15)).toBe('above');
    expect(chipSide(pin, { latitude: 13.2, longitude: 77.6 }, 15)).toBe('above');
    // ~20 px north of the pin at zoom 15: the chip moves below so the truck does not cover it.
    const north = { latitude: pin.latitude + (20 * mpp) / 111_320, longitude: pin.longitude };
    expect(chipSide(pin, north, 15)).toBe('below');
    // ~20 px south: the chip above is clear of the truck.
    const south = { latitude: pin.latitude - (20 * mpp) / 111_320, longitude: pin.longitude };
    expect(chipSide(pin, south, 15)).toBe('above');
    // Zoomed further in, the same metres are many pixels apart; with no zoom known the chip stays above.
    expect(chipSide(pin, north, 19)).toBe('above');
    expect(chipSide(pin, north, undefined)).toBe('above');
  });
});

describe('pin label font', () => {
  it('quotes the multi-word family so "3" is not an invalid bare token, and ends on a sans fallback', () => {
    const svg = decodeURIComponent(chipIcon('You').url);
    expect(svg).toContain("font-family=\"'Source Sans 3', ");
    expect(svg).toMatch(/sans-serif"/);
    expect(svg).not.toMatch(/font-family="Source Sans 3,/);
  });
});

describe('truckShownAt', () => {
  const pin = { latitude: 12.97, longitude: 77.59 };
  const metresNorth = (m: number) => ({ latitude: pin.latitude + m / 111_195, longitude: pin.longitude });
  it('leaves a truck that is clear of every pin where it is', () => {
    const t = metresNorth(100);
    expect(truckShownAt(t, [pin], 0)).toBe(t);
    expect(truckShownAt(t, [], 0)).toBe(t);
  });
  it('moves a truck within 40 m of a pin out to 40 m, on the side it came from', () => {
    const t = metresNorth(10);
    const shown = truckShownAt(t, [pin], 0);
    expect(distanceM(shown, pin)).toBeGreaterThanOrEqual(TRUCK_PIN_CLEAR_M - 1);
    expect(shown.latitude).toBeGreaterThan(pin.latitude);
  });
  it('a truck exactly on the pin steps back behind its heading (heading east: shown to the west)', () => {
    const shown = truckShownAt(pin, [pin], 90);
    expect(distanceM(shown, pin)).toBeGreaterThanOrEqual(TRUCK_PIN_CLEAR_M - 1);
    expect(shown.longitude).toBeLessThan(pin.longitude);
  });
  it('clears the nearest pin when several are close', () => {
    const other = metresNorth(30);
    const shown = truckShownAt(metresNorth(5), [pin, other], 0);
    expect(distanceM(shown, pin)).toBeGreaterThanOrEqual(TRUCK_PIN_CLEAR_M - 1);
    expect(distanceM(shown, other)).toBeGreaterThanOrEqual(TRUCK_PIN_CLEAR_M - 1);
  });
});
