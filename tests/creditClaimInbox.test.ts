import {
  REJECT_REASONS,
  checkConfirmAmount,
  groupClaimsByRestaurant,
  mayDecideClaims,
  rejectReasonText,
} from '@/lib/credit/claimInbox';
import type { ClaimResponse } from '@/models/credit';

const claim = (id: number, o: Partial<ClaimResponse> = {}): ClaimResponse => ({
  id, invoiceId: 10 + id, invoiceNumber: `INV-${id}`, agreementId: 3, outletId: 7, outletName: 'Indiranagar',
  restaurantName: 'Spice Co', amount: '5000.0000', method: 'UPI', reference: 'UTR1', paidOn: '2026-10-01',
  note: null, status: 'SUBMITTED', decisionNote: null, confirmedAmount: null, creditPaymentId: null,
  createdAt: '2026-10-02T05:00:00Z', decidedAt: null, ...o,
});

describe('groupClaimsByRestaurant', () => {
  it('groups by restaurant, keeping the server order of groups and of claims', () => {
    const groups = groupClaimsByRestaurant([
      claim(1, { restaurantName: 'Spice Co' }),
      claim(2, { restaurantName: 'Dosa House' }),
      claim(3, { restaurantName: 'Spice Co' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Spice Co', 'Dosa House']);
    expect(groups[0]!.claims.map((c) => c.id)).toEqual([1, 3]);
  });
  it('falls back to the outlet name, then a plain word', () => {
    const groups = groupClaimsByRestaurant([
      claim(1, { restaurantName: null, outletName: 'Koramangala' }),
      claim(2, { restaurantName: null, outletName: null }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Koramangala', 'A restaurant']);
  });
  it('is empty for nothing', () => {
    expect(groupClaimsByRestaurant([])).toEqual([]);
  });
});

describe('checkConfirmAmount', () => {
  it('accepts the claimed amount and sends nothing so the server caps it', () => {
    const r = checkConfirmAmount('5000.00', '5000.0000');
    expect(r).toEqual({ valid: true, amount: null, error: null });
  });
  it('accepts a lower amount and sends it', () => {
    expect(checkConfirmAmount('3000', '5000.0000')).toEqual({ valid: true, amount: '3000.00', error: null });
  });
  it('blocks an amount above the claim', () => {
    const r = checkConfirmAmount('5000.01', '5000.0000');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/more than/i);
  });
  it('blocks empty, zero and over-precise amounts', () => {
    expect(checkConfirmAmount('', '5000').valid).toBe(false);
    expect(checkConfirmAmount('0', '5000').valid).toBe(false);
    expect(checkConfirmAmount('10.123', '5000').valid).toBe(false);
  });
});

describe('rejectReasonText', () => {
  it('needs a reason', () => {
    expect(rejectReasonText(null, '')).toBeNull();
  });
  it('uses a quick reason as is', () => {
    expect(rejectReasonText('Not received', '')).toBe('Not received');
  });
  it('adds free text to a quick reason', () => {
    expect(rejectReasonText('Amount differs', 'only 4000 came')).toBe('Amount differs: only 4000 came');
  });
  it('Other needs at least 3 characters of its own', () => {
    expect(rejectReasonText('Other', 'ab')).toBeNull();
    expect(rejectReasonText('Other', ' abc ')).toBe('abc');
  });
  it('lists the quick reasons', () => {
    expect(REJECT_REASONS).toEqual(['Not received', 'Amount differs', 'Wrong supplier', 'Other']);
  });
});

describe('mayDecideClaims', () => {
  const store = { id: 5, supplierOrganizationId: 1 };
  it('allows CREDIT_COLLECT or CREDIT_MODIFY', () => {
    expect(mayDecideClaims((p) => p === 'CREDIT_COLLECT', store)).toBe(true);
    expect(mayDecideClaims((p) => p === 'CREDIT_MODIFY', store)).toBe(true);
  });
  it('refuses without either', () => {
    expect(mayDecideClaims((p) => p === 'CREDIT_VIEW', store)).toBe(false);
    expect(mayDecideClaims(() => true, null)).toBe(false);
  });
});
