import {
  legsFor, truckLook, cssColor, viewportFor, lerpPoint, glideMs, shouldRefit, shouldRefitMoving, fitTargetFor, insidePadded,
  QUIET_MAP_STYLE, cameraFor, MIN_ZOOM, MAX_ZOOM, SINGLE_POINT_ZOOM, NEAR_DROP_M, chipIcon, chipSide, metersPerPixel, truckShownAt, TRUCK_PIN_CLEAR_PX, FIT_PADDING, edgeOf, REFIT_EDGE_GAP_MS,
  offsetPx, pinColumnPx, withDrawnTruck, GLIDE_FRAME_M, type PinSides, truckClearOfPinsM, TRUCK_PIN_CLEAR_M, distanceM,
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
    // Outline only: a filled 300 m ring covers the whole street-level view and washes the map grey-green.
    expect(s.circles).toEqual([{ center: drop, radiusM: 300, filled: false }]);
    expect(TrackLayout.geofenceArriveM).toBe(300);
  });

  it('reached: no line and the 50 m ring on the drop', () => {
    const s = legsFor({ mode: 'reached', truck, pickup: null, drop });
    expect(s.lines).toEqual([]);
    expect(s.circles).toEqual([{ center: drop, radiusM: 50, filled: true }]);
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
  it('sits above the pin unless the truck is drawn in its column within reach north of it', () => {
    const pin = { latitude: 12.96109, longitude: 77.63869 };
    const w = chipIcon('Restaurant').width;
    const mpp = metersPerPixel(pin.latitude, 15);
    expect(mpp).toBeGreaterThan(4);
    expect(mpp).toBeLessThan(5);
    const px = (x: number, y: number) => ({
      latitude: pin.latitude + (y * mpp) / 111_195,
      longitude: pin.longitude + (x * mpp) / (111_195 * Math.cos((pin.latitude * Math.PI) / 180)),
    });
    expect(chipSide(pin, w, null, 15)).toBe('above');
    expect(chipSide(pin, w, { latitude: 13.2, longitude: 77.6 }, 15)).toBe('above');
    // 36 px north (where a close truck is drawn): the chip goes below, away from it.
    expect(chipSide(pin, w, px(0, 36), 15)).toBe('below');
    expect(chipSide(pin, w, px(w / 2 + 10, 36), 15)).toBe('below'); // still over the wide chip's corner
    // South, far north, or beside the chip's column: above is clear.
    expect(chipSide(pin, w, px(0, -36), 15)).toBe('above');
    expect(chipSide(pin, w, px(0, 80), 15)).toBe('above');
    expect(chipSide(pin, w, px(pinColumnPx(w) + 1, 20), 15)).toBe('above');
    expect(chipSide(pin, w, px(0, 36), undefined)).toBe('above');
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

describe('truckShownAt (pixels at the map zoom)', () => {
  const pin = { latitude: 12.97, longitude: 77.59 };
  const spot = { at: pin, chipWidth: chipIcon('Restaurant').width };
  const at = (zoom: number, x: number, y: number) => {
    const mpp = metersPerPixel(pin.latitude, zoom);
    return { latitude: pin.latitude + (y * mpp) / 111_195, longitude: pin.longitude + (x * mpp) / (111_195 * Math.cos((pin.latitude * Math.PI) / 180)) };
  };
  it('leaves a truck that is clear of every pin where it is', () => {
    const t = at(16, 0, 60);
    expect(truckShownAt(t, [spot], 16, 0)).toBe(t);
    expect(truckShownAt(t, [], 16, 0)).toBe(t);
    const beside = at(16, pinColumnPx(spot.chipWidth) + 1, 0);
    expect(truckShownAt(beside, [spot], 16, 0)).toBe(beside);
  });
  it.each([15, 16, 17])('at zoom %i a truck in the pin column is drawn 36 px above or below it, on its own side, keeping its x', (zoom) => {
    const n = offsetPx(pin, truckShownAt(at(zoom, 5, 10), [spot], zoom, 0), zoom);
    expect(n.y).toBeCloseTo(TRUCK_PIN_CLEAR_PX, 3);
    expect(n.x).toBeCloseTo(5, 3);
    const s = offsetPx(pin, truckShownAt(at(zoom, -5, -10), [spot], zoom, 0), zoom);
    expect(s.y).toBeCloseTo(-TRUCK_PIN_CLEAR_PX, 3);
  });
  it('the clearance keeps the 44 px truck off the pin dot and its chip', () => {
    expect(TRUCK_PIN_CLEAR_PX - TrackLayout.truckSize / 2).toBeGreaterThanOrEqual(12); // pin dot radius 10, plus a gap
    expect(pinColumnPx(40)).toBeGreaterThanOrEqual(20 + TrackLayout.truckSize / 2);
  });
  it('a truck right on the pin is drawn behind its heading (heading north: below; heading south: above)', () => {
    expect(offsetPx(pin, truckShownAt(pin, [spot], 16, 0), 16).y).toBeLessThan(0);
    expect(offsetPx(pin, truckShownAt(pin, [spot], 16, 180), 16).y).toBeGreaterThan(0);
  });
  it('keeps the side it was drawn on while the fixes jitter round the pin, and forgets it once the truck leaves', () => {
    const sides: PinSides = {};
    expect(offsetPx(pin, truckShownAt(at(16, 0, -8), [spot], 16, 0, sides), 16).y).toBeLessThan(0);
    for (const [x, y] of [[0, 6], [3, 0], [-4, 12], [0, -3]]) {
      expect(offsetPx(pin, truckShownAt(at(16, x!, y!), [spot], 16, 0, sides), 16).y).toBeCloseTo(-TRUCK_PIN_CLEAR_PX, 3);
    }
    truckShownAt(at(16, 0, 200), [spot], 16, 0, sides);
    expect(offsetPx(pin, truckShownAt(at(16, 0, 6), [spot], 16, 0, sides), 16).y).toBeGreaterThan(0);
  });
  it('a truck drawn south of the pin whose fix lands just north of it stays south: it never glides across the pin', () => {
    // Live: arriving from the south, the reached fix was 4 px north of the pin and the truck slid through the pin to the north.
    const shown = truckShownAt(at(16, 0, 4), [spot], 16, 0, {}, at(16, 4, -61)); // y is north: drawn 61 px south
    expect(offsetPx(pin, shown, 16).y).toBeCloseTo(-TRUCK_PIN_CLEAR_PX, 3);
    expect(offsetPx(pin, truckShownAt(at(16, 0, -4), [spot], 16, 180, {}, at(16, 0, 80)), 16).y).toBeCloseTo(TRUCK_PIN_CLEAR_PX, 3);
  });
  it('without a zoom, or with an unreadable heading, never returns a position that is not a number', () => {
    expect(truckShownAt(pin, [spot], undefined, 0)).toBe(pin);
    const shown = truckShownAt(pin, [spot], 16, NaN);
    expect(Number.isFinite(shown.latitude)).toBe(true);
    expect(Number.isFinite(shown.longitude)).toBe(true);
  });
});

describe('truckClearOfPinsM (native map, unchanged)', () => {
  const pin = { latitude: 12.97, longitude: 77.59 };
  const metresNorth = (m: number) => ({ latitude: pin.latitude + m / 111_195, longitude: pin.longitude });
  it('leaves a clear truck, pushes a close one out to 60 m on its side, a truck on the pin behind its heading', () => {
    const t = metresNorth(100);
    expect(truckClearOfPinsM(t, [pin], 0)).toBe(t);
    const shown = truckClearOfPinsM(metresNorth(10), [pin], 0);
    expect(distanceM(shown, pin)).toBeGreaterThanOrEqual(TRUCK_PIN_CLEAR_M - 1);
    expect(shown.latitude).toBeGreaterThan(pin.latitude);
    expect(truckClearOfPinsM(pin, [pin], 90).longitude).toBeLessThan(pin.longitude);
    expect(Number.isFinite(truckClearOfPinsM(pin, [pin], NaN).latitude)).toBe(true);
  });
});

describe('withDrawnTruck', () => {
  const fix = { latitude: 12.97, longitude: 77.59 };
  const drop = { latitude: 12.99, longitude: 77.62 };
  const behind = { latitude: 12.965, longitude: 77.59 };
  it('frames where the truck is drawn and where it glides to, with the fix', () => {
    expect(withDrawnTruck([fix, drop], fix, [behind, null])).toEqual([fix, drop, behind]);
  });
  it('not when the fix itself is not framed, nor a drawn point far from it', () => {
    expect(withDrawnTruck([drop], fix, [behind])).toEqual([drop]);
    const far = { latitude: fix.latitude + (GLIDE_FRAME_M + 100) / 111_195, longitude: fix.longitude };
    expect(withDrawnTruck([fix, drop], fix, [far])).toEqual([fix, drop]);
  });
});

describe('truck clearance and framing (on-screen fixes)', () => {
  it('the fit padding leaves room for half the truck icon above and below, and at the sides', () => {
    const half = TrackLayout.truckSize / 2;
    expect(FIT_PADDING.bottom).toBeGreaterThanOrEqual(half + 26); // clear of Google's logo and attribution row
    expect(FIT_PADDING.top).toBeGreaterThan(half);
    expect(FIT_PADDING.left).toBeGreaterThan(half);
    expect(FIT_PADDING.right).toBeGreaterThan(half);
  });
  const view = { north: 13, south: 12, east: 78, west: 77 };
  it('edgeOf is true when any framed point is within 8% of the view edge or outside', () => {
    expect(edgeOf(view, [{ latitude: 12.5, longitude: 77.5 }])).toBe(false);
    expect(edgeOf(view, [{ latitude: 12.5, longitude: 77.5 }, { latitude: 12.03, longitude: 77.5 }])).toBe(true);
    expect(edgeOf(view, [{ latitude: 14, longitude: 77.5 }])).toBe(true);
  });
  it('a truck at the edge is refitted after a short gap, not the 8 s one', () => {
    const base = { now: 100_000, lastFitAt: 100_000 - REFIT_EDGE_GAP_MS - 1, outside: true, distNow: 1000, distAtFit: 1000 };
    expect(shouldRefit({ ...base, edge: true })).toBe(true);
    expect(shouldRefit({ ...base })).toBe(false);
    expect(shouldRefit({ ...base, edge: true, lastFitAt: 100_000 - 100 })).toBe(false);
  });
});
