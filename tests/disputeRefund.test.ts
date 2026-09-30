import { isAmount, refundCopy } from '@/lib/disputes/refundCopy';
import { isDefinitiveFailure } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { entryLabel, withdrawalProgress } from '@/lib/wallet/entryCopy';
import type { DisputeRefund, DisputeRefundStatus } from '@/models/trust';
import type { WalletEntry } from '@/models/wallet';

const DUE = '2026-09-29T10:00:00Z';
const BEFORE = Date.parse('2026-09-28T10:00:00Z');
const AFTER = Date.parse('2026-09-29T10:00:01Z');

function refund(status: DisputeRefundStatus, extra: Partial<DisputeRefund> = {}): DisputeRefund {
  return {
    id: 1, disputeId: 2, supplierOrderId: 3, outletId: 4, supplierStoreId: 5,
    amount: '500.00', reason: null, status, requestedAt: '2026-09-27T10:00:00Z',
    supplierAnswerBy: DUE, supplierNote: null, supplierDecidedAt: null,
    opsNote: null, opsDecidedAt: null, refundId: null, ...extra,
  };
}

describe('refundCopy', () => {
  it('asks the supplier to answer, and says whose money it is', () => {
    const copy = refundCopy(refund('REQUESTED'), 'supplier', BEFORE);
    expect(copy.actionable).toBe(true);
    expect(copy.detail).toContain('taken from your payout');
  });

  it('lets the supplier still answer after 48 hours, marked urgent', () => {
    const copy = refundCopy(refund('REQUESTED'), 'supplier', AFTER);
    expect(copy.actionable).toBe(true);
    expect(copy.tone).toBe('danger');
  });

  it('tells the restaurant who decides once the supplier is past their window', () => {
    expect(refundCopy(refund('REQUESTED'), 'restaurant', BEFORE).label).toBe('Waiting for the supplier');
    expect(refundCopy(refund('REQUESTED'), 'restaurant', AFTER).label).toContain('team');
  });

  it('never offers the restaurant an action: it asks, it does not decide', () => {
    for (const status of ['REQUESTED', 'APPROVED', 'DECLINED', 'OPS_APPROVED', 'OPS_DECLINED'] as const) {
      expect(refundCopy(refund(status), 'restaurant', BEFORE).actionable).toBe(false);
    }
  });

  it('gives the supplier nothing to do once anyone has decided', () => {
    for (const status of ['APPROVED', 'DECLINED', 'OPS_APPROVED', 'OPS_DECLINED'] as const) {
      expect(refundCopy(refund(status), 'supplier', AFTER).actionable).toBe(false);
    }
  });

  it('says an operations approval still comes out of the supplier payout', () => {
    expect(refundCopy(refund('OPS_APPROVED'), 'supplier', AFTER).detail).toContain('taken from your payout');
    expect(refundCopy(refund('OPS_DECLINED'), 'supplier', AFTER).detail).toContain('Nothing is taken');
  });

  it('quotes the reason given, and says approved money is in the wallet', () => {
    expect(refundCopy(refund('DECLINED', { supplierNote: 'Delivered as ordered' }), 'restaurant', BEFORE).detail)
      .toContain('“Delivered as ordered”');
    expect(refundCopy(refund('APPROVED'), 'restaurant', BEFORE).detail).toContain('added to your wallet');
  });
});

describe('isAmount', () => {
  it('accepts rupees with up to two decimals', () => {
    expect(isAmount('500')).toBe(true);
    expect(isAmount('500.5')).toBe(true);
    expect(isAmount(' 3960.00 ')).toBe(true);
  });

  it('refuses nothing, zero, negatives, three decimals and words', () => {
    for (const text of ['', '0', '0.00', '-5', '10.001', 'ten', '1e3', '₹500']) {
      expect(isAmount(text)).toBe(false);
    }
  });
});

