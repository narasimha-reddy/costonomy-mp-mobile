import {
  endedPaymentBody,
  isNotCharged,
  paymentInstrumentName,
  paymentStatusCopy,
  paymentStatusLabel,
  SUPPLIER_CANCELLED_LINE,
  SUPPLIER_CANCEL_TOAST,
  UNKNOWN_PAYMENT_LABEL,
} from '@/lib/payments/statusLabel';
import { PaymentStatus, resolveStatus } from '@/models/status';

const STATUSES = [
  'CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURE_PENDING', 'CAPTURED', 'PAID', 'ON_CREDIT',
  'RELEASED', 'CANCEL_PENDING', 'RETURNING', 'RETURNED', 'RETURN_DELAYED',
  'PARTIALLY_REFUNDED', 'FULLY_REFUNDED', 'REFUNDED', 'FAILED', 'EXPIRED',
];
const INSTRUMENTS = ['card', 'upi', 'netbanking', 'wallet', 'emi', 'paylater', null, undefined, 'crypto'];

describe('"Not charged"', () => {
  it('is true only for a card whose hold was released', () => {
    for (const status of STATUSES) {
      for (const instrument of INSTRUMENTS) {
        const copy = paymentStatusCopy({ status, instrument, amount: '100.00', cancelled: true });
        const claims = /not charged|no money/i.test(`${copy.label} ${copy.detail ?? ''}`);
        expect(claims).toBe(status === 'RELEASED' && instrument === 'card');
        expect(isNotCharged(status, instrument)).toBe(status === 'RELEASED' && instrument === 'card');
      }
    }
  });

  it('says nothing of the sort when an older API sends no instrument', () => {
    expect(paymentStatusLabel('RELEASED')).toBe('Released');
    expect(paymentStatusLabel('RELEASED', 'card')).toBe('Released · not charged');
    expect(paymentStatusLabel('RELEASED', 'upi')).toBe('Released');
  });
});

describe('RETURNING', () => {
  const names: [string, string][] = [
    ['upi', 'by UPI'], ['netbanking', 'by net banking'], ['wallet', 'with your wallet app'],
    ['emi', 'with your EMI'], ['paylater', 'with Pay Later'], ['card', 'with your card'],
  ];

  it.each(names)('names %s as "%s"', (instrument, name) => {
    const copy = paymentStatusCopy({ status: 'RETURNING', instrument, amount: '1250.50', cancelled: true });
    expect(copy.label).toBe('Refund on its way');
    expect(copy.tone).toBe('info');
    expect(copy.detail).toBe(
      `Order cancelled. The ₹1,250.50 you paid ${name} is being refunded to the account you paid from. `
      + 'It usually arrives within 5–7 working days.',
    );
    expect(paymentInstrumentName(instrument)).toBe(name.replace(/^(by|with) /, ''));
  });

  it('says "where you paid from" when the instrument is null, missing or unknown', () => {
    for (const instrument of [null, undefined, 'crypto']) {
      expect(paymentStatusCopy({ status: 'RETURNING', instrument, amount: '80' }).detail).toBe(
        'Order cancelled. The ₹80.00 you paid is being refunded to where you paid from. '
        + 'It usually arrives within 5–7 working days.',
      );
    }
  });

  it('never prints a made-up amount when the API sent none', () => {
    const detail = paymentStatusCopy({ status: 'RETURNING', instrument: 'upi', amount: null }).detail;
    expect(detail).toContain('The money you paid by UPI is being refunded');
    expect(detail).not.toContain('—');
  });
});

describe('the other refund states', () => {
  it('FULLY_REFUNDED after a cancel says where the money went', () => {
    const copy = paymentStatusCopy({
      status: 'FULLY_REFUNDED', instrument: 'upi', amount: '500', cancelled: true, refundedAt: '2026-10-04T06:30:00Z',
    });
    expect(copy.label).toBe('Refunded');
    expect(copy.detail).toBe(
      '₹500.00 was refunded to the account you paid from on 4th Oct 2026. '
      + 'Banks can take up to 5–7 working days to show it.',
    );
  });

  it('leaves the date out rather than inventing one', () => {
    expect(paymentStatusCopy({ status: 'FULLY_REFUNDED', amount: '500', cancelled: true }).detail).toBe(
      '₹500.00 was refunded to the account you paid from. Banks can take up to 5–7 working days to show it.',
    );
  });

  it('FULLY_REFUNDED on an order that was not cancelled gets no cancel sentence', () => {
    expect(paymentStatusCopy({ status: 'FULLY_REFUNDED', amount: '500' }).detail).toBeNull();
  });

  it('RETURNED and RETURN_DELAYED', () => {
    expect(paymentStatusCopy({ status: 'RETURNED' })).toEqual(
      { label: 'Returned by the payment provider', tone: 'neutral', detail: null });
    const late = paymentStatusCopy({ status: 'RETURN_DELAYED', amount: '99.5' });
    expect(late.label).toBe('Refund delayed');
    expect(late.tone).toBe('warning');
    expect(late.detail).toBe(
      "Your refund of ₹99.50 is taking longer than it should. Our team has been alerted and is on it. "
      + "You don't need to do anything, and we'll tell you when it's sent.",
    );
  });
});

describe('unknown and missing values', () => {
  it('render a neutral label that claims nothing', () => {
    for (const status of ['SETTLED_OK', 'SUCCESS', 'paid', '', null, undefined]) {
      const copy = paymentStatusCopy({ status, instrument: 'upi', amount: '10' });
      expect(copy).toEqual({ label: UNKNOWN_PAYMENT_LABEL, tone: 'neutral', detail: null });
    }
  });

  it('every known status has a label and a tone, with or without an instrument', () => {
    for (const status of STATUSES) {
      for (const instrument of INSTRUMENTS) {
        const copy = paymentStatusCopy({ status, instrument });
        expect(copy.label).not.toBe('');
        expect(copy.label).not.toBe(UNKNOWN_PAYMENT_LABEL);
      }
    }
  });

  it('an unknown instrument has no name', () => {
    expect(paymentInstrumentName('crypto')).toBeNull();
    expect(paymentInstrumentName(null)).toBeNull();
  });
});

