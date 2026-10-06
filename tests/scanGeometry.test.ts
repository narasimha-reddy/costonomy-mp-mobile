import { scanGeometry } from '@/lib/quickscan/scanGeometry';

describe('scanGeometry', () => {
  it('reproduces the reference on a 360 x 805 phone with a 35 dp status bar', () => {
    const g = scanGeometry(360, 805, 35);
    expect(g.window).toEqual({ left: 54, top: 146, size: 251 });
    expect(g.chipsTop).toBeCloseTo(428.5, 1);
    expect(g.linkTop).toBeCloseTo(517.5, 1);
  });

  it('keeps the window centred and in proportion on a taller phone', () => {
    const g = scanGeometry(411, 900, 40);
    expect(g.window.size).toBe(286);
    expect(g.window.left).toBe(Math.floor((411 - 286) / 2));
    expect(g.window.top).toBe(163);
  });

  it('never lets the window start under the header', () => {
    expect(scanGeometry(360, 500, 48).window.top).toBe(48 + 111);
  });

  it('caps the window on a wide screen', () => {
    expect(scanGeometry(900, 805, 0).window.size).toBe(300);
  });
});
