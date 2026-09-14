import { countdownLevel } from '@/theme/motion';

describe('countdownLevel', () => {
  const SLA = 60;

  it('is calm in the first half of the window', () => {
    expect(countdownLevel(60, SLA)).toBe('calm');
    expect(countdownLevel(31, SLA)).toBe('calm');
  });

  it('warns from halfway', () => {
    expect(countdownLevel(30, SLA)).toBe('warn');
    expect(countdownLevel(13, SLA)).toBe('warn');
  });

  it('goes critical near the deadline', () => {
    // 20% of 60s is 12s, which is above the 10s floor, so 12s is critical.
    expect(countdownLevel(12, SLA)).toBe('critical');
    expect(countdownLevel(1, SLA)).toBe('critical');
  });

  it('is expired at and past zero', () => {
    expect(countdownLevel(0, SLA)).toBe('expired');
    expect(countdownLevel(-5, SLA)).toBe('expired');
  });

  it('scales thresholds to a store-configured SLA, not a fixed 60s', () => {
    // The SLA is configurable per supplier store (doc 01 §12, rule 9), so a
    // 300s window must not spend its last 4 minutes showing "critical".
    expect(countdownLevel(200, 300)).toBe('calm');
    expect(countdownLevel(120, 300)).toBe('warn');
    expect(countdownLevel(60, 300)).toBe('critical');
  });

  it('keeps a 10s critical floor on very short windows', () => {
    // 20% of 20s is 4s, but a supplier with 8s left is unambiguously critical.
    expect(countdownLevel(8, 20)).toBe('critical');
  });

  it('treats a nonsensical window as critical rather than calm', () => {
    // Failing safe: a missing/zero SLA must not render as "plenty of time".
    expect(countdownLevel(30, 0)).toBe('critical');
  });
});
