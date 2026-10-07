import { haversineM, boundsFor, regionFor, mirrored, toLatLng } from '@/lib/delivery/mapGeometry';

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

  it('mirrored for bearing 180-360', () => {
    expect(mirrored(0)).toBe(false);
    expect(mirrored(90)).toBe(false);
    expect(mirrored(179.9)).toBe(false);
    expect(mirrored(180)).toBe(true);
    expect(mirrored(270)).toBe(true);
    expect(mirrored(359.9)).toBe(true);
    expect(mirrored(360)).toBe(false);
    expect(mirrored(null)).toBe(false);
    expect(mirrored('270')).toBe(true);
  });

  it('toLatLng converts the server decimal strings', () => {
    expect(toLatLng({ latitude: '12.97', longitude: '77.59', bearing: null, recordedAt: 'x' })).toEqual({ latitude: 12.97, longitude: 77.59 });
  });
});
