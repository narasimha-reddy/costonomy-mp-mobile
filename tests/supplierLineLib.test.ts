import {
  PERIOD_CHIPS, checkTerms, draftFromAgreement, modifyInputFrom, approveInputFrom, paymentBadge,
  minLimitHint, reasonCheck, lineBanner, reinstateNote,
} from '@/lib/credit/supplierLine';

const agreement = (over: Record<string, unknown> = {}) => ({
  id: 3, status: 'ACTIVE', approvedLimit: '50000.0000', creditPeriodDays: 30, gracePeriodDays: 3,
  maxSingleOrderCredit: '10000.0000', reserved: '0', utilized: '0', ...over,
}) as never;

describe('paymentBadge', () => {
  it('words each source plainly', () => {
    expect(paymentBadge('SUPPLIER_RECORDED')).toBe('You recorded');
    expect(paymentBadge('CLAIM_CONFIRMED')).toBe('Confirmed claim');
    expect(paymentBadge('WALLET')).toBe('Through Mandi');
  });
  it('claims nothing about an unknown source', () => {
    expect(paymentBadge('SOMETHING_NEW')).toBeNull();
  });
});

describe('draftFromAgreement', () => {
  it('starts from the line and drops the zeros the server adds', () => {
    const d = draftFromAgreement(agreement());
    expect(d).toMatchObject({ limit: '50000', days: '30', grace: '3', cap: '10000', maxOverdue: '', reason: '' });
  });
  it('starts a request from what was asked for', () => {
    const d = draftFromAgreement(agreement({
      status: 'REQUESTED', approvedLimit: '0', latestRequest: { requestedLimit: '20000.0000', requestedPeriodDays: 15 },
    }));
    expect(d).toMatchObject({ limit: '20000', days: '15' });
  });
  it('carries the threshold only when the server sent it', () => {
    expect(draftFromAgreement(agreement({ maxOverdueAmount: '5000.0000' })).maxOverdue).toBe('5000');
  });
});

describe('checkTerms', () => {
  const ok = { limit: '50000', days: '30', grace: '3', cap: '', maxOverdue: '', reason: 'Good history' };
  const opts = { minLimit: null, reasonRequired: true };

  it('accepts a good draft', () => {
    expect(checkTerms(ok, opts)).toEqual({ valid: true, errors: {} });
  });
  it('refuses a limit of zero, blank or with 3 decimals', () => {
    for (const limit of ['0', '', '10.123', 'abc']) {
      expect(checkTerms({ ...ok, limit }, opts).errors.limit).toBeTruthy();
    }
  });
  it('limits the period to 1-180', () => {
    expect(checkTerms({ ...ok, days: '0' }, opts).errors.days).toBeTruthy();
    expect(checkTerms({ ...ok, days: '181' }, opts).errors.days).toBeTruthy();
    expect(checkTerms({ ...ok, days: '1.5' }, opts).errors.days).toBeTruthy();
    expect(checkTerms({ ...ok, days: '180' }, opts).valid).toBe(true);
    expect(checkTerms({ ...ok, days: '1' }, opts).valid).toBe(true);
  });
  it('limits grace to 0-60', () => {
    expect(checkTerms({ ...ok, grace: '61' }, opts).errors.grace).toBeTruthy();
    expect(checkTerms({ ...ok, grace: '' }, opts).errors.grace).toBeTruthy();
    expect(checkTerms({ ...ok, grace: '0' }, opts).valid).toBe(true);
    expect(checkTerms({ ...ok, grace: '60' }, opts).valid).toBe(true);
  });
  it('allows no per-order cap, but not below 1 rupee (the server floor)', () => {
    expect(checkTerms({ ...ok, cap: '' }, opts).valid).toBe(true);
    expect(checkTerms({ ...ok, cap: '0.5' }, opts).errors.cap).toBeTruthy();
    expect(checkTerms({ ...ok, cap: '1' }, opts).valid).toBe(true);
  });
  it('does not force the cap under the limit: the server has no such rule', () => {
    expect(checkTerms({ ...ok, cap: '90000' }, opts).valid).toBe(true);
  });
  it('allows no auto-pause threshold, or zero or more', () => {
    expect(checkTerms({ ...ok, maxOverdue: '0' }, opts).valid).toBe(true);
    expect(checkTerms({ ...ok, maxOverdue: '-1' }, opts).errors.maxOverdue).toBeTruthy();
  });
  it('requires a reason of 3 characters when asked, and not when it is optional', () => {
    expect(checkTerms({ ...ok, reason: '  ab ' }, opts).errors.reason).toBeTruthy();
    expect(checkTerms({ ...ok, reason: '' }, { ...opts, reasonRequired: false }).valid).toBe(true);
  });
  it('holds the limit to the floor only when the server sends one', () => {
    expect(checkTerms({ ...ok, limit: '37999' }, { ...opts, minLimit: '38000.0000' }).errors.limit)
      .toMatch(/no lower than ₹38,000/);
    expect(checkTerms({ ...ok, limit: '38000' }, { ...opts, minLimit: '38000.0000' }).valid).toBe(true);
    expect(checkTerms({ ...ok, limit: '1' }, opts).valid).toBe(true);
  });
});

