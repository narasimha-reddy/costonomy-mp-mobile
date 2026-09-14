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