describe('isDefinitiveFailure', () => {
  const error = (status: number, code = 'VALIDATION_ERROR') => new ApiError({ status, code, message: 'x' });

  it('drops the key after a refusal: the server marked it failed and will not retry it', () => {
    expect(isDefinitiveFailure(error(400))).toBe(true);
    expect(isDefinitiveFailure(error(409, 'REFUND_ALREADY_REQUESTED'))).toBe(true);
  });

  it('keeps it whenever the outcome is unknown, so a retry cannot be a second refund', () => {
    expect(isDefinitiveFailure(error(409, 'IDEMPOTENT_REQUEST_IN_PROGRESS'))).toBe(false);
    expect(isDefinitiveFailure(error(429, 'RATE_LIMITED'))).toBe(false);
    expect(isDefinitiveFailure(error(503, 'PROVIDER_UNAVAILABLE'))).toBe(false);
    expect(isDefinitiveFailure(new TypeError('Network request failed'))).toBe(false);
  });
});

describe('wallet statement', () => {
  const entry = (extra: Partial<WalletEntry>): WalletEntry => ({
    id: 1, direction: 'CREDIT', kind: 'REFUND', amount: '100.00', balanceAfter: '100.00',
    supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-27T10:00:00Z', ...extra,
  });

  it('names each kind of movement', () => {
    expect(entryLabel(entry({ kind: 'REFUND' }))).toBe('Refund');
    expect(entryLabel(entry({ kind: 'WITHDRAWAL', direction: 'DEBIT' }))).toContain('card');
    expect(entryLabel(entry({ kind: 'ORDER_PAYMENT', direction: 'DEBIT' }))).toBe('Paid for an order');
  });

  it("shows a withdrawal's progress, and says who has one that could not finish", () => {
    expect(withdrawalProgress(entry({ kind: 'WITHDRAWAL', refundStatus: 'PROCESSING' }))?.label).toBe('On its way');
    expect(withdrawalProgress(entry({ kind: 'WITHDRAWAL', refundStatus: 'COMPLETED' }))?.tone).toBe('success');
    expect(withdrawalProgress(entry({ kind: 'WITHDRAWAL', refundStatus: 'NEEDS_REVIEW' }))?.label).toContain('checking');
    expect(withdrawalProgress(entry({ kind: 'REFUND' }))).toBeNull();
  });
});

describe('formatDeadline and categoryLabel', () => {
  it('shows a deadline two days away without calling it "just now"', () => {
    const { formatDeadline } = jest.requireActual('@/utils/dateRange');
    const text: string = formatDeadline(new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString());
    expect(text).not.toContain('just now');
    expect(text).toMatch(/\d{4} at \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('names categories as the raise screen does', () => {
    const { categoryLabel } = jest.requireActual('@/lib/disputes/categories');
    expect(categoryLabel('QUALITY')).toBe('Quality');
    expect(categoryLabel('INCORRECT_INVOICE')).toBe('Invoice is wrong');
    expect(categoryLabel('SOMETHING_NEW')).toBe('Something new');
  });
});

describe('paymentStatusLabel', () => {
  it("says where the money is, in the restaurant's words", () => {
    const { paymentStatusLabel } = jest.requireActual('@/lib/payments/statusLabel');
    expect(paymentStatusLabel('AUTHORIZED')).toContain('Held');
    expect(paymentStatusLabel('CAPTURED')).toBe('Paid');
    expect(paymentStatusLabel('PAID')).toBe('Paid from wallet');
    // Only a card's released hold is "not charged" (D-109); see paymentCopy.test.ts.
    expect(paymentStatusLabel('RELEASED', 'card')).toContain('not charged');
    expect(paymentStatusLabel('RELEASED')).toBe('Released');
    expect(paymentStatusLabel('ON_CREDIT')).toBe('On credit');
    expect(paymentStatusLabel('SOMETHING_NEW')).toBe('Payment status unavailable');
  });
});
