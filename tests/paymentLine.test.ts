import { paymentLine } from '@/lib/payments/paymentLine';

const base = {
  status: 'PREPARING',
  paymentMethod: 'PREPAID' as const,
  paymentStatus: 'CAPTURED' as string | null,
  totalAmount: '1180.00',
  acceptedAmount: null as string | null,
};
const line = (o: object, credit?: object) => paymentLine({ ...base, ...o } as never, credit as never);

describe('paymentLine', () => {
  it('PREPAID draft, unpaid: To pay', () => {
    expect(line({ status: 'DRAFT', paymentStatus: 'PENDING' })).toMatchObject({ label: 'To pay', barLabel: 'To pay' });
    expect(line({ status: 'DRAFT', paymentStatus: null }).barLabel).toBe('To pay');
  });
  it('PREPAID captured or authorized: Paid / You paid', () => {
    for (const paymentStatus of ['CAPTURED', 'AUTHORIZED']) {
      expect(line({ paymentStatus })).toMatchObject({ label: 'Paid', barLabel: 'You paid' });
    }
  });
  it('PREPAID other statuses use the status copy', () => {
    expect(line({ paymentStatus: 'RETURNING' })).toMatchObject({ label: 'Refund on its way', barLabel: 'Refund on its way' });
    expect(line({ paymentStatus: 'FULLY_REFUNDED' }).label).toBe('Refunded');
    expect(line({ paymentStatus: 'RELEASED' }).label).toBe('Released');
  });
  it('WALLET debited: Paid from wallet / You paid', () => {
    for (const paymentStatus of ['PAID', 'CAPTURED']) {
      expect(line({ paymentMethod: 'WALLET', paymentStatus })).toMatchObject({ label: 'Paid from wallet', barLabel: 'You paid' });
    }
    expect(line({ paymentMethod: 'WALLET', paymentStatus: 'REFUNDED' }).label).toBe('Refunded');
  });
  it('a credit order is never Paid until settled', () => {
    const credit = { paymentMethod: 'CREDIT', paymentStatus: 'ON_CREDIT', status: 'COMPLETED' };
    for (const extra of [{}, { creditDueDate: '2026-10-20' }, { creditDueDate: null, creditSettledAt: null }]) {
      const r = line({ ...credit, ...extra });
      expect(r.barLabel).toBe('On credit');
      expect(r.label).not.toMatch(/^Paid/);
      expect(r.barLabel).not.toMatch(/paid/i);
    }
  });
  it('CREDIT with a due date and not settled: On credit, due {date}', () => {
    expect(line({ paymentMethod: 'CREDIT', creditDueDate: '2026-10-20' })).toMatchObject({
      label: 'Due 20th Oct 2026', summary: 'On credit, due 20th Oct 2026', barLabel: 'On credit',
    });
  });
  it('CREDIT settled: Paid on {date} / Paid on credit', () => {
    expect(line({ paymentMethod: 'CREDIT', creditDueDate: '2026-10-20', creditSettledAt: '2026-10-12T08:00:00Z' })).toMatchObject({
      label: 'Paid on 12th Oct 2026', barLabel: 'Paid on credit',
    });
  });
  it('CREDIT without dates (no invoice yet, or an older API): On credit', () => {
    expect(line({ paymentMethod: 'CREDIT', paymentStatus: null })).toMatchObject({ label: 'On credit', barLabel: 'On credit' });
    expect(line({ paymentMethod: 'CREDIT', creditDueDate: 'garbage' }).label).toBe('On credit');
  });
  it('settled with an unreadable date still says Paid on credit', () => {
    expect(line({ paymentMethod: 'CREDIT', creditSettledAt: 'garbage' }).label).toBe('Paid on credit');
  });
  it('the credit argument overrides the order fields', () => {
    expect(line({ paymentMethod: 'CREDIT' }, { creditDueDate: '2026-11-01' }).label).toBe('Due 1st Nov 2026');
  });
  it('no method: Total', () => {
    expect(line({ paymentMethod: null })).toMatchObject({ label: 'Total', barLabel: 'Total' });
  });
  it('amount is a server field: accepted once completed, else the total', () => {
    expect(line({ status: 'COMPLETED', acceptedAmount: '1100.00' }).amount).toBe('1100.00');
    expect(line({ status: 'PREPARING', acceptedAmount: '1100.00' }).amount).toBe('1180.00');
  });

  describe('after a check-in refund (finalPayableAmount, doorstepRefundAmount)', () => {
    const wallet = { paymentMethod: 'WALLET', paymentStatus: 'PAID', status: 'COMPLETED', totalAmount: '901.00', acceptedAmount: '901.00' };
    it('a wallet order refunded at check-in: the line and the bar carry the server final payable', () => {
      const r = line({ ...wallet, doorstepRefundAmount: '430.50', finalPayableAmount: '470.50' });
      expect(r).toMatchObject({ label: 'Paid from wallet', amount: '470.50', barLabel: 'You paid' });
    });
    it('no refund: the final payable is the accepted amount, and a missing one falls back to it', () => {
      expect(line({ ...wallet, doorstepRefundAmount: null, finalPayableAmount: null }).amount).toBe('901.00');
      expect(line({ ...wallet, doorstepRefundAmount: '0.00', finalPayableAmount: '901.00' }).amount).toBe('901.00');
    });
    it('a credit order: the final payable is what stays on credit', () => {
      const r = line({ paymentMethod: 'CREDIT', paymentStatus: 'ON_CREDIT', status: 'COMPLETED', totalAmount: '901.00',
        acceptedAmount: '901.00', finalPayableAmount: '470.50', doorstepRefundAmount: '430.50' });
      expect(r).toMatchObject({ amount: '470.50', barLabel: 'On credit' });
    });
  });
});
