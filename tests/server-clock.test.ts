import {
  __resetServerClock,
  isClockSynced,
  secondsUntil,
  serverNow,
  syncFromResponse,
} from '@/lib/server-clock';

describe('server clock', () => {
  beforeEach(() => {
    __resetServerClock();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back to the device clock before any sync', () => {
    jest.setSystemTime(new Date('2026-09-14T10:00:00Z'));
    expect(isClockSynced()).toBe(false);
    expect(serverNow()).toBe(Date.parse('2026-09-14T10:00:00Z'));
  });

  it('corrects a device clock that is running fast', () => {
    // Device thinks it is 10:02; the server says 10:00. A countdown driven by
    // the raw device clock would show this order as 2 minutes more expired
    // than it is.
    jest.setSystemTime(new Date('2026-09-14T10:02:00Z'));
    const startedAt = Date.now();
    syncFromResponse('Sun, 14 Sep 2026 10:00:00 GMT', startedAt);

    expect(isClockSynced()).toBe(true);
    expect(serverNow()).toBe(Date.parse('2026-09-14T10:00:00Z'));
  });

  it('corrects a device clock that is running slow', () => {
    jest.setSystemTime(new Date('2026-09-14T09:58:00Z'));
    syncFromResponse('Sun, 14 Sep 2026 10:00:00 GMT', Date.now());
    expect(serverNow()).toBe(Date.parse('2026-09-14T10:00:00Z'));
  });

  it('discounts half the round trip so latency does not read as drift', () => {
    jest.setSystemTime(new Date('2026-09-14T10:00:00Z'));
    const startedAt = Date.now();
    // The response took 4s to come back; the server's timestamp was written
    // roughly 2s ago, so "now" on the server is ~2s later than it claims.
    jest.setSystemTime(new Date('2026-09-14T10:00:04Z'));
    syncFromResponse('Sun, 14 Sep 2026 10:00:00 GMT', startedAt);

    expect(serverNow()).toBe(Date.parse('2026-09-14T10:00:02Z'));
  });

  it('ignores a missing or unparseable Date header', () => {
    jest.setSystemTime(new Date('2026-09-14T10:00:00Z'));
    syncFromResponse(null, Date.now());
    syncFromResponse('not a date', Date.now());

    expect(isClockSynced()).toBe(false);
    expect(serverNow()).toBe(Date.parse('2026-09-14T10:00:00Z'));
  });

  describe('secondsUntil', () => {
    it('counts down against the corrected clock, not the device clock', () => {
      // Device is 30s fast. The deadline is 60s away on the server, so a
      // countdown must read 60 — not the 30 the device clock would give.
      jest.setSystemTime(new Date('2026-09-14T10:00:30Z'));
      syncFromResponse('Sun, 14 Sep 2026 10:00:00 GMT', Date.now());

      expect(secondsUntil('2026-09-14T10:01:00Z')).toBe(60);
    });

    it('never returns a negative value', () => {
      jest.setSystemTime(new Date('2026-09-14T10:05:00Z'));
      expect(secondsUntil('2026-09-14T10:00:00Z')).toBe(0);
    });

    it('returns 0 for a missing or unparseable deadline', () => {
      jest.setSystemTime(new Date('2026-09-14T10:00:00Z'));
      expect(secondsUntil(null)).toBe(0);
      expect(secondsUntil(undefined)).toBe(0);
      expect(secondsUntil('whenever')).toBe(0);
    });
  });
});