describe('chips in models/status', () => {
  it('give the new states their tones', () => {
    expect(resolveStatus(PaymentStatus, 'RETURNING').tone).toBe('info');
    expect(resolveStatus(PaymentStatus, 'RETURNED').tone).toBe('neutral');
    expect(resolveStatus(PaymentStatus, 'RETURN_DELAYED').tone).toBe('warning');
    expect(resolveStatus(PaymentStatus, 'CANCEL_PENDING').tone).toBe('pending');
  });

  it('agree with the row labels', () => {
    for (const status of ['RETURNING', 'RETURNED', 'RETURN_DELAYED', 'CANCEL_PENDING']) {
      expect(resolveStatus(PaymentStatus, status).label).toBe(paymentStatusLabel(status));
    }
  });

  it('never call a released hold "not charged"', () => {
    expect(resolveStatus(PaymentStatus, 'RELEASED').label).not.toMatch(/not charged/i);
  });
});

describe('supplier and pay-screen copy', () => {
  it('uses the supplier wording verbatim', () => {
    expect(SUPPLIER_CANCEL_TOAST).toBe("Order cancelled. The restaurant's payment is being returned to them.");
    expect(SUPPLIER_CANCELLED_LINE).toBe('Cancelled. Nothing is paid out for this order.');
  });

  it('does not say no money was taken for a payment awaiting its refund', () => {
    expect(endedPaymentBody('CANCEL_PENDING')).not.toMatch(/no money/i);
    expect(endedPaymentBody('FAILED')).toMatch(/no money was taken/);
    expect(endedPaymentBody(undefined)).toMatch(/no money was taken/);
  });
});

describe('the real refund amount and date', () => {
  const AT = '2026-10-04T06:30:00Z';
  const instruments = ['card', 'upi', null];
  const amounts: [string, number | string | null | undefined, string | null][] = [
    ['number', 480, '₹480.00'],
    ['string', '480.50', '₹480.50'],
    ['absent (null)', null, null],
    ['absent (undefined)', undefined, null],
  ];

  describe.each(instruments)('instrument %s', (instrument) => {
    it.each(amounts)('RETURNING with a %s refundAmount never shows the total', (_n, refundAmount, shown) => {
      const detail = paymentStatusCopy({
        status: 'RETURNING', instrument, amount: '999.00', refundAmount, cancelled: true,
      }).detail!;
      // Absent refundAmount falls back to the previous behaviour: the amount.
      expect(detail).toContain(shown ?? '₹999.00');
      if (shown) expect(detail).not.toContain('999');
    });

    it.each(amounts)('FULLY_REFUNDED with a %s refundAmount, with and without a date', (_n, refundAmount, shown) => {
      for (const refundedAt of [AT, null, undefined]) {
        const detail = paymentStatusCopy({
          status: 'FULLY_REFUNDED', instrument, amount: '999.00', refundAmount, refundedAt, cancelled: true,
        }).detail!;
        expect(detail.startsWith(`${shown ?? '₹999.00'} was refunded to the account you paid from`)).toBe(true);
        expect(detail.includes(' on 4th Oct 2026')).toBe(refundedAt === AT);
        if (shown) expect(detail).not.toContain('999');
      }
    });

    it.each(amounts)('RETURN_DELAYED with a %s refundAmount', (_n, refundAmount, shown) => {
      const detail = paymentStatusCopy({
        status: 'RETURN_DELAYED', instrument, amount: '999.00', refundAmount,
      }).detail!;
      expect(detail).toContain(`of ${shown ?? '₹999.00'} is taking longer`);
    });
  });

  it('the card sentence has no awkward "by"', () => {
    expect(paymentStatusCopy({
      status: 'RETURNING', instrument: 'card', refundAmount: 500, cancelled: true,
    }).detail).toBe(
      'Order cancelled. The ₹500.00 you paid with your card is being refunded to the account you paid from. '
      + 'It usually arrives within 5–7 working days.',
    );
  });

  it('an older API (no refund fields at all) behaves as before', () => {
    const copy = paymentStatusCopy({ status: 'FULLY_REFUNDED', amount: '500', cancelled: true });
    expect(copy.detail).toBe(
      '₹500.00 was refunded to the account you paid from. Banks can take up to 5–7 working days to show it.',
    );
  });

  it('an unreadable refundAmount shows no amount, not the total', () => {
    const detail = paymentStatusCopy({
      status: 'RETURNING', instrument: 'upi', amount: '999', refundAmount: 'abc', cancelled: true,
    }).detail!;
    expect(detail).toContain('The money you paid by UPI');
    expect(detail).not.toContain('999');
  });

  it('an invalid or empty date is left out and never throws', () => {
    for (const refundedAt of ['not a date', '', '   ']) {
      const detail = paymentStatusCopy({
        status: 'FULLY_REFUNDED', amount: '5', refundAmount: 5, refundedAt, cancelled: true,
      }).detail!;
      expect(detail).not.toContain(' on ');
      expect(detail).not.toContain('NaN');
      expect(detail).not.toContain('Invalid');
    }
  });

  it('does not apply to a refund that is not after a cancel', () => {
    expect(paymentStatusCopy({
      status: 'FULLY_REFUNDED', refundAmount: 5, refundedAt: AT,
    }).detail).toBeNull();
  });
});
