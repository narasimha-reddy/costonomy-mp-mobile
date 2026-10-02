import { destinationFor } from '@/lib/notifications/destination';
import type { AppNotification } from '@/models/notification';

function note(over: Partial<AppNotification>): AppNotification {
  return {
    id: 1,
    category: 'ORDERS',
    eventType: 'X',
    title: 't',
    body: null,
    targetType: null,
    audience: null,
    targetId: 7,
    critical: false,
    read: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const SUPPLIER = 'SUPPLIER_STORE';
const OUTLET = 'OUTLET';

const routes: [string, string | null, string | null][] = [
  // targetType, supplier route, restaurant route
  ['SUPPLIER_ORDER', '/supplier/orders/7', '/restaurant/orders/7'],
  ['DELIVERY', '/supplier/orders/7', '/restaurant/tracking/7'],
  ['DISPUTE', '/supplier/orders/7', '/restaurant/dispute/7'],
  ['CREDIT_AGREEMENT', '/supplier/credit/7', '/restaurant/credit/7'],
  ['PROCUREMENT', null, '/restaurant/checkout/7'],
  ['INTENT', '/supplier/requests/7', '/restaurant/requests/7'],
  ['CHAT_THREAD', '/chat/7', '/chat/7'],
];

describe('destinationFor', () => {
  it.each(routes)('%s opens the right screen for each audience', (targetType, sup, rest) => {
    expect(destinationFor(note({ targetType, audience: SUPPLIER }))).toBe(sup);
    expect(destinationFor(note({ targetType, audience: OUTLET }))).toBe(rest);
  });

  it.each(routes)('%s with no targetId goes nowhere', (targetType) => {
    expect(destinationFor(note({ targetType, audience: SUPPLIER, targetId: null }))).toBeNull();
    expect(destinationFor(note({ targetType, audience: OUTLET, targetId: null }))).toBeNull();
  });

  it('returns null for an unknown or missing target type', () => {
    expect(destinationFor(note({ targetType: 'SOMETHING_NEW', audience: OUTLET }))).toBeNull();
    expect(destinationFor(note({ targetType: null, audience: SUPPLIER }))).toBeNull();
  });

  it('never sends a supplier to a restaurant route, or the reverse', () => {
    for (const [targetType] of routes) {
      const s = destinationFor(note({ targetType, audience: SUPPLIER }));
      const r = destinationFor(note({ targetType, audience: OUTLET }));
      if (s) expect(s.startsWith('/restaurant')).toBe(false);
      if (r) expect(r.startsWith('/supplier')).toBe(false);
    }
  });
});
