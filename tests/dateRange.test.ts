import {
  customRange,
  defaultRange,
  describeRange,
  formatMoment,
  formatMomentWithRecency,
  rangeFor,
  toQuery,
} from '@/utils/dateRange';

const NOW = new Date(2026, 8, 16, 14, 30); // 16 Sep 2026, local

describe('rangeFor', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    // "Last 7 days" on the 16th means the 10th through tonight — seven days a
    // person can count, not 168 hours back from 14:30.
    const week = rangeFor('week', NOW);
    expect(week.from.getDate()).toBe(10);
    expect(week.from.getHours()).toBe(0);
  });

  it('today is today, not the last 24 hours', () => {
    const today = rangeFor('today', NOW);
    expect(today.from.getDate()).toBe(16);
    expect(today.from.getHours()).toBe(0);
  });

  it('ends at the next midnight so today is included', () => {
    // An end of "now" drops an order placed two minutes ago on every refresh,
    // which reads as orders vanishing.
    const week = rangeFor('week', NOW);
    expect(week.to.getDate()).toBe(17);
    expect(week.to.getHours()).toBe(0);
    expect(week.to.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('defaults to a week', () => {
    expect(defaultRange(NOW).key).toBe('week');
  });
});

describe('customRange', () => {
  it('covers both ends inclusively', () => {
    const range = customRange(new Date(2026, 8, 1), new Date(2026, 8, 3));
    expect(range.from.getDate()).toBe(1);
    expect(range.to.getDate()).toBe(4);     // exclusive end of the 3rd
  });

  it('tolerates a backwards pair rather than returning nothing', () => {
    // Picking a start after an end is an ordering mistake, not a request for
    // an empty list.
    const range = customRange(new Date(2026, 8, 9), new Date(2026, 8, 2));
    expect(range.from.getDate()).toBe(2);
    expect(range.to.getDate()).toBe(10);
  });
});

describe('describeRange', () => {
  it('names a preset', () => {
    expect(describeRange(rangeFor('month', NOW))).toBe('Last 30 days');
  });

  it('shows the last included day for a custom range, not the exclusive end', () => {
    // The end is stored as the following midnight; showing it would label a
    // 1st–3rd range as "1 Sep – 4 Sep".
    const range = customRange(new Date(2026, 8, 1), new Date(2026, 8, 3));
    expect(describeRange(range)).not.toContain('4');
  });
});

describe('toQuery', () => {
  it('sends instants, because the API works in UTC', () => {
    const { from, to } = toQuery(rangeFor('today', NOW));
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(to).getTime()).toBeGreaterThan(new Date(from).getTime());
  });
});

describe('formatMoment', () => {
  const when = '2026-09-16T11:35:00';

  it('reads the way a person says it', () => {
    const text = formatMoment(when, new Date(2026, 8, 16, 11, 45));
    // The whole string, because the format is the requirement.
    expect(text).toBe('16th Sep 2026 at 11:35 AM (10 mins ago)');
  });

  it('is built rather than localised, so two phones agree', () => {
    // toLocaleTimeString gives "am" in one locale and "AM" in another, and
    // toLocaleDateString gives "Sept" where the format says "Sep".
    expect(formatMoment('2026-09-16T09:05:00')).toContain('9:05 AM');
    expect(formatMoment('2026-09-16T13:05:00')).toContain('1:05 PM');
    expect(formatMoment('2026-09-16T00:30:00')).toContain('12:30 AM');
    expect(formatMoment('2026-09-16T12:30:00')).toContain('12:30 PM');
    expect(formatMoment('2026-09-16T10:00:00')).toContain('Sep');
    expect(formatMoment('2026-09-16T10:00:00')).not.toContain('Sept');
  });

  it('gets the ordinal right, including the awkward ones', () => {
    expect(formatMoment('2026-09-01T10:00:00')).toContain('1st Sep');
    expect(formatMoment('2026-09-02T10:00:00')).toContain('2nd Sep');
    expect(formatMoment('2026-09-03T10:00:00')).toContain('3rd Sep');
    expect(formatMoment('2026-09-11T10:00:00')).toContain('11th Sep');
    expect(formatMoment('2026-09-12T10:00:00')).toContain('12th Sep');
    expect(formatMoment('2026-09-13T10:00:00')).toContain('13th Sep');
    expect(formatMoment('2026-09-21T10:00:00')).toContain('21st Sep');
    expect(formatMoment('2026-09-22T10:00:00')).toContain('22nd Sep');
  });

  it('says "just now" rather than counting forwards off a skewed clock', () => {
    // A device a few seconds ahead of the server must not produce "in 3 seconds".
    expect(formatMoment(when, new Date(2026, 8, 16, 11, 34, 50))).toContain('just now');
  });

  it('singularises', () => {
    expect(formatMoment(when, new Date(2026, 8, 16, 12, 35))).toContain('(1 hr ago)');
    expect(formatMoment(when, new Date(2026, 8, 17, 11, 35))).toContain('(1 day ago)');
  });

  it('returns a dash rather than "Invalid Date"', () => {
    expect(formatMoment(null)).toBe('—');
    expect(formatMoment('not a date')).toBe('—');
  });
});

describe('formatMomentWithRecency', () => {
  const when = '2026-09-15T19:34:00';

  it('gives the absolute moment in the house format', () => {
    expect(formatMomentWithRecency(when, new Date('2026-09-15T21:34:00')))
      .toContain('15th Sep 2026 at 7:34 PM');
  });

  it('adds how long ago while that still tells you something', () => {
    expect(formatMomentWithRecency(when, new Date('2026-09-15T21:34:00')))
      .toBe('15th Sep 2026 at 7:34 PM (2 hrs ago)');
  });

  // Past a day the date is the useful fact, and "(3 months ago)" on every row
  // says nothing new about any of them.
  it('drops it once the date is the more useful half', () => {
    expect(formatMomentWithRecency(when, new Date('2026-09-17T08:00:00')))
      .toBe('15th Sep 2026 at 7:34 PM');
  });

  it('keeps it right up to the day boundary', () => {
    expect(formatMomentWithRecency(when, new Date('2026-09-16T19:33:00')))
      .toContain('(');
    expect(formatMomentWithRecency(when, new Date('2026-09-16T19:35:00')))
      .not.toContain('(');
  });

  it('survives a missing or unparseable value', () => {
    expect(formatMomentWithRecency(null)).toBe('—');
    expect(formatMomentWithRecency('not a date')).toBe('—');
  });
});
