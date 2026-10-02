import {
  DeliveryMode,
  DeliveryStatus,
  SupplierOrderStatus,
  orderStatusFor,
  resolveStatus,
  unknownStatus,
} from '@/models/status';

describe('status registry', () => {
  it('resolves a known status', () => {
    expect(resolveStatus(SupplierOrderStatus, 'CONFIRMED')).toEqual({
      label: 'Confirmed',
      tone: 'success',
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
    ['DRAFT'], ['CONFIRMED'], ['PREPARING'], ['READY_FOR_PICKUP'],
    ['OUT_FOR_DELIVERY'], ['DELIVERED'], ['COMPLETED'], ['CANCELLED'],
  ])('knows %s', (code) => {
    expect(SupplierOrderStatus[code]).toBeDefined();
  });

  // ACCEPTED and RECEIVED were never sent. PENDING_ACCEPTANCE, PARTIALLY_ACCEPTED,
  // REJECTED and EXPIRED were, until D-091 removed the order acceptance that
  // produced them -- a chip for a state the server can no longer send is a label
  // waiting to be rendered for a status nobody will ever be in.
  it.each([
    ['ACCEPTED'], ['RECEIVED'],
    ['PENDING_ACCEPTANCE'], ['PARTIALLY_ACCEPTED'], ['REJECTED'], ['EXPIRED'],
  ])('has no entry for %s', (code) => {
    expect(SupplierOrderStatus[code]).toBeUndefined();
  });

  it.each([['PICKUP'], ['SUPPLIER_DELIVERY'], ['COSTONOMY_DELIVERY']])(
    'knows the delivery mode %s', (code) => {
      expect(DeliveryMode[code]).toBeDefined();
    });

  it('reads ready differently when the restaurant is collecting', () => {
    // The same status, two meanings: crates on a counter, or a van about to
    // leave. One label for both would make the kitchen guess which.
    expect(orderStatusFor('READY_FOR_PICKUP', 'PICKUP').label).toBe('Ready to collect');
    expect(orderStatusFor('READY_FOR_PICKUP', 'COSTONOMY_DELIVERY').label)
      .toBe('Ready for pickup');
  });

  it('degrades an unheard-of status rather than rendering an empty chip', () => {
    // Mobile releases lag the API, which is why the registry stays widened to
    // Record<string, …> after the satisfies check.
    expect(unknownStatus('SOMETHING_NEW').label).toBeTruthy();
  });
});
