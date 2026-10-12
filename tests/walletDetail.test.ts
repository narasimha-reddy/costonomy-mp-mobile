import {
  creditLineRoute, creditRepaymentInfo, detailAvatar, detailHeader, detailLabel, detailName, detailTime, receiptFileName, referenceLines,
  spokenAmount, walletSideLabel,
} from '@/lib/wallet/detail';
import { DetailStatusColors } from '@/theme';
import type { WalletTransactionDetail } from '@/models/wallet';

function entry(over: Partial<WalletTransactionDetail> = {}): WalletTransactionDetail {
  return {
    id: 184, key: 'L184', transactionId: '184', direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT',
    amount: '250.0000', balanceAfter: '4750.0000', supplierOrderId: null, reason: 'QuickScan payment',
    status: 'COMPLETED', refundStatus: null, instrument: null, at: '2026-09-10T10:00:00Z',
    counterpartyName: 'Sri Ram Tea Stall', counterpartyDetail: 'sr••••@okhdfc',
    references: [], actions: { canPayAgain: true, payeeVpa: 'sriram@okhdfc' },
    ...over,
  };
}

describe('detailHeader', () => {
  it.each([
    ['COMPLETED', DetailStatusColors.success, 'Transaction successful'],
    ['IN_PROGRESS', DetailStatusColors.inProgress, 'Transaction in progress'],
    ['FAILED', DetailStatusColors.failed, 'Transaction failed'],
    ['RETURNED', DetailStatusColors.returned, 'Money returned'],
  ])('%s -> %s, "%s"', (status, color, title) => {
    expect(detailHeader(status)).toEqual({ color, title });
  });

  it('uses the success header for an absent or unknown status', () => {
    expect(detailHeader(undefined).title).toBe('Transaction successful');
    expect(detailHeader('SOMETHING_NEW').color).toBe(DetailStatusColors.success);
  });
});

describe('detailTime', () => {
  it('writes "hh:mm am on dd Mon yyyy" in the phone\'s time zone', () => {
    expect(detailTime(new Date(2026, 9, 2, 7, 54))).toBe('07:54 am on 02 Oct 2026');
    expect(detailTime(new Date(2026, 0, 5, 15, 5))).toBe('03:05 pm on 05 Jan 2026');
  });
  it('shows midnight and noon as 12', () => {
    expect(detailTime(new Date(2026, 5, 1, 0, 7))).toBe('12:07 am on 01 Jun 2026');
    expect(detailTime(new Date(2026, 5, 1, 12, 0))).toBe('12:00 pm on 01 Jun 2026');
  });
  it('reads an ISO string and gives nothing for a bad or missing one', () => {
    expect(detailTime('2026-09-10T10:00:00Z')).toMatch(/^\d\d:\d\d (am|pm) on \d\d Sep 2026$/);
    expect(detailTime('not a date')).toBe('');
    expect(detailTime(null)).toBe('');
  });
});

describe('label and avatar per kind and direction', () => {
  it.each([
    ['QUICKSCAN_PAYMENT', 'DEBIT', 'Paid to', 'out'],
    ['ORDER_PAYMENT', 'DEBIT', 'Paid to', 'out'],
    ['TOP_UP', 'CREDIT', 'Added to wallet', 'in'],
    ['WITHDRAWAL', 'DEBIT', 'Withdrawal to', 'out'],
    ['REFUND', 'CREDIT', 'Refund from', 'in'],
    ['ORDER_REFUND', 'CREDIT', 'Refund from', 'in'],
    ['DISPUTE_REFUND', 'CREDIT', 'Refund from', 'in'],
    ['QUICKSCAN_RETURN', 'CREDIT', 'Received from', 'in'],
    ['WITHDRAWAL_REVERSAL', 'CREDIT', 'Received from', 'in'],
  ])('%s %s -> "%s", %s avatar', (kind, direction, label, avatar) => {
    const e = entry({ kind: kind as never, direction: direction as never });
    expect(detailLabel(e)).toBe(label);
    expect(detailAvatar(e.direction)).toBe(avatar);
  });

  it('names the wallet side by direction', () => {
    expect(walletSideLabel('DEBIT')).toBe('Debited from');
    expect(walletSideLabel('CREDIT')).toBe('Credited to');
  });
});

describe('detailName', () => {
  it('prefers the counterparty name', () => {
    expect(detailName(entry())).toBe('Sri Ram Tea Stall');
  });
  it('falls back to the History row title', () => {
    expect(detailName(entry({ counterpartyName: null, reason: 'Sharma Dairy' }))).toBe('Sharma Dairy');
    expect(detailName(entry({ counterpartyName: '  ', kind: 'TOP_UP', instrument: 'Card •1007', reason: null })))
      .toBe('Card •••• 1007');
  });
});

describe('referenceLines', () => {
  it('writes one "Reference: label value" line per reference, keeping copyable', () => {
    const lines = referenceLines([
      { label: 'QuickScan payment', value: '41', copyable: true },
      { label: 'UTR', value: '4123', copyable: false },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['Reference: QuickScan payment 41', 'Reference: UTR 4123']);
    expect(lines.map((l) => [l.value, l.copyable])).toEqual([['41', true], ['4123', false]]);
  });
  it('drops blank values and tolerates none', () => {
    expect(referenceLines([{ label: 'X', value: ' ', copyable: true }])).toEqual([]);
    expect(referenceLines(undefined)).toEqual([]);
  });
});

describe('receiptFileName and spokenAmount', () => {
  it('names the file after the transaction id', () => {
    expect(receiptFileName('184')).toBe('costonomy-receipt-184.png');
    expect(receiptFileName(184)).toBe('costonomy-receipt-184.png');
  });
  it('keeps odd characters out of the name', () => {
    expect(receiptFileName('../a b/1')).toBe('costonomy-receipt-a-b-1.png');
    expect(receiptFileName('')).toBe('costonomy-receipt-receipt.png');
  });
  it('reads an amount as rupees', () => {
    expect(spokenAmount('85.0000')).toBe('85 rupees');
    expect(spokenAmount('49000')).toBe('49,000 rupees');
  });
});

describe('credit repayment detail', () => {
  const refs = [
    { label: 'Credit invoice', value: 'INV-1', copyable: true },
    { label: 'Credit invoice', value: 'INV-2', copyable: true },
    { label: 'Credit line', value: '7', copyable: true },
    { label: 'Credit repayment', value: '12', copyable: true },
  ];
  it('reads invoices and the agreement id off the references', () => {
    expect(creditRepaymentInfo(entry({ kind: 'CREDIT_REPAYMENT', references: refs })))
      .toEqual({ invoices: ['INV-1', 'INV-2'], agreementId: '7' });
    expect(creditLineRoute('7')).toBe('/restaurant/credit/7');
  });
  it('has no agreement id when the server sends none or a non-number; null for other kinds', () => {
    expect(creditRepaymentInfo(entry({ kind: 'CREDIT_REPAYMENT', references: [] })))
      .toEqual({ invoices: [], agreementId: null });
    expect(creditRepaymentInfo(entry({ kind: 'CREDIT_REPAYMENT', references: [{ label: 'Credit line', value: '../x', copyable: true }] }))?.agreementId).toBeNull();
    expect(creditRepaymentInfo(entry({ references: refs }))).toBeNull();
  });
  it('keeps invoices and the line out of the plain reference lines', () => {
    expect(referenceLines(refs).map((r) => r.text)).toEqual(['Reference: Credit repayment 12']);
  });
});
