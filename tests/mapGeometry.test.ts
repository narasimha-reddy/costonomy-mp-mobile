import {
  haversineM, boundsFor, regionFor, toLatLng, bearingBetween, headingFrom, shortestTurn, turnLerp, advanceHeading, MIN_HEADING_MOVE_M, type HeadingState,
} from '@/lib/delivery/mapGeometry';

describe('mapGeometry', () => {
  it('haversine 1 km within 1%', () => {
    // 0.008993 degrees of latitude is 1 km on the sphere (R = 6371 km).
    const m = haversineM({ latitude: 12.97, longitude: 77.59 }, { latitude: 12.97 + 0.008993, longitude: 77.59 });
    expect(Math.abs(m - 1000) / 1000).toBeLessThan(0.01);
    expect(haversineM({ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2 })).toBe(0);
  });

  it('regionFor pads 25% and clamps', () => {
    const a = { latitude: 12.0, longitude: 77.0 };
    const b = { latitude: 12.1, longitude: 77.2 };
    expect(boundsFor([a, b], 0.25)).toEqual({
      minLat: expect.closeTo(11.975, 6), maxLat: expect.closeTo(12.125, 6),
      minLng: expect.closeTo(76.95, 6), maxLng: expect.closeTo(77.25, 6),
    });
    const r = regionFor([a, b]);
    expect(r.latitude).toBeCloseTo(12.05, 6);
    expect(r.longitude).toBeCloseTo(77.1, 6);
    expect(r.latitudeDelta).toBeCloseTo(0.15, 6);
    expect(r.longitudeDelta).toBeCloseTo(0.3, 6);
    // One point, or two on top of each other: street level, never zero.
    expect(regionFor([a]).latitudeDelta).toBe(0.004);
    expect(regionFor([a, a]).longitudeDelta).toBe(0.004);
    // Far apart: capped.
    const far = regionFor([a, { latitude: 20, longitude: 90 }]);
    expect(far.latitudeDelta).toBe(0.3);
    expect(far.longitudeDelta).toBe(0.3);
  });

  it('bearingBetween: north 0, east 90, south 180, west 270', () => {
    const o = { latitude: 12.97, longitude: 77.59 };
    expect(bearingBetween(o, { latitude: 12.98, longitude: 77.59 })).toBeCloseTo(0, 3);
    expect(bearingBetween(o, { latitude: 12.97, longitude: 77.6 })).toBeCloseTo(90, 1);
    expect(bearingBetween(o, { latitude: 12.96, longitude: 77.59 })).toBeCloseTo(180, 3);
    expect(bearingBetween(o, { latitude: 12.97, longitude: 77.58 })).toBeCloseTo(270, 1);
    // North-east at this latitude: a little under 45 because a degree of longitude is shorter.
    const ne = bearingBetween(o, { latitude: 12.98, longitude: 77.6 });
    expect(ne).toBeGreaterThan(40);
    expect(ne).toBeLessThan(46);
  });

  it('headingFrom keeps the last heading for a move under 5 m or no previous fix', () => {
    const a = { latitude: 12.97, longitude: 77.59 };
    const east = { latitude: 12.97, longitude: 77.6 };
    expect(headingFrom(a, east, 0)).toBeCloseTo(90, 1);
    // ~2 m south: jitter, not a turn.
    expect(headingFrom(a, { latitude: 12.97 - 2 / 111195, longitude: 77.59 }, 90)).toBe(90);
    expect(headingFrom(null, east, 123)).toBe(123);
    expect(MIN_HEADING_MOVE_M).toBe(5);
  });

  it('shortestTurn and turnLerp turn the short way through north', () => {
    expect(shortestTurn(350, 10)).toBeCloseTo(20, 6);
    expect(shortestTurn(10, 350)).toBeCloseTo(-20, 6);
    expect(shortestTurn(0, 180)).toBeCloseTo(180, 6);
    expect(shortestTurn(90, 90)).toBe(0);
    expect(turnLerp(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(turnLerp(10, 350, 0.25)).toBeCloseTo(5, 6);
    expect(turnLerp(0, 90, 0.5)).toBeCloseTo(45, 6);
    expect(turnLerp(270, 90, 1)).toBeCloseTo(90, 6);
    expect(turnLerp(0, 90, 0)).toBe(0);
  });

  it('advanceHeading: the API bearing wins, else the move since the last counted fix, standstill keeps it', () => {
    const fix = (lat: number, lng: number, bearing: string | null = null) =>
      ({ latitude: String(lat), longitude: String(lng), bearing, recordedAt: 'x' });
    let s = advanceHeading({ anchor: null, heading: 0 }, fix(12.97, 77.59));
    expect(s.heading).toBe(0);
    s = advanceHeading(s, fix(12.97, 77.6));
    expect(s.heading).toBeCloseTo(90, 1);
    // Standing at the pickup: the same point again, and a 1 m wobble, keep facing east.
    s = advanceHeading(s, fix(12.97, 77.6));
    s = advanceHeading(s, fix(12.97 + 1 / 111195, 77.6));
    expect(s.heading).toBeCloseTo(90, 1);
    // The provider's bearing is used as sent.
    s = advanceHeading(s, fix(12.97, 77.6, '200.5'));
    expect(s.heading).toBe(200.5);
    s = advanceHeading(s, fix(12.97, 77.6, '-90'));
    expect(s.heading).toBe(270);
    // Unreadable bearing: computed from the move instead (north).
    s = advanceHeading(s, fix(12.98, 77.6, 'abc'));
    expect(s.heading).toBeCloseTo(0, 3);
  });

  it('advanceHeading: a slow crawl of 2 m steps turns the truck once it adds up to 5 m', () => {
    const step = 2 / 111195;
    const fix = (lat: number) => ({ latitude: String(lat), longitude: '77.6', bearing: null, recordedAt: 'x' });
    let s: HeadingState = { anchor: { latitude: 12.97, longitude: 77.6 }, heading: 90 };
    s = advanceHeading(s, fix(12.97 + step));
    s = advanceHeading(s, fix(12.97 + 2 * step));
    expect(s.heading).toBe(90);
    s = advanceHeading(s, fix(12.97 + 3 * step));
    expect(s.heading).toBeCloseTo(0, 3);
  });

  it('toLatLng converts the server decimal strings', () => {
    expect(toLatLng({ latitude: '12.97', longitude: '77.59', bearing: null, recordedAt: 'x' })).toEqual({ latitude: 12.97, longitude: 77.59 });
  });
});
