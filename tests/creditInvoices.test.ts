import { isSettled, splitInvoices } from '@/lib/credit/invoices';
import type { CreditInvoice } from '@/models/credit';

const inv = (id: number, o: Partial<CreditInvoice>): CreditInvoice => ({
  id, invoiceNumber: `INV-${id}`, creditAgreementId: 1, supplierOrderId: null, status: 'ISSUED',
  amount: '100', paidAmount: '0', outstanding: '100', dueDate: null, overdueAfter: null,
  issuedAt: null, settledAt: null, ...o,
});

describe('splitInvoices', () => {
  it('classifies by dueState, not by amounts', () => {
    const { open, paid } = splitInvoices([
      inv(1, { dueState: 'PAID', outstanding: '50' }),
      inv(2, { dueState: 'DUE_LATER', outstanding: '0' }),
      inv(3, { dueState: 'WRITTEN_OFF', outstanding: '10' }),
    ]);
    expect(open.map((i) => i.id)).toEqual([2]);
    expect(paid.map((i) => i.id).sort()).toEqual([1, 3]);
  });

  it('falls back to status when dueState is absent', () => {
    expect(isSettled(inv(1, { status: 'PAID' }))).toBe(true);
    expect(isSettled(inv(2, { status: 'OVERDUE' }))).toBe(false);
  });

  it('orders open by urgency, then due date ascending', () => {
    const { open } = splitInvoices([
      inv(1, { dueState: 'DUE_LATER', dueDate: '2026-12-01' }),
      inv(2, { dueState: 'DUE_SOON', dueDate: '2026-10-09' }),
      inv(3, { dueState: 'OVERDUE', dueDate: '2026-09-20' }),
      inv(4, { dueState: 'OVERDUE', dueDate: '2026-09-10' }),
      inv(5, { dueState: 'DUE_TODAY', dueDate: '2026-10-05' }),
      inv(6, { dueState: 'IN_GRACE', dueDate: '2026-10-01' }),
    ]);
    expect(open.map((i) => i.id)).toEqual([4, 3, 6, 5, 2, 1]);
  });
});
