import { ApiError } from '@/lib/api/errors';
import {
  buildReviewPayload, fieldErrorsFrom, formFromDraft, lineField, lineHint, lineStatus, readiness, saveProblem,
} from '@/lib/wallet/billReview';
import { initReviewState, reviewReducer } from '@/lib/wallet/billReviewReducer';
import { readNumberInput, type NumberRules } from '@/lib/wallet/numberInput';
import { kostaDraft, kostaInvoice } from './fixtures/billReview';

const MONEY: NumberRules = { decimals: 2, maxInt: 10, separator: '.' };

/** A bill whose second line is a discount: a negative amount (the server's draft copies it as it reads it). */
function discountInvoice(over: { amount?: string; tax?: string; delivery?: string; taxOverride?: string } = {}) {
  const draft = kostaDraft();
  draft.items[0] = { ...draft.items[0]!, ignoredDeviation: true }; // line 1's price deviation is a different matter
  draft.items[1] = { ...draft.items[1]!, amount: over.amount ?? '-900.00', tax: over.tax ?? '0.00' };
  draft.delivery = over.delivery ?? '0.00';
  draft.taxOverride = over.taxOverride ?? null;
  return kostaInvoice({ draft, review: null });
}

const readyForSave = (form: ReturnType<typeof formFromDraft>) => ({ ...form!, dateConfirmed: true });

describe('negative amounts, tax and delivery from a bill', () => {
  it('the line shows Needs attention with the negative hint; Save is not ready', () => {
    const form = readyForSave(formFromDraft(discountInvoice()));
    const line = form.lines[1]!;
    expect(line.amount).toBe('-900');
    expect(lineStatus(line)).toBe('attention');
    expect(lineHint(line)).toBe('The amount cannot be negative. Correct it or remove this line.');
    expect(readiness(form).ready).toBe(false);
    expect(readiness(form).attention).toBe(1);
  });

  it('a zero or blank amount keeps the generic hint; quantity hints are unchanged', () => {
    const form = formFromDraft(discountInvoice({ amount: '0.00' }))!;
    expect(lineHint(form.lines[1]!)).toBe('Enter an amount.');
    const noQty = { ...form.lines[0]!, quantity: '0' };
    expect(lineHint(noQty)).toBe('Enter a quantity.');
    expect(lineHint({ ...noQty, amount: '-5' })).toBe('Enter a quantity and amount.');
  });

  it('correcting the amount through the reducer makes the form ready and sends the positive amount', () => {
    let state = initReviewState(readyForSave(formFromDraft(discountInvoice())));
    expect(readiness(state.form).ready).toBe(false);
    const key = state.form.lines[1]!.key;
    // The user deletes the minus, field text "-900" -> "900".
    const read = readNumberInput('900', '-900', MONEY);
    expect(read).toEqual({ ok: true, value: '900', note: null });
    state = reviewReducer(state, { type: 'setLineNumber', key, field: 'amount', value: read.ok ? read.value : '' });
    expect(readiness(state.form).ready).toBe(true);
    expect(lineHint(state.form.lines[1]!)).toBeNull();
    expect(saveProblem(state.form)).toBeNull();
    expect(buildReviewPayload(state.form, 3).items[1]?.amount).toBe('900.00');
  });

  it('removing the negative line also gets the form ready', () => {
    let state = initReviewState(readyForSave(formFromDraft(discountInvoice())));
    state = reviewReducer(state, { type: 'removeLine', key: state.form.lines[1]!.key });
    expect(readiness(state.form).ready).toBe(true);
  });

  it('field text -50: deleting the minus, or clearing and typing 50, is accepted', () => {
    expect(readNumberInput('50', '-50', MONEY)).toEqual({ ok: true, value: '50', note: null });
    expect(readNumberInput('', '-50', MONEY)).toEqual({ ok: true, value: '', note: null });
    expect(readNumberInput('5', '', MONEY)).toEqual({ ok: true, value: '5', note: null });
    expect(readNumberInput('50', '5', MONEY)).toEqual({ ok: true, value: '50', note: null });
    // Deleting a digit of -50 drops the sign too, so the value is always one the reducer keeps.
    expect(readNumberInput('-5', '-50', MONEY)).toEqual({ ok: true, value: '5', note: null });
    // Typing a minus is still refused.
    expect(readNumberInput('-50', '50', MONEY)).toEqual({ ok: false, message: 'Use digits only' });
  });

  it('a negative line tax, delivery or tax override is a save problem on its own field, with the server’s words', () => {
    const taxForm = readyForSave(formFromDraft(discountInvoice({ amount: '900.00', tax: '-5.00' })));
    expect(saveProblem(taxForm)).toEqual({ field: lineField(taxForm.lines[1]!.key, 'tax'), message: 'Tax cannot be negative.' });
    const delForm = readyForSave(formFromDraft(discountInvoice({ amount: '900.00', delivery: '-20.00' })));
    expect(saveProblem(delForm)).toEqual({ field: 'delivery', message: 'Delivery charges cannot be negative.' });
    const ovrForm = readyForSave(formFromDraft(discountInvoice({ amount: '900.00', taxOverride: '-1.00' })));
    expect(saveProblem(ovrForm)).toEqual({ field: 'taxOverride', message: 'Tax cannot be negative.' });
    expect(saveProblem(readyForSave(formFromDraft(discountInvoice({ amount: '900.00' }))))).toBeNull();
  });

  it('each of those is correctable in the field and then saves', () => {
    let state = initReviewState(readyForSave(formFromDraft(discountInvoice({
      amount: '900.00', tax: '-5.00', delivery: '-20.00', taxOverride: '-1.00',
    }))));
    const key = state.form.lines[1]!.key;
    state = reviewReducer(state, { type: 'setLineNumber', key, field: 'tax', value: '' });
    state = reviewReducer(state, { type: 'setDelivery', value: '' });
    state = reviewReducer(state, { type: 'setTaxOverride', value: '1' });
    expect(saveProblem(state.form)).toBeNull();
  });

  it('a server 400 on items[0].amount lands on that line’s amount field', () => {
    const error = new ApiError({
      status: 400, code: 'VALIDATION_ERROR', message: 'Invalid',
      details: { fields: { 'items[0].amount': 'The amount cannot be negative.', delivery: 'Delivery charges cannot be negative.' } },
    });
    const out = fieldErrorsFrom(error, ['k1', 'k2']);
    expect(out.fields[lineField('k1', 'amount')]).toBe('The amount cannot be negative.');
    expect(out.fields.delivery).toBe('Delivery charges cannot be negative.');
    expect(out.other).toEqual([]);
  });
});
