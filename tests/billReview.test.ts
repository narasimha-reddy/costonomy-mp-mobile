import { ApiError } from '@/lib/api/errors';
import {
  DEVIATION_THRESHOLD, blankLine, buildReviewPayload, defaultSkuUnit, deliveryChanged, fieldErrorsFrom, fieldForPath,
  filterLines, firstErrorField, footerStatus, formFromDraft, formFromInvoice, formFromReview, formatDay, isBlankLine,
  isDirty, isISODate, lineHint, lineIsReady, lineStatus, matchedSku, milliToQuantity, monthGrid, newLineKey, newSku,
  newSkuProblems, paiseToRupees, parseToISODate, previewItemPrice, previewLineTotal, previewTotals, priceDeviation,
  readiness, reviewMatchesPayload, saveProblem, shiftMonth, skuPriceOrNull, taxOverrideChanged, toMilli, toPaise,
  todayIST, type FormLine, type ReviewForm,
} from '@/lib/wallet/billReview';
import { kostaDraft, kostaInvoice } from './fixtures/billReview';

const line = (over: Partial<FormLine> = {}): FormLine => ({
  key: 'k1',
  lineNo: 1,
  fromInvoice: { name: '16/20 prawns', quantity: '2', unit: 'KG', unitPrice: '560.00', total: '1120.00' },
  sku: { id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360.00' },
  quantity: '2', unit: 'KG', amount: '1120', tax: '0', ignoredDeviation: false,
  ...over,
});

const draftForm = (): ReviewForm => formFromInvoice(kostaInvoice())!;
const keysOf = (form: ReviewForm) => form.lines.map((l) => l.key);

describe('preview arithmetic in paise', () => {
  it('reads strings and numbers, rounding half up at the third place', () => {
    expect(toPaise('1120')).toBe(112000);
    expect(toPaise('1120.0000')).toBe(112000);
    expect(toPaise(360)).toBe(36000);
    expect(toPaise('0.105')).toBe(11);
    expect(toPaise('0.104')).toBe(10);
    expect(toPaise('2.675')).toBe(268); // a float would give 2.67
    expect(toPaise('')).toBeNull();
    expect(toPaise('.')).toBeNull();
    expect(toPaise('abc')).toBeNull();
    expect(toPaise(null)).toBeNull();
    expect(toPaise('-12.5')).toBe(-1250);
    expect(toPaise(1e3)).toBe(100000);
  });

  it('reads quantities in thousandths', () => {
    expect(toMilli('2')).toBe(2000);
    expect(toMilli('0.125')).toBe(125);
    expect(toMilli('1.0005')).toBe(1001);
    expect(milliToQuantity(2500)).toBe('2.5');
    expect(milliToQuantity(2000)).toBe('2');
    expect(milliToQuantity(125)).toBe('0.125');
  });

  it('writes paise back with two places', () => {
    expect(paiseToRupees(112000)).toBe('1120.00');
    expect(paiseToRupees(5)).toBe('0.05');
    expect(paiseToRupees(-1250)).toBe('-12.50');
  });

  it('line total is amount + tax; item price is (amount + tax) ÷ qty, rounded half up', () => {
    expect(previewLineTotal({ quantity: '2', amount: '1120', tax: '0' })).toBe(112000);
    expect(previewLineTotal({ quantity: '2', amount: '100.10', tax: '5.01' })).toBe(10511);
    expect(previewLineTotal({ quantity: '', amount: '', tax: '' })).toBe(0);
    expect(previewItemPrice({ quantity: '2', amount: '1120', tax: '0' })).toBe(56000);
    expect(previewItemPrice({ quantity: '3', amount: '100', tax: '0' })).toBe(3333); // 33.333…
    expect(previewItemPrice({ quantity: '3', amount: '200', tax: '0' })).toBe(6667); // 66.666… rounds up
    expect(previewItemPrice({ quantity: '0.25', amount: '10', tax: '0.5' })).toBe(4200);
    expect(previewItemPrice({ quantity: '0', amount: '100', tax: '0' })).toBeNull();
    expect(previewItemPrice({ quantity: '2', amount: '', tax: '' })).toBeNull();
  });

  it('summary: subtotal = Σ amount, tax = Σ tax, total adds delivery', () => {
    const t = previewTotals([
      { quantity: '2', amount: '1120', tax: '0' },
      { quantity: '2', amount: '900.10', tax: '45.01' },
      { quantity: '', amount: '', tax: '' },
    ], '50.5');
    expect(t).toEqual({ subtotal: 202010, tax: 4501, lineTax: 4501, delivery: 5050, total: 211561 });
    expect(previewTotals([], null)).toEqual({ subtotal: 0, tax: 0, lineTax: 0, delivery: 0, total: 0 });
  });

  it('a bill-level tax replaces the sum of the line taxes, as the server adds it up', () => {
    const lines = [{ quantity: '2', amount: '2640', tax: '0' }];
    expect(previewTotals(lines, '', '180')).toEqual({ subtotal: 264000, tax: 18000, lineTax: 0, delivery: 0, total: 282000 });
    expect(previewTotals([{ quantity: '1', amount: '100', tax: '5' }], '', '').tax).toBe(500); // blank: the lines' sum
    expect(previewTotals([{ quantity: '1', amount: '100', tax: '5' }], '', '0').tax).toBe(0); // an explicit 0 wins
  });

  it('stays exact with large values (no float drift)', () => {
    const lines = Array.from({ length: 100 }, () => ({ quantity: '1', amount: '9999999999.99', tax: '0.01' }));
    const t = previewTotals(lines, '0.01');
    expect(t.subtotal).toBe(99_999_999_999_900);
    expect(t.total).toBe(100_000_000_000_001);
    expect(paiseToRupees(t.total)).toBe('1000000000000.01');
    // 0.1 + 0.2 in floats is 0.30000000000000004
    expect(previewTotals([{ quantity: '1', amount: '0.1', tax: '0.2' }], null).total).toBe(30);
  });
});

describe('price deviation (cost app: ±50% of the SKU price, strict)', () => {
  it('uses the same threshold as the cost app', () => {
    expect(DEVIATION_THRESHOLD).toBe(0.5);
  });

  it.each([
    // qty, amount, tax, sku price, expected
    ['2', '1120', '0', '360', 'above'], // 560 vs 360: the reference bill's line 1
    ['2', '900', '0', '300', null], // 450 vs 300: exactly +50%, not flagged
    ['2', '900.02', '0', '300', 'above'], // 450.01: just over
    ['2', '800', '0', '270', null], // 400 vs 270 (limit 405)
    ['2', '810.02', '0', '270', 'above'], // 405.01
    ['2', '300', '0', '300', null], // 150 vs 300: exactly −50%, not flagged
    ['2', '299.98', '0', '300', 'below'], // 149.99
    ['1', '100', '60', '100', 'above'], // tax counts: 160 vs 100
    ['1', '100', '0', '0', null], // SKU without a price
    ['0', '100', '0', '100', null], // no quantity
    ['2', '0', '0', '100', null], // no money
    ['3', '1000', '0', '200', 'above'], // 333.33… vs 200 (limit 300)
    ['3', '899.99', '0', '200', null], // 299.996… vs 300: compared exactly, not rounded up to 300.00
  ])('qty %s, amount %s, tax %s against %s → %s', (quantity, amount, tax, unitPrice, expected) => {
    expect(priceDeviation({ quantity, amount, tax, sku: { unitPrice } })).toBe(expected);
  });

  it('needs a SKU', () => {
    expect(priceDeviation({ quantity: '2', amount: '1120', tax: '0', sku: null })).toBeNull();
  });

  it('compares against a SKU price with four places exactly (a price per gram)', () => {
    // ₹0.4525 a unit: the +50% limit is ₹0.67875 a unit. Rounding the SKU price to ₹0.45 would flag 67.87.
    expect(priceDeviation({ quantity: '100', amount: '67.87', tax: '0', sku: { unitPrice: '0.4525' } })).toBeNull();
    expect(priceDeviation({ quantity: '100', amount: '67.88', tax: '0', sku: { unitPrice: '0.4525' } })).toBe('above');
  });
});

describe('when a line is ready', () => {
  it('needs a SKU, a quantity above zero and an amount above zero', () => {
    expect(lineIsReady(line())).toBe(true);
    expect(lineIsReady(line({ sku: null }))).toBe(false);
    expect(lineIsReady(line({ quantity: '0' }))).toBe(false);
    expect(lineIsReady(line({ quantity: '' }))).toBe(false);
    expect(lineIsReady(line({ amount: '0' }))).toBe(false);
    expect(lineIsReady(line({ amount: '0', tax: '50' }))).toBe(false); // amount before tax, as the cost app
    expect(lineIsReady(line({ sku: { id: null, name: '  ', unit: 'KG', unitPrice: null } }))).toBe(false);
  });

  it('chip: Resolved, New for a typed-in SKU, Needs attention otherwise', () => {
    expect(lineStatus(line())).toBe('resolved');
    expect(lineStatus(line({ sku: { id: null, name: 'Prawns jumbo', unit: 'KG', unitPrice: null } }))).toBe('new');
    expect(lineStatus(line({ sku: null }))).toBe('attention');
    expect(lineStatus(line({ sku: { id: null, name: 'X', unit: 'KG', unitPrice: null }, quantity: '' }))).toBe('attention');
  });

  it('hint in the cost app’s words', () => {
    expect(lineHint(line())).toBeNull();
    expect(lineHint(line({ sku: null }))).toBe('Choose the SKU for this item.');
    expect(lineHint(line({ quantity: '', amount: '' }))).toBe('Enter a quantity and amount.');
    expect(lineHint(line({ quantity: '' }))).toBe('Enter a quantity.');
    expect(lineHint(line({ amount: '' }))).toBe('Enter an amount.');
  });
});

describe('footer and Save', () => {
  it('counts lines that need attention', () => {
    const form = draftForm();
    expect(readiness(form)).toMatchObject({ attention: 0, message: 'All items ready' });
    form.lines[0] = { ...form.lines[0]!, sku: null };
    expect(readiness(form)).toMatchObject({ attention: 1, message: '1 item needs attention', ready: false });
    form.lines[1] = { ...form.lines[1]!, amount: '' };
    expect(readiness(form).message).toBe('2 items need attention');
  });

  it('All items ready can still wait on the supplier, stock-in date or date sign-off', () => {
    const form = draftForm();
    expect(form.dateConfirmed).toBe(false);
    expect(readiness(form)).toMatchObject({ ready: false, blocker: { field: 'invoiceDate', text: 'Confirm the invoice date' } });
    expect(readiness({ ...form, dateConfirmed: true })).toMatchObject({ ready: true, blocker: null });
    expect(readiness({ ...form, dateConfirmed: true, supplier: { id: null, name: ' ' } }).blocker?.field).toBe('supplier');
    expect(readiness({ ...form, dateConfirmed: true, stockInDate: '' }).blocker?.field).toBe('stockInDate');
    expect(readiness({ ...form, dateConfirmed: true, lines: [] })).toMatchObject({ ready: false, message: 'Add at least one item' });
  });

  it('a saved review is already signed off', () => {
    const form = formFromInvoice(kostaInvoice({ review: kostaDraft({ reviewedAt: '2026-10-03T04:00:00Z' }) }))!;
    expect(form.dateConfirmed).toBe(true);
  });

  it('Save stops on an open deviation, and on a SKU used twice (also two new SKUs with one name)', () => {
    const form = { ...draftForm(), dateConfirmed: true };
    const [k1, , k3] = keysOf(form);
    expect(saveProblem(form)).toEqual({ field: `line:${k1}:price`, message: expect.stringContaining('Prawns 16/20') });
    form.lines[0] = { ...form.lines[0]!, ignoredDeviation: true };
    expect(saveProblem(form)).toBeNull();
    form.lines[2] = { ...form.lines[2]!, sku: form.lines[1]!.sku };
    expect(saveProblem(form)?.field).toBe(`line:${k3}:sku`);
    form.lines[2] = { ...form.lines[2]!, sku: { id: null, name: 'Ice', unit: 'KG', unitPrice: null } };
    form.lines[1] = { ...form.lines[1]!, sku: { id: null, name: ' ice ', unit: 'KG', unitPrice: null } };
    expect(saveProblem(form)?.field).toBe(`line:${k3}:sku`);
  });

  it('the footer shows one status: a failed save, then attention, then the blocker, then ready', () => {
    const form = draftForm();
    const [k1] = keysOf(form);
    expect(footerStatus(readiness(form), null)).toEqual({ text: 'Confirm the invoice date', tone: 'attention', target: 'invoiceDate' });
    const signed = { ...form, dateConfirmed: true };
    expect(footerStatus(readiness(signed), null)).toEqual({ text: 'All items ready', tone: 'ready', target: null });
    const noSku = { ...signed, lines: [{ ...form.lines[0]!, sku: null }, ...form.lines.slice(1)] };
    expect(footerStatus(readiness(noSku), null)).toEqual({ text: '1 item needs attention', tone: 'attention', target: `line:${k1}:row` });
    expect(footerStatus(readiness({ ...signed, lines: [] }), null)).toMatchObject({ text: 'Add at least one item', target: 'items' });
    expect(footerStatus(readiness(signed), { message: 'Offline', target: null })).toEqual({ text: 'Offline', tone: 'error', target: null });
  });
});

describe('search', () => {
  const lines = draftForm().lines;
  it('matches the name on the bill or the SKU, ignoring case', () => {
    expect(filterLines(lines, '21/25').map((l) => l.lineNo)).toEqual([2]);
    expect(filterLines(lines, 'prawns 30/40').map((l) => l.lineNo)).toEqual([3]);
    expect(filterLines(lines, 'PRAWNS')).toHaveLength(3);
    expect(filterLines(lines, '  ')).toHaveLength(3);
    expect(filterLines(lines, 'crab')).toHaveLength(0);
    expect(filterLines([blankLine()], 'x')).toHaveLength(0);
  });
});

describe('the form and what is sent', () => {
  it('builds the form from the draft with editable numbers; delivery 0 shows as blank', () => {
    const form = draftForm();
    expect(form.supplier).toEqual({ id: 41, name: 'Kosta Delights - Sea Food' });
    expect(form.invoiceDate).toBe('2026-09-01');
    expect(form.stockInDate).toBe('2026-10-03');
    expect(form.lines.map((l) => [l.lineNo, l.quantity, l.amount, l.tax])).toEqual([
      [1, '2', '1120', '0'], [2, '2', '900', '0'], [3, '2', '800', '0'],
    ]);
    expect(form.delivery).toBe('');
    expect(form.draftDelivery).toBe('');
    expect(form.taxOverride).toBe('');
  });

  it('gives every line its own client key, distinct from its bill line number', () => {
    const form = draftForm();
    const keys = keysOf(form);
    expect(new Set(keys).size).toBe(3);
    for (const k of keys) expect(k).toMatch(/^l-[0-9a-f]{8}-[0-9a-z]+$/);
    expect(newLineKey()).not.toBe(newLineKey());
    // Two builds of the same bill never share keys (a rebuilt form remounts its cards).
    expect(keysOf(draftForm()).some((k) => keys.includes(k))).toBe(false);
  });

  it('keeps a date it cannot read, and says so', () => {
    const form = formFromReview(kostaDraft({ invoiceDate: 'first of Sept' }), false);
    expect(form.invoiceDate).toBe('');
    expect(form.invoiceDateRead).toBe('first of Sept');
    expect(buildReviewPayload(form, 1).invoiceDate).toBe('first of Sept');
  });

  it('sends exactly what the server reads: no totals, no fromInvoice, no deliveryOverridden', () => {
    const form = draftForm();
    form.lines[0] = { ...form.lines[0]!, amount: '1100.5', ignoredDeviation: true };
    const payload = buildReviewPayload({ ...form, delivery: '40' }, 3);
    expect(Object.keys(payload).sort()).toEqual([
      'delivery', 'invoiceDate', 'invoiceNumber', 'items', 'paymentStatus', 'stockInDate', 'supplier', 'taxOverride', 'version',
    ]);
    expect(payload.version).toBe(3);
    expect(payload.delivery).toBe('40.00');
    expect(payload.taxOverride).toBeNull();
    expect(payload.items[0]).toEqual({
      lineNo: 1,
      sku: { id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360.00' },
      quantity: '2', unit: 'KG', amount: '1100.50', tax: '0.00', ignoredDeviation: true,
    });
  });

  it('a SKU price keeps up to four places', () => {
    expect(skuPriceOrNull('0.4525')).toBe('0.4525');
    expect(skuPriceOrNull(360)).toBe('360.00');
    expect(skuPriceOrNull('12.1')).toBe('12.10');
    expect(skuPriceOrNull('12.125')).toBe('12.125');
    expect(skuPriceOrNull('0.45255')).toBe('0.4526');
    expect(skuPriceOrNull(null)).toBeNull();
  });

  it('an added line goes out with lineNo null; blanks as null and text trimmed', () => {
    const form = { ...draftForm(), invoiceNumber: '  ', supplier: { id: null, name: '  Kosta  ' } };
    form.lines = [...form.lines, { ...blankLine(), quantity: '', amount: '' }];
    const payload = buildReviewPayload(form, 1);
    expect(payload.invoiceNumber).toBeNull();
    expect(payload.supplier).toEqual({ id: null, name: 'Kosta' });
    expect(payload.items.map((i) => i.lineNo)).toEqual([1, 2, 3, null]);
    expect(payload.items[3]).toEqual({ lineNo: null, sku: null, quantity: null, unit: null, amount: null, tax: null, ignoredDeviation: false });
  });

  it('dirty only when what would be sent (or the date sign-off) differs', () => {
    const base = draftForm();
    expect(isDirty({ ...base }, base)).toBe(false);
    const same = { ...base, lines: base.lines.map((l) => ({ ...l, amount: `${l.amount}.00`, key: `${l.key}x` })) };
    expect(isDirty(same, base)).toBe(false); // "1120" and "1120.00" are the same money; keys are not sent
    expect(isDirty({ ...base, invoiceNumber: '1632' }, base)).toBe(true);
    expect(isDirty({ ...base, dateConfirmed: true }, base)).toBe(true);
    expect(isDirty({ ...base, lines: base.lines.slice(1) }, base)).toBe(true);
    expect(isDirty({ ...base, taxOverride: '10' }, base)).toBe(true);
  });

  it('starts from the saved review when there is one; Start over goes to the draft (always sent)', () => {
    const saved = kostaDraft({ invoiceNumber: '9999', delivery: '30.00', deliveryOverridden: true, reviewedAt: '2026-10-03T04:00:00Z' });
    const inv = kostaInvoice({ review: saved });
    const form = formFromInvoice(inv)!;
    expect(form.invoiceNumber).toBe('9999');
    expect(form.dateConfirmed).toBe(true);
    expect(form.delivery).toBe('30');
    expect(form.draftDelivery).toBe(''); // Reset goes to the bill's figure, not the saved one
    expect(deliveryChanged(form)).toBe(true);
    const again = formFromDraft(inv)!;
    expect(again.invoiceNumber).toBe('1631');
    expect(again.dateConfirmed).toBe(false);
    expect(formFromInvoice(kostaInvoice({ draft: null }))).toBeNull();
    expect(formFromDraft(kostaInvoice({ draft: null }))).toBeNull();
  });

  it('a saved review keeps null lineNo for its added lines (never a made-up number)', () => {
    const items = [...kostaDraft().items, {
      lineNo: null, fromInvoice: null, sku: { id: null, name: 'Ice', unit: 'KG', unitPrice: null },
      quantity: '1', unit: 'KG', amount: '99.99', tax: '0.00', ignoredDeviation: false,
    }];
    const form = formFromInvoice(kostaInvoice({ review: kostaDraft({ items, reviewedAt: '2026-10-03T04:00:00Z' }) }))!;
    expect(form.lines.map((l) => l.lineNo)).toEqual([1, 2, 3, null]);
    expect(buildReviewPayload(form, 4).items.map((i) => i.lineNo)).toEqual([1, 2, 3, null]);
  });

  it('the bill-level tax: pre-filled from the draft, Reset goes back to it, sent as typed', () => {
    const inv = kostaInvoice({ draft: kostaDraft({ taxOverride: '180.00' }) });
    const form = formFromInvoice(inv)!;
    expect(form.taxOverride).toBe('180');
    expect(form.draftTaxOverride).toBe('180');
    expect(taxOverrideChanged(form)).toBe(false);
    expect(buildReviewPayload(form, 3).taxOverride).toBe('180.00');
    expect(taxOverrideChanged({ ...form, taxOverride: '' })).toBe(true);
    expect(buildReviewPayload({ ...form, taxOverride: '' }, 3).taxOverride).toBeNull();
    expect(buildReviewPayload({ ...form, taxOverride: '200.5' }, 3).taxOverride).toBe('200.50');
  });

  it('the SKU suggestion is the reading’s match for that bill line, never the owner’s choice', () => {
    const inv = kostaInvoice({ review: kostaDraft({ items: kostaDraft().items.map((i) => ({ ...i, sku: { id: 900, name: 'Mine', unit: 'KG', unitPrice: null } })) }) });
    expect(matchedSku(inv, 2)).toEqual({ id: 502, name: 'PRAWNS 21/25', unit: 'KG', unitPrice: '300.00' });
    expect(matchedSku(inv, null)).toBeNull();
    expect(matchedSku(inv, 9)).toBeNull();
  });

  it('a blank added line is recognised (removed when Add SKU is cancelled)', () => {
    expect(isBlankLine(blankLine())).toBe(true);
    expect(isBlankLine({ ...blankLine(), quantity: '1' })).toBe(false);
    expect(isBlankLine(draftForm().lines[0]!)).toBe(false);
  });

  it('tells its own save from someone else’s after a 409 (the saved review is what was sent)', () => {
    const form = { ...draftForm(), dateConfirmed: true };
    form.lines = [...form.lines, { ...blankLine(), sku: { id: null, name: 'Ice', unit: null, unitPrice: null }, quantity: '1', amount: '99.99' }];
    const sent = buildReviewPayload(form, 3);
    // What the server keeps: numbers as JSON numbers and other scales, tax 0 for a blank, the SKU's unit.
    const asSaved = kostaDraft({
      items: [
        ...kostaDraft().items.map((i) => ({ ...i, quantity: '2.000', amount: `${i.amount}0` })),
        { lineNo: null, fromInvoice: null, sku: { id: null, name: 'Ice', unit: null, unitPrice: null }, quantity: '1', unit: null, amount: '99.990', tax: '0.00', ignoredDeviation: false },
      ],
      invoiceDate: '2026-09-01', delivery: '0.0', reviewedAt: '2026-10-03T04:00:00Z',
    });
    expect(reviewMatchesPayload(asSaved, sent)).toBe(true);
    expect(reviewMatchesPayload({ ...asSaved, invoiceNumber: '7777' }, sent)).toBe(false);
    expect(reviewMatchesPayload(null, sent)).toBe(false);
  });
});

describe('server field errors', () => {
  const sent = ['a', 'b', 'c'];
  it('maps paths to inputs, through the keys of the lines as sent', () => {
    expect(fieldForPath('items[0].quantity', sent)).toBe('line:a:quantity');
    expect(fieldForPath('items[2].sku.name', sent)).toBe('line:c:sku');
    expect(fieldForPath('items[1].ignoredDeviation', sent)).toBe('line:b:price');
    expect(fieldForPath('items[1]', sent)).toBe('line:b:row');
    expect(fieldForPath('items[1].lineNo', sent)).toBe('line:b:row');
    expect(fieldForPath('items[7].amount', sent)).toBe('items');
    expect(fieldForPath('supplier.name', sent)).toBe('supplier');
    expect(fieldForPath('stockInDate', sent)).toBe('stockInDate');
    expect(fieldForPath('taxOverride', sent)).toBe('taxOverride');
    expect(fieldForPath('delivery', sent)).toBe('delivery');
    expect(fieldForPath('version', sent)).toBeNull();
    expect(fieldForPath('review.invoiceNumber', sent)).toBe('invoiceNumber');
    expect(fieldForPath('somethingElse', sent)).toBeNull();
  });

  it('reads details.fields as a map or a list; unknown paths go to the top', () => {
    const asMap = new ApiError({
      code: 'VALIDATION_ERROR', message: 'Check the form', status: 400,
      details: { fields: { 'items[0].quantity': 'Must be above zero', 'supplier.name': ['Required', 'Too short'], foo: 'Odd' } },
    });
    expect(fieldErrorsFrom(asMap, sent)).toEqual({
      fields: { 'line:a:quantity': 'Must be above zero', supplier: 'Required' },
      other: ['Odd'],
    });
    const asList = new ApiError({
      code: 'VALIDATION_ERROR', message: 'Check the form', status: 400,
      details: { fields: [{ field: 'stockInDate', message: 'Pick a date' }, { path: 'items[1].tax', message: 'Too much' }] },
    });
    expect(fieldErrorsFrom(asList, ['x', 'y']).fields).toEqual({ stockInDate: 'Pick a date', 'line:y:tax': 'Too much' });
  });

  it('a 400 without details.fields (MALFORMED_REQUEST, or a whole-body VALIDATION_ERROR) is one plain message', () => {
    const plain = new ApiError({ code: 'VALIDATION_ERROR', message: 'Bad review', status: 400 });
    expect(fieldErrorsFrom(plain, sent)).toEqual({ fields: {}, other: ['Bad review'] });
    const malformed = new ApiError({ code: 'MALFORMED_REQUEST', message: '', status: 400 });
    expect(fieldErrorsFrom(malformed, sent).other).toEqual(['This review could not be saved. Check it and try again.']);
    expect(fieldErrorsFrom(new Error('x'), sent)).toEqual({ fields: {}, other: [] });
  });

  it('finds the first error top to bottom', () => {
    const lines = [{ key: 'd' }, { key: 'a' }];
    expect(firstErrorField({ 'line:a:amount': 'x', delivery: 'y' }, lines)).toBe('line:a:amount');
    expect(firstErrorField({ 'line:a:amount': 'x', 'line:d:tax': 'z' }, lines)).toBe('line:d:tax');
    expect(firstErrorField({ delivery: 'y', supplier: 's' }, lines)).toBe('supplier');
    expect(firstErrorField({ delivery: 'y', taxOverride: 't' }, lines)).toBe('taxOverride');
    expect(firstErrorField({ delivery: 'y' }, lines)).toBe('delivery');
    expect(firstErrorField({}, lines)).toBeNull();
  });
});

describe('dates', () => {
  it.each([
    ['2026-09-01', '2026-09-01'],
    ['01/09/26', '2026-09-01'],
    ['01/09/2026', '2026-09-01'],
    ['1-9-2026', '2026-09-01'],
    ['01.09.2026', '2026-09-01'],
    ['04-Sep-2026', '2026-09-04'],
    ['04 Sep 2026', '2026-09-04'],
    ['4 Sept 2026', '2026-09-04'],
    ['31/02/2026', ''],
    ['2026-13-01', ''],
    ['someday', ''],
    ['', ''],
  ])('%p → %p', (text, iso) => {
    expect(parseToISODate(text)).toBe(iso);
  });

  const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const NAME_CASES: [string, number][] = [
    ...FULL.map((n, i): [string, number] => [n, i + 1]),
    ...FULL.map((n, i): [string, number] => [n.slice(0, 3), i + 1]),
    ['Sept', 9],
  ];
  const forms: ((w: string, mm: string) => [string, string])[] = [
    (w, mm) => [`04 ${w} 2026`, `2026-${mm}-04`],
    (w, mm) => [`04-${w}-2026`, `2026-${mm}-04`],
    (w, mm) => [`4th ${w} 2026`, `2026-${mm}-04`],
    (w, mm) => [`4 ${w}. 26`, `2026-${mm}-04`],
    (w, mm) => [`${w} 4, 2026`, `2026-${mm}-04`],
    (w, mm) => [`${w} 4 2026`, `2026-${mm}-04`],
    (w, mm) => [`${w} 4th, 2026`, `2026-${mm}-04`],
  ];
  const nameRows = NAME_CASES.flatMap(([w, m]) => {
    const mm = String(m).padStart(2, '0');
    return [w, w.toLowerCase(), w.toUpperCase()].flatMap((word) => forms.map((f) => f(word, mm)));
  });
  it.each(nameRows)('month names: %p → %p', (text, iso) => {
    expect(parseToISODate(text)).toBe(iso);
  });

  it.each([
    '04 Marchx 2026', '04 Foo 2026', '04 Ma 2026', '04 Jux 2026', 'Marchx 4 2026', 'Foo 4, 2026', 'Ma 4 2026',
    '4 Septembers 2026', '31 April 2026', 'April 31, 2026', '30 February 2026', '0 March 2026', '4xx March 2026',
  ])('refuses %p', (text) => {
    expect(parseToISODate(text)).toBe('');
  });

  it('formats and validates', () => {
    expect(formatDay('2026-10-03')).toBe('3 Oct 2026');
    expect(formatDay('nope')).toBe('');
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
  });

  it('lays out a month Monday first', () => {
    const grid = monthGrid(2026, 9); // 1 Sep 2026 is a Tuesday
    expect(grid[0]).toBeNull();
    expect(grid[1]).toBe('2026-09-01');
    expect(grid.filter(Boolean)).toHaveLength(30);
    expect(grid.length % 7).toBe(0);
    expect(shiftMonth(2026, 12, 1)).toEqual([2027, 1]);
    expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12]);
  });

  it('today is the day in India', () => {
    expect(todayIST(new Date('2026-10-02T19:00:00Z'))).toBe('2026-10-03');
    expect(todayIST(new Date('2026-10-02T18:00:00Z'))).toBe('2026-10-02');
  });
});

describe('new SKU sheet', () => {
  it('starts on the line’s unit when it is one of ours, else KG', () => {
    expect(defaultSkuUnit('kg')).toBe('KG');
    expect(defaultSkuUnit('Kgs')).toBe('KG');
    expect(defaultSkuUnit('ltr')).toBe('LTR');
    expect(defaultSkuUnit('pc')).toBe('PCS');
    expect(defaultSkuUnit('PKT')).toBe('PACK');
    expect(defaultSkuUnit('bundle')).toBe('KG');
    expect(defaultSkuUnit(null)).toBe('KG');
  });

  it('needs a name; a price is optional but above zero', () => {
    expect(newSkuProblems('', '')).toEqual({ name: expect.any(String) });
    expect(newSkuProblems('Prawns', '0')).toEqual({ price: expect.any(String) });
    expect(newSkuProblems('Prawns', '')).toBeNull();
    expect(newSku(' Prawns jumbo ', 'KG', '650.5')).toEqual({ id: null, name: 'Prawns jumbo', unit: 'KG', unitPrice: '650.50' });
    expect(newSku('Lemons', 'DOZEN', '')).toEqual({ id: null, name: 'Lemons', unit: 'DOZEN', unitPrice: null });
  });
});
