import {
  dayChoices, deliverByHoursFor, deliverByLabel, describeDeliveryDay, istDay, istInstant, MAX_DAYS_AHEAD,
  preferredDateFor,
} from '@/lib/delivery/deliveryDay';

describe('delivery day', () => {
  it("uses India's date, not UTC's, so 'today' at 2am in India is not yesterday", () => {
    // 2026-10-05 02:00 in India is 2026-10-04 20:30 UTC.
    const twoAmIst = Date.UTC(2026, 9, 4, 20, 30);
    expect(new Date(twoAmIst).toISOString().slice(0, 10)).toBe('2026-10-04');
    expect(istDay(0, twoAmIst)).toBe('2026-10-05');
    expect(istDay(2, twoAmIst)).toBe('2026-10-07');
  });

  it('sends nothing for immediate and a date otherwise', () => {
    const now = Date.UTC(2026, 9, 5, 6, 0);
    expect(preferredDateFor(null, now)).toBeUndefined();
    expect(preferredDateFor(1, now)).toBe('2026-10-06');
  });

  it('describes no day as immediate', () => {
    expect(describeDeliveryDay(null)).toBe('Immediate');
    expect(describeDeliveryDay('2026-10-06')).toContain('6');
  });

  it('offers every day to the furthest the server accepts, with Today and Tomorrow named', () => {
    const days = dayChoices(Date.UTC(2026, 9, 5, 6, 0));
    expect(days).toHaveLength(MAX_DAYS_AHEAD + 1);
    expect(days[0]?.label).toBe('Today');
    expect(days[1]?.label).toBe('Tomorrow');
    expect(days[30]?.offset).toBe(30);
  });

  it("turns 'by 6 am' on a day into the right instant (6:00 in India is 00:30 UTC)", () => {
    expect(istInstant('2026-10-06', 6)).toBe('2026-10-06T00:30:00.000Z');
    expect(istInstant('2026-10-06', 16)).toBe('2026-10-06T10:30:00.000Z');
  });

  it("offers only the hours still ahead today (India's clock), all of them on another day", () => {
    const tenAmIst = Date.UTC(2026, 9, 5, 4, 30);
    expect(deliverByHoursFor(0, tenAmIst)).toEqual([12, 16]);
    expect(deliverByHoursFor(1, tenAmIst)).toEqual([6, 8, 12, 16]);
    expect(deliverByLabel(6)).toBe('By 6 am');
    expect(deliverByLabel(12)).toBe('By noon');
    expect(deliverByLabel(16)).toBe('By 4 pm');
  });
});
