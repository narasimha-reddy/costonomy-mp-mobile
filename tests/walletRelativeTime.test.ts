import { historyTime } from '@/lib/wallet/relativeTime';

// 3 October 2026, 17:30 in India.
const NOW = new Date('2026-10-03T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('historyTime', () => {
  it('says "Just now" under a minute, and for a clock slightly ahead', () => {
    expect(historyTime(ago(0), NOW)).toBe('Just now');
    expect(historyTime(ago(59_999), NOW)).toBe('Just now');
    expect(historyTime(ago(-5 * MIN), NOW)).toBe('Just now');
  });

  it('counts minutes, singular and plural', () => {
    expect(historyTime(ago(MIN), NOW)).toBe('1 minute ago');
    expect(historyTime(ago(12 * MIN + 5_000), NOW)).toBe('12 minutes ago');
    expect(historyTime(ago(59 * MIN + 59_000), NOW)).toBe('59 minutes ago');
  });

  it('counts hours below a day', () => {
    expect(historyTime(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(historyTime(ago(4 * HOUR + 10 * MIN), NOW)).toBe('4 hours ago');
    expect(historyTime(ago(23 * HOUR + 59 * MIN), NOW)).toBe('23 hours ago');
  });

  it('counts days below a week', () => {
    expect(historyTime(ago(DAY), NOW)).toBe('1 day ago');
    expect(historyTime(ago(3 * DAY + HOUR), NOW)).toBe('3 days ago');
    expect(historyTime(ago(7 * DAY - MIN), NOW)).toBe('6 days ago');
  });

  it('is the date from a week on, with "Sept" and no year in the same year', () => {
    expect(historyTime('2026-09-25T05:00:00Z', NOW)).toBe('25 Sept');
    expect(historyTime('2026-01-05T05:00:00Z', NOW)).toBe('5 Jan');
    expect(historyTime(ago(7 * DAY), NOW)).toBe('26 Sept');
  });

  it('adds the year for another year', () => {
    expect(historyTime('2025-09-30T05:00:00Z', NOW)).toBe('30 Sept 2025');
    expect(historyTime('2025-12-31T05:00:00Z', NOW)).toBe('31 Dec 2025');
  });

  it('reads the date and the year in India time', () => {
    // 20:00 UTC on 30 Sept is 01:30 on 1 Oct in India.
    expect(historyTime('2026-09-30T20:00:00Z', new Date('2026-10-20T00:00:00Z'))).toBe('1 Oct');
    // 31 Dec 2025, 19:00 UTC is already 1 Jan 2026 in India: the same year as a 2026 "now".
    expect(historyTime('2025-12-31T19:00:00Z', new Date('2026-03-01T00:00:00Z'))).toBe('1 Jan');
  });

  it('is empty for nothing or for something that is not a date', () => {
    expect(historyTime(null, NOW)).toBe('');
    expect(historyTime(undefined, NOW)).toBe('');
    expect(historyTime('', NOW)).toBe('');
    expect(historyTime('yesterday-ish', NOW)).toBe('');
  });
});