describe('minLimitHint', () => {
  it('says nothing without a server floor', () => {
    expect(minLimitHint(null)).toBeNull();
    expect(minLimitHint(undefined)).toBeNull();
  });
  it('names the floor in rupees', () => {
    expect(minLimitHint('38000.0000')).toBe('Limit can go no lower than ₹38,000.00 (already drawn or on hold).');
  });
});

describe('reasonCheck', () => {
  it('needs 3 to 500 characters once trimmed', () => {
    expect(reasonCheck('  ab ')).toBe(false);
    expect(reasonCheck('abc')).toBe(true);
    expect(reasonCheck('x'.repeat(500))).toBe(true);
    expect(reasonCheck('x'.repeat(501))).toBe(false);
  });
});

describe('request bodies', () => {
  const draft = { limit: '60000', days: '45', grace: '2', cap: '', maxOverdue: '', reason: ' Raised  ' };

  it('modify sends the typed values, the trimmed reason, and no cap when it is blank', () => {
    expect(modifyInputFrom(draft)).toEqual({
      approvedLimit: '60000', creditPeriodDays: 45, gracePeriodDays: 2, reason: 'Raised',
    });
  });
  it('modify sends the cap and the threshold when typed', () => {
    expect(modifyInputFrom({ ...draft, cap: '5000', maxOverdue: '2000' })).toMatchObject({
      maxSingleOrderCredit: '5000', maxOverdueAmount: '2000',
    });
  });
  it('approve on my terms sends the note only when there is one', () => {
    expect(approveInputFrom({ ...draft, reason: '' })).toEqual({
      approvedLimit: '60000', creditPeriodDays: 45, gracePeriodDays: 2,
    });
    expect(approveInputFrom(draft)).toMatchObject({ note: 'Raised' });
  });
  it('lists the period chips', () => {
    expect(PERIOD_CHIPS).toEqual([7, 15, 30, 45, 60]);
  });
});

describe('lineBanner', () => {
  it('has none for an active line', () => {
    expect(lineBanner(agreement(), null)).toBeNull();
  });
  it('explains an automatic pause with the overdue figure and the threshold the server sent', () => {
    const b = lineBanner(agreement({
      status: 'SUSPENDED', suspensionSource: 'SYSTEM', overdue: '8200.0000', maxOverdueAmount: '5000.0000',
    }), null);
    expect(b?.kind).toBe('SYSTEM_SUSPENDED');
    expect(b?.body).toBe(
      'Auto-paused: ₹8,200.00 overdue is above your ₹5,000.00 limit. It reopens when they pay, or you can reinstate.');
  });
  it('drops the threshold clause when the server did not send it', () => {
    const b = lineBanner(agreement({ status: 'SUSPENDED', suspensionSource: 'SYSTEM', overdue: '8200.0000' }), null);
    expect(b?.body).toBe('Auto-paused: ₹8,200.00 overdue. It reopens when they pay, or you can reinstate.');
  });
  it('shows the supplier reason for a suspension by a person', () => {
    const b = lineBanner(agreement({ status: 'SUSPENDED', suspensionSource: 'SUPPLIER', suspensionReason: 'Cheque bounced' }), null);
    expect(b?.kind).toBe('SUPPLIER_SUSPENDED');
    expect(b?.title).toBe('You suspended this line');
    expect(b?.body).toContain('Cheque bounced');
  });
  it('shows only the reason when the source is unknown', () => {
    const b = lineBanner(agreement({ status: 'SUSPENDED', suspensionReason: 'Overdue balance' }), null);
    expect(b?.kind).toBe('SUSPENDED');
    expect(b?.body).toContain('Overdue balance');
  });
  it('says an approved offer has not been accepted', () => {
    const b = lineBanner(agreement({ status: 'APPROVED', termsVersion: 3, canFund: false }), '2 days ago');
    expect(b?.kind).toBe('OFFER_PENDING');
    expect(b?.title).toBe('Offer v3 sent 2 days ago; not accepted yet');
    expect(lineBanner(agreement({ status: 'APPROVED', termsVersion: 3, canFund: false }), null)?.title)
      .toBe('Offer v3 sent; not accepted yet');
  });
});

describe('reinstateNote', () => {
  it('warns that an automatic pause can return, for a pause the system made', () => {
    expect(reinstateNote(agreement({ status: 'SUSPENDED', suspensionSource: 'SYSTEM', overdue: '8200' })))
      .toMatch(/pause again/);
  });
  it('says nothing for a pause the supplier made', () => {
    expect(reinstateNote(agreement({ status: 'SUSPENDED', suspensionSource: 'SUPPLIER', overdue: '8200' }))).toBeNull();
  });
  it('warns when the source is unknown and something is overdue, not otherwise', () => {
    expect(reinstateNote(agreement({ status: 'SUSPENDED', overdue: '100' }))).toMatch(/pause again/);
    expect(reinstateNote(agreement({ status: 'SUSPENDED', overdue: '0' }))).toBeNull();
  });
});
