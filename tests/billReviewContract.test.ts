import { buildReviewPayload, formFromInvoice, newSku, todayIST, type FormLine, type ReviewForm } from '@/lib/wallet/billReview';
import { initReviewState, reviewReducer } from '@/lib/wallet/billReviewReducer';
import type { WalletInvoice } from '@/models/wallet';
import { mapInvoice } from '@/services/wallet';
import {
  itInvoiceRead, itInvoiceReviewed, itInvoiceUnreadable, serverFieldErrors, unreadFields,
} from './fixtures/invoiceReviewContract';

/**
 * C1 and the K-items, against the API's own shapes (`WalletInvoiceReviewIT` and the DTOs): the body the
 * app builds must be one the server accepts, carry only what it reads, and keep the bill lines' numbers
 * while sending null for lines the owner added.
 */

const today = todayIST();
const asInvoice = (raw: unknown) => mapInvoice(raw as WalletInvoice);
const formOf = (raw: unknown): ReviewForm => formFromInvoice(asInvoice(raw))!;
const accepted = (body: unknown, readItems: number) => serverFieldErrors(body as Record<string, unknown>, readItems, today);

/** Add a line with Add SKU and fill it in as the owner would (SKU, quantity, amount). */
function addFilledLine(form: ReviewForm, fill: Partial<FormLine>): ReviewForm {
  const added = reviewReducer(initReviewState(form), { type: 'addLine', key: `added-${form.lines.length}` }).form;
  return { ...added, lines: added.lines.map((l) => (l.fromInvoice == null && l.sku == null ? { ...l, ...fill } : l)) };
}

describe('the review body against the API contract', () => {
  it('normal save: the draft as read, signed off, line 1’s price ignored — accepted, and only fields the server reads', () => {
    const raw = itInvoiceRead(today);
    const form = formOf(raw);
    const signed = { ...form, dateConfirmed: true, lines: form.lines.map((l, i) => (i === 0 ? { ...l, ignoredDeviation: true } : l)) };
    const body = buildReviewPayload(signed, raw.version);
    expect(accepted(body, 3)).toEqual({});
    expect(unreadFields(body as never)).toEqual([]);
    expect(body).toEqual({
      version: 2,
      supplier: { id: 2001, name: 'Kosta Delights - Sea Food' },
      invoiceNumber: '1631',
      invoiceDate: '2026-09-04',
      stockInDate: today,
      paymentStatus: 'PENDING',
      items: [
        { lineNo: 1, sku: { id: 9465, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360.00' }, quantity: '2', unit: 'KG', amount: '1120.00', tax: '0.00', ignoredDeviation: true },
        { lineNo: 2, sku: { id: 152, name: 'PRAWNS 21/25', unit: 'KG', unitPrice: '300.00' }, quantity: '2', unit: 'KG', amount: '900.00', tax: '0.00', ignoredDeviation: false },
        { lineNo: 3, sku: { id: 9001, name: 'Prawns 30/40', unit: 'KG', unitPrice: '270.00' }, quantity: '2', unit: 'KG', amount: '800.00', tax: '0.00', ignoredDeviation: false },
      ],
      delivery: null,
      taxOverride: null,
    });
  });

  it('a line the owner added goes out with lineNo null and is accepted (IT saveReview: remove, re-match, add)', () => {
    const raw = itInvoiceRead(today);
    let form = formOf(raw);
    form = {
      ...form,
      dateConfirmed: true,
      paymentStatus: 'COMPLETED',
      delivery: '50',
      lines: form.lines
        .filter((l) => l.lineNo !== 2)
        .map((l) => (l.lineNo === 1 ? { ...l, ignoredDeviation: true, tax: '56.10' }
          : l.lineNo === 3 ? { ...l, sku: { id: 9002, name: 'Prawns 30/50', unit: 'KG', unitPrice: '250' } } : l)),
    };
    form = addFilledLine(form, { sku: newSku('Ice', 'KG', ''), unit: 'KG', quantity: '1', amount: '99.99' });
    const body = buildReviewPayload(form, raw.version);
    expect(accepted(body, 3)).toEqual({});
    expect(unreadFields(body as never)).toEqual([]);
    const byLine = Object.fromEntries(body.items.map((i) => [String(i.lineNo), i]));
    expect(Object.keys(byLine).sort()).toEqual(['1', '3', 'null']);
    expect(byLine.null).toEqual({
      lineNo: null, sku: { id: null, name: 'Ice', unit: 'KG', unitPrice: null }, quantity: '1', unit: 'KG', amount: '99.99', tax: null, ignoredDeviation: false,
    });
    expect(byLine['3']?.sku).toEqual({ id: 9002, name: 'Prawns 30/50', unit: 'KG', unitPrice: '250.00' });
    expect(body).toMatchObject({ delivery: '50.00', paymentStatus: 'COMPLETED' });
  });

  it('an UNREADABLE bill: every line added by hand, all with lineNo null, accepted', () => {
    const raw = itInvoiceUnreadable(today);
    let form = formOf(raw);
    expect(form.lines).toEqual([]);
    form = { ...form, dateConfirmed: true, supplier: { id: null, name: 'Corner Fish Shop' } };
    form = addFilledLine(form, { sku: newSku('Prawns', 'KG', ''), unit: 'KG', quantity: '2.5', amount: '2800', tax: '20' });
    form = addFilledLine(form, { sku: newSku('Ice', 'KG', ''), unit: 'KG', quantity: '1', amount: '20' });
    const body = buildReviewPayload(form, raw.version);
    expect(accepted(body, 0)).toEqual({});
    expect(unreadFields(body as never)).toEqual([]);
    expect(body.items.map((i) => i.lineNo)).toEqual([null, null]);
    expect(body.supplier).toEqual({ id: null, name: 'Corner Fish Shop' });
  });

  it('a saved review with an added line, opened again and saved unchanged, is still accepted (K2)', () => {
    const raw = itInvoiceReviewed(today);
    const invoice = asInvoice(raw);
    expect(invoice.review?.items.map((i) => i.lineNo)).toEqual([1, 3, null]);
    expect(invoice.draft).not.toBeNull(); // sent beside the review
    const body = buildReviewPayload(formFromInvoice(invoice)!, raw.version);
    expect(accepted(body, 3)).toEqual({});
    expect(body.items.map((i) => i.lineNo)).toEqual([1, 3, null]);
  });

  it('the server port refuses what the old app sent (made-up line numbers, a repeated bill line)', () => {
    const raw = itInvoiceRead(today);
    const body = buildReviewPayload({ ...formOf(raw), dateConfirmed: true }, raw.version);
    expect(accepted({ ...body, items: [...body.items, { ...body.items[0], lineNo: 4 }] }, 3)).toEqual({
      'items[3].lineNo': 'This line is not on the bill.',
    });
    expect(accepted({ ...body, items: [...body.items, { ...body.items[0] }] }, 3)).toEqual({
      'items[3].lineNo': 'Each bill line can appear once.',
    });
  });
});
