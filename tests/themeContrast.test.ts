import { Colors } from '@/theme';

/** WCAG 2.x contrast ratio of a foreground over a background (alpha ignored: pass opaque colours). */
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function ratio(fg: string, bg: string): number {
  const [lf, lb] = [luminance(fg), luminance(bg)];
  return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
}

describe('theme contrast (restyle tokens)', () => {
  it('header text meets 4.5', () => {
    expect(ratio(Colors.onTrackHeader, Colors.trackHeader)).toBeGreaterThanOrEqual(4.5);
  });
  it('pill text meets 4.5', () => {
    expect(ratio(Colors.onTrackHeader, Colors.trackHeaderPill)).toBeGreaterThanOrEqual(4.5);
  });
  it('orange text on white meets 4.5', () => {
    expect(ratio(Colors.primaryDark, Colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it('secondary text on white meets 4.5', () => {
    expect(ratio(Colors.textSecondary, Colors.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
