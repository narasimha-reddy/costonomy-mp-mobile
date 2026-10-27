import { DEFAULT_HOURS, fromCommonHours, toCommonHours } from '@/lib/org/operatingHours';

describe('trading hours between the store screen and common (D-208)', () => {
  it('writes one window on each chosen day, in week order, and leaves the other days out (closed)', () => {
    expect(toCommonHours({ days: ['FRIDAY', 'MONDAY', 'TUESDAY'], opensAt: '09:00', closesAt: '21:00' })).toEqual({
      mon: [['09:00', '21:00']],
      tue: [['09:00', '21:00']],
      fri: [['09:00', '21:00']],
    });
  });

  it('accepts short day names and ignores days it does not know', () => {
    expect(toCommonHours({ days: ['SAT', 'HOLIDAY'], opensAt: '10:00', closesAt: '18:00' })).toEqual({
      sat: [['10:00', '18:00']],
    });
  });

  it('keeps the unset 00:00 pair as it is, as the marketplace API does', () => {
    expect(toCommonHours({ days: ['SUNDAY'], opensAt: '00:00', closesAt: '00:00' })).toEqual({
      sun: [['00:00', '00:00']],
    });
  });

  it('reads common back: the open days and the first open day\'s first window', () => {
    expect(fromCommonHours({ wed: [['08:00', '20:00']], mon: [['07:30', '19:00'], ['20:00', '22:00']], sun: [] }))
      .toEqual({ days: ['MONDAY', 'WEDNESDAY'], opensAt: '07:30', closesAt: '19:00' });
  });

  it('round-trips what the screen saves', () => {
    const hours = { days: ['MONDAY', 'WEDNESDAY', 'SATURDAY'], opensAt: '06:00', closesAt: '14:30' };
    expect(fromCommonHours(toCommonHours(hours))).toEqual(hours);
  });

  it('shows the marketplace default for missing, empty or unreadable hours', () => {
    expect(fromCommonHours(null)).toEqual(DEFAULT_HOURS);
    expect(fromCommonHours({})).toEqual(DEFAULT_HOURS);
    expect(fromCommonHours({ mon: 'nine to five' })).toEqual(DEFAULT_HOURS);
    expect(fromCommonHours([['09:00', '17:00']])).toEqual(DEFAULT_HOURS);
  });

  it('reads the older {days, opensAt, closesAt} shape too', () => {
    expect(fromCommonHours({ days: ['tuesday', 'MONDAY'], opensAt: '11:00', closesAt: '23:00' }))
      .toEqual({ days: ['MONDAY', 'TUESDAY'], opensAt: '11:00', closesAt: '23:00' });
  });

  it('does not let a caller change the shared default', () => {
    const read = fromCommonHours(null);
    read.days.pop();
    expect(DEFAULT_HOURS.days).toHaveLength(7);
  });
});
