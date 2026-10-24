import { buildReviewPayload, formFromDraft, formFromInvoice, newSku, readiness } from '@/lib/wallet/billReview';
import { initReviewState, lineErrorsSelector, reviewReducer, type ReviewState } from '@/lib/wallet/billReviewReducer';
import { kostaDraft, kostaInvoice } from './fixtures/billReview';

const start = (): ReviewState => initReviewState(formFromInvoice(kostaInvoice())!);
const keys = (s: ReviewState) => s.form.lines.map((l) => l.key);

describe('bill review reducer', () => {
  it('starts with no errors', () => {
    const s = start();
    expect(s.errors).toEqual({});
    expect(s.otherErrors).toEqual([]);
  });

  it('adds a blank line at the end, with no lineNo, which needs attention; other lines keep their objects', () => {
    const s0 = start();
    const s = reviewReducer(s0, { type: 'addLine', key: 'new-1' });
    expect(s.form.lines.map((l) => l.lineNo)).toEqual([1, 2, 3, null]);
    expect(s.form.lines[3]).toMatchObject({ key: 'new-1', lineNo: null, fromInvoice: null, sku: null, quantity: '', amount: '' });
    expect(s.form.lines.slice(0, 3)).toEqual(s0.form.lines);
    expect(s.form.lines[0]).toBe(s0.form.lines[0]);
    expect(readiness(s.form).message).toBe('1 item needs attention');
    // The same key twice is one line.
    expect(reviewReducer(s, { type: 'addLine', key: 'new-1' })).toBe(s);
  });

  it('two added lines are told apart by key, so an edit or a removal touches only one of them', () => {
    let s = reviewReducer(start(), { type: 'addLine', key: 'a' });
    s = reviewReducer(s, { type: 'addLine', key: 'b' });
    s = reviewReducer(s, { type: 'setLineNumber', key: 'b', field: 'amount', value: '50' });
    expect(s.form.lines.map((l) => [l.key, l.amount]).slice(3)).toEqual([['a', ''], ['b', '50']]);
    s = reviewReducer(s, { type: 'removeLine', key: 'a' });
    expect(s.form.lines.map((l) => l.lineNo)).toEqual([1, 2, 3, null]);
    expect(s.form.lines[3]?.key).toBe('b');
    expect(buildReviewPayload(s.form, 3).items.map((i) => i.lineNo)).toEqual([1, 2, 3, null]);
  });

  it('removes a line and its errors, keeping the others', () => {
    const s0 = start();
    const [k1, k2, k3] = keys(s0);
    let s = reviewReducer(s0, { type: 'setErrors', errors: { [`line:${k2}:amount`]: 'x', [`line:${k3}:tax`]: 'y', supplier: 'z' } });
    s = reviewReducer(s, { type: 'removeLine', key: k2! });
    expect(s.form.lines.map((l) => l.lineNo)).toEqual([1, 3]);
    expect(keys(s)).toEqual([k1, k3]);
    expect(s.errors).toEqual({ [`line:${k3}:tax`]: 'y', supplier: 'z' });
    expect(reviewReducer(s, { type: 'removeLine', key: 'nope' })).toBe(s);
  });

  it('Ignore toggles one line’s deviation and clears its price error', () => {
    const s0 = start();
    const [k1] = keys(s0);
    let s = reviewReducer(s0, { type: 'setErrors', errors: { [`line:${k1}:price`]: 'Check the price' } });
    s = reviewReducer(s, { type: 'toggleIgnore', key: k1! });
    expect(s.form.lines[0]?.ignoredDeviation).toBe(true);
    expect(s.errors).toEqual({});
    s = reviewReducer(s, { type: 'toggleIgnore', key: k1! });
    expect(s.form.lines[0]?.ignoredDeviation).toBe(false);
  });

  it('a typed-in SKU resolves the line as New, takes its unit and resets Ignore', () => {
    const s0 = start();
    const [k1] = keys(s0);
    let s = reviewReducer(s0, { type: 'toggleIgnore', key: k1! });
    s = reviewReducer(s, { type: 'setLineSku', key: k1!, sku: newSku('Prawns jumbo', 'PCS', '50') });
    expect(s.form.lines[0]).toMatchObject({
      sku: { id: null, name: 'Prawns jumbo', unit: 'PCS', unitPrice: '50.00' }, unit: 'PCS', ignoredDeviation: false,
    });
  });

  it('a typed-in supplier has no id', () => {
    const s = reviewReducer(start(), { type: 'setSupplier', supplier: { id: null, name: '  KOSTA Delights ' } });
    expect(s.form.supplier).toEqual({ id: null, name: 'KOSTA Delights' });
  });

  it('takes the field’s reading as it is, refuses anything that is not digits and one point, and clears the error', () => {
    const s0 = start();
    const [, k2] = keys(s0);
    let s = reviewReducer(s0, { type: 'setErrors', errors: { [`line:${k2}:quantity`]: 'Too many' } });
    s = reviewReducer(s, { type: 'setLineNumber', key: k2!, field: 'quantity', value: '1.25' });
    expect(s.form.lines[1]?.quantity).toBe('1.25');
    expect(s.errors).toEqual({});
    // Never guessed at here: a comma or a word changes nothing.
    expect(reviewReducer(s, { type: 'setLineNumber', key: k2!, field: 'amount', value: '1,500' })).toBe(s);
    expect(reviewReducer(s, { type: 'setLineNumber', key: k2!, field: 'amount', value: '12kg' })).toBe(s);
    expect(reviewReducer(s, { type: 'setDelivery', value: '1,5' })).toBe(s);
    expect(reviewReducer(s, { type: 'setTaxOverride', value: '1,5' })).toBe(s);
  });

  it('an edit to one line keeps every other line’s object (so their cards do not render)', () => {
    const s = start();
    const [, k2] = keys(s);
    const next = reviewReducer(s, { type: 'setLineNumber', key: k2!, field: 'amount', value: '950' });
    expect(next.form.lines[0]).toBe(s.form.lines[0]);
    expect(next.form.lines[2]).toBe(s.form.lines[2]);
    expect(next.form.lines[1]).not.toBe(s.form.lines[1]);
    // The same value again is no change at all.
    expect(reviewReducer(next, { type: 'setLineNumber', key: k2!, field: 'amount', value: '950' })).toBe(next);
  });

  it('picking the invoice date sets the stock-in date and signs the date off; Confirm signs it off', () => {
    let s = start();
    expect(s.form.dateConfirmed).toBe(false);
    s = reviewReducer(s, { type: 'setInvoiceDate', value: '2026-09-02' });
    expect(s.form).toMatchObject({ invoiceDate: '2026-09-02', stockInDate: '2026-09-02', dateConfirmed: true });
    s = reviewReducer(s, { type: 'setStockInDate', value: '2026-10-01' });
    expect(s.form.stockInDate).toBe('2026-10-01');
    expect(reviewReducer(start(), { type: 'confirmDate' }).form.dateConfirmed).toBe(true);
  });

  it('delivery: editing changes it, Reset puts the draft’s (the bill’s) figure back, also after a save', () => {
    let s = reviewReducer(start(), { type: 'setDelivery', value: '45.5' });
    expect(s.form.delivery).toBe('45.5');
    s = reviewReducer(s, { type: 'resetDelivery' });
    expect(s.form.delivery).toBe('');
    // A saved review with delivery 30 (the bill said 50): Reset goes to 50, not to the saved 30.
    const inv = kostaInvoice({
      draft: kostaDraft({ delivery: '50.00' }),
      review: kostaDraft({ delivery: '30.00', deliveryOverridden: true, reviewedAt: '2026-10-03T04:00:00Z' }),
    });
    let saved = initReviewState(formFromInvoice(inv)!);
    expect(saved.form.delivery).toBe('30');
    saved = reviewReducer(saved, { type: 'resetDelivery' });
    expect(saved.form.delivery).toBe('50');
  });

  it('bill-level tax: editing changes it, Reset puts the draft’s back', () => {
    let s = initReviewState(formFromInvoice(kostaInvoice({ draft: kostaDraft({ taxOverride: '180.00' }) }))!);
    expect(s.form.taxOverride).toBe('180');
    s = reviewReducer(s, { type: 'setTaxOverride', value: '200' });
    expect(s.form.taxOverride).toBe('200');
    s = reviewReducer(s, { type: 'resetTaxOverride' });
    expect(s.form.taxOverride).toBe('180');
  });

  it('Start over (reset) goes back to the server’s draft, also after a saved review, and clears errors', () => {
    const inv = kostaInvoice({ review: kostaDraft({ invoiceNumber: 'R-1', items: kostaDraft().items.slice(0, 1), reviewedAt: '2026-10-03T04:00:00Z' }) });
    let s = initReviewState(formFromInvoice(inv)!);
    expect(s.form.lines).toHaveLength(1);
    s = reviewReducer(s, { type: 'setErrors', errors: { supplier: 'x' }, other: ['y'] });
    s = reviewReducer(s, { type: 'reset', form: formFromDraft(inv)! });
    expect(s.form.lines).toHaveLength(3);
    expect(s.form.invoiceNumber).toBe('1631');
    expect(s.errors).toEqual({});
    expect(s.otherErrors).toEqual([]);
  });

  it('line errors come back as the same object while they do not change', () => {
    const cache = new Map();
    const errors = { 'line:a:amount': 'x', supplier: 'y' };
    const a = lineErrorsSelector(errors, cache, 'a');
    expect(a).toEqual({ amount: 'x' });
    expect(lineErrorsSelector({ ...errors, delivery: 'z' }, cache, 'a')).toBe(a);
    expect(lineErrorsSelector({}, cache, 'a')).toEqual({});
    expect(lineErrorsSelector({}, cache, 'b')).toEqual({});
  });
});
