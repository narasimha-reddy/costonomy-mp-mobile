import { describeDeliveryDay, istDay, preferredDateFor } from '@/lib/delivery/deliveryDay';

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
});
