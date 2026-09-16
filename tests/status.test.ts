import {
  DeliveryStatus,
  SupplierOrderStatus,
  resolveStatus,
  unknownStatus,
} from '@/models/status';

describe('status registry', () => {
  it('resolves a known status', () => {
    expect(resolveStatus(SupplierOrderStatus, 'PENDING_ACCEPTANCE')).toEqual({
      label: 'Awaiting supplier',
      tone: 'pending',
    });
  });

  it('keeps rejection and timeout visually distinct', () => {
    // Rule 11: explicit rejection and timeout are separate business outcomes
    // and must not collapse into one chip.
    const rejected = resolveStatus(SupplierOrderStatus, 'REJECTED');
    const expired = resolveStatus(SupplierOrderStatus, 'EXPIRED');
    expect(rejected.label).not.toBe(expired.label);
  });

  it('hides provider selection behind one restaurant-facing label', () => {
    // Guardrail 8 / doc 06 §4: delivery bidding is internal. Every pre-assignment
    // state must read the same to the restaurant.
    expect(DeliveryStatus.DELIVERY_REQUESTED?.label).toBe('Finding a delivery partner');
    expect(DeliveryStatus.QUOTE_RECEIVED?.label).toBe('Finding a delivery partner');
  });

  it('degrades an unknown status to readable copy', () => {
    // Mobile releases lag the API, so a new backend state must still render.
    expect(unknownStatus('AWAITING_SOMETHING_NEW')).toEqual({
      label: 'Awaiting something new',
      tone: 'neutral',
    });
    expect(resolveStatus(SupplierOrderStatus, 'BRAND_NEW_STATE').label).toBe('Brand new state');
  });

  it('handles a null status without throwing', () => {
    expect(resolveStatus(SupplierOrderStatus, null).label).toBe('Unknown');
  });
});

describe('status spellings match the server', () => {
  // These exist because they did not hold. The app declared an accepted order
  // as ACCEPTED and a received one as RECEIVED; the server has only ever sent
  // CONFIRMED and COMPLETED. Every comparison type-checked and every one was
  // false, which is how the supplier's "Start preparing" button came to be
  // unreachable. The `satisfies` guard in models/status.ts now makes a wrong
  // key a compile error; these assert the right ones are actually present.
  it.each([
    ['DRAFT'], ['PENDING_ACCEPTANCE'], ['CONFIRMED'], ['PARTIALLY_ACCEPTED'],
    ['PREPARING'], ['READY_FOR_PICKUP'], ['OUT_FOR_DELIVERY'], ['DELIVERED'],
    ['COMPLETED'], ['REJECTED'], ['EXPIRED'], ['CANCELLED'],
  ])('knows %s', (code) => {
    expect(SupplierOrderStatus[code]).toBeDefined();
  });

  it.each([['ACCEPTED'], ['RECEIVED']])('has no entry for the invented %s', (code) => {
    expect(SupplierOrderStatus[code]).toBeUndefined();
  });

  it('degrades an unheard-of status rather than rendering an empty chip', () => {
    // Mobile releases lag the API, which is why the registry stays widened to
    // Record<string, …> after the satisfies check.
    expect(unknownStatus('SOMETHING_NEW').label).toBeTruthy();
  });
});
