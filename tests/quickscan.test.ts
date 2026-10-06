import { parseUpiQr } from '@/lib/upi/parseUpiQr';
import { quickScanStatusCopy } from '@/lib/quickscan/statusCopy';
import { entryLabel } from '@/lib/wallet/entryCopy';
import type { QuickScanPayment } from '@/models/quickscan';
import type { WalletEntry } from '@/models/wallet';

function payment(status: QuickScanPayment['status'], extra: Partial<QuickScanPayment> = {}): QuickScanPayment {
  return {
    id: 1,
    outletId: 2,
    payeeVpa: 'shop@okhdfcbank',
    payeeName: 'Sharma Stores',
    note: null,
    amount: '250.00',
    fee: '0.00',
    total: '250.00',
    method: 'WALLET',
    status,
    failureReason: null,
    createdAt: '2026-09-28T10:00:00Z',
    paidAt: null,
    ...extra,
  };
}

describe('parseUpiQr', () => {
  it('reads a UPI deep link with a fixed amount', () => {
    const result = parseUpiQr('upi://pay?pa=shop@okhdfcbank&pn=Sharma%20Stores&am=250.00&cu=INR');
    expect(result).toEqual({
      ok: true,
      vpa: 'shop@okhdfcbank',
      name: 'Sharma Stores',
      amount: '250.00',
    });
  });

  it('reads a UPI deep link with no amount, leaving it for the payer to type', () => {
    const result = parseUpiQr('upi://pay?pa=shop@okhdfcbank&pn=Sharma+Stores');
    expect(result).toEqual({ ok: true, vpa: 'shop@okhdfcbank', name: 'Sharma Stores' });
  });

  it('URL-decodes the payee name and ignores unknown params', () => {
    const result = parseUpiQr('upi://pay?pa=shop@okaxis&pn=Ramu%27s%20Kirana&mc=1234&tr=abc123&tn=Veg%20order');
    expect(result).toEqual({ ok: true, vpa: 'shop@okaxis', name: "Ramu's Kirana", note: 'Veg order' });
  });

  it('matches the scheme case-insensitively', () => {
    const result = parseUpiQr('UPI://PAY?pa=shop@okaxis');
    expect(result).toEqual({ ok: true, vpa: 'shop@okaxis' });
  });

  it('accepts a bare UPI ID typed by hand', () => {
    expect(parseUpiQr('  ramu.kirana@okhdfcbank  ')).toEqual({ ok: true, vpa: 'ramu.kirana@okhdfcbank' });
  });

  it('refuses a currency other than INR', () => {
    const result = parseUpiQr('upi://pay?pa=shop@okaxis&cu=USD');
    expect(result).toEqual({ ok: false, reason: 'Only rupee payments are supported' });
  });

  it('refuses an amount that is not a valid positive rupee figure', () => {
    for (const bad of ['0', '-5', 'abc', '5.999']) {
      const result = parseUpiQr(`upi://pay?pa=shop@okaxis&am=${bad}`);
      expect(result.ok).toBe(false);
    }
  });

  it('refuses a UPI ID that does not match the server’s shape', () => {
    expect(parseUpiQr('upi://pay?pa=not-an-id').ok).toBe(false);
    expect(parseUpiQr('not-an-id').ok).toBe(false);
    expect(parseUpiQr('a@1').ok).toBe(false);
  });

  it('says so when a code has no UPI ID on it at all', () => {
    expect(parseUpiQr('upi://pay').ok).toBe(false);
    expect(parseUpiQr('').ok).toBe(false);
  });

  it('rejects text that is not a UPI code at all', () => {
    expect(parseUpiQr('https://example.com/not-upi').ok).toBe(false);
    expect(parseUpiQr('just some random text scanned by mistake').ok).toBe(false);
  });

  it('caps a very long name and note', () => {
    const longName = 'x'.repeat(150);
    const longNote = 'y'.repeat(300);
    const result = parseUpiQr(`upi://pay?pa=shop@okaxis&pn=${longName}&tn=${longNote}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name?.length).toBe(100);
      expect(result.note?.length).toBe(200);
    }
  });

  it('never evaluates the payload — garbage input just fails to parse', () => {
    expect(parseUpiQr('<script>alert(1)</script>')).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe('quickScanStatusCopy', () => {
  it('says a payment is on its way, and keeps polling', () => {
    const copy = quickScanStatusCopy(payment('PAYOUT_PENDING'));
    expect(copy.title).toContain('Sending');
    expect(copy.title).toContain('Sharma Stores');
    expect(copy.polling).toBe(true);
  });

  it('says a payment landed, and stops polling', () => {
    const copy = quickScanStatusCopy(payment('PAID', { paidAt: '2026-09-28T10:05:00Z' }));
    expect(copy.title).toContain('Paid');
    expect(copy.polling).toBe(false);
  });

  it('says the money came back on a failure, with the server’s reason', () => {
    const copy = quickScanStatusCopy(payment('FAILED', { failureReason: 'The payee could not be reached.' }));
    expect(copy.title).toContain('back in your wallet');
    expect(copy.detail).toBe('The payee could not be reached.');
    expect(copy.polling).toBe(false);
  });

  it('names the ops team on a payment under review', () => {
    const copy = quickScanStatusCopy(payment('NEEDS_REVIEW'));
    expect(copy.title).toContain("Mandi's team");
    expect(copy.polling).toBe(false);
  });

  it('falls back to "the UPI ID" when the QR carried no payee name', () => {
    const copy = quickScanStatusCopy(payment('PAID', { payeeName: null }));
    expect(copy.title).toContain('the UPI ID');
  });
});

describe('wallet statement: QuickScan entries', () => {
  const entry = (extra: Partial<WalletEntry>): WalletEntry => ({
    id: 1, direction: 'DEBIT', kind: 'QUICKSCAN_PAYMENT', amount: '250.00', balanceAfter: '750.00',
    supplierOrderId: null, reason: null, refundStatus: null, at: '2026-09-28T10:00:00Z', ...extra,
  });

  it('labels a QuickScan payment', () => {
    expect(entryLabel(entry({ kind: 'QUICKSCAN_PAYMENT', direction: 'DEBIT' }))).toBe('Paid a shop (QuickScan)');
  });

  it('labels a QuickScan return', () => {
    expect(entryLabel(entry({ kind: 'QUICKSCAN_RETURN', direction: 'CREDIT' }))).toBe('QuickScan payment returned');
  });
});
