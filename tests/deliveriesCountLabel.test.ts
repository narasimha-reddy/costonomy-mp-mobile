import { deliveriesLabel } from '@/lib/delivery/deliveriesLabel';
import type { RadarSummary } from '@/models/delivery';

const summary = (totalActive: number, pendingCheckInCount: number): RadarSummary => ({
  totalActive, pendingCheckInCount, atDoorCount: 0, approachingCount: 0, enRouteCount: 0, delayedCount: 0,
  requiresEscalationCount: 0,
});

describe('deliveriesLabel (Orders tab entry)', () => {
  it('says plain Deliveries when nothing is open or the count is unknown', () => {
    expect(deliveriesLabel(null)).toEqual({ text: 'Deliveries', accessibilityLabel: 'Deliveries' });
    expect(deliveriesLabel(summary(0, 0))).toEqual({ text: 'Deliveries', accessibilityLabel: 'Deliveries' });
  });

  it('never counts a delivered order waiting for check-in as active', () => {
    expect(deliveriesLabel(summary(2, 1))).toEqual({
      text: 'Deliveries · 1 active · 1 to check in',
      accessibilityLabel: 'Deliveries, 1 active, 1 to check in',
    });
  });

  it('only on the way', () => {
    expect(deliveriesLabel(summary(3, 0)).text).toBe('Deliveries · 3 active');
  });

  it('only waiting for check-in', () => {
    expect(deliveriesLabel(summary(1, 1))).toEqual({
      text: 'Deliveries · 1 to check in', accessibilityLabel: 'Deliveries, 1 to check in',
    });
  });
});
