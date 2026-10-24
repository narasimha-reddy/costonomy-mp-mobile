import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { buildReviewPayload, fieldErrorsFrom, formFromInvoice } from '@/lib/wallet/billReview';
import {
  fetchSkuLookup, fetchSupplierLookup, fetchWalletInvoice, mapInvoice, mapReview, saveWalletInvoiceReview,
} from '@/services/wallet';
import { kostaInvoice } from './fixtures/billReview';

jest.mock('@/lib/api/client', () => ({ apiRequest: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe('invoice with a review', () => {
  it('normalises the draft and review: money as strings, ids as numbers, lists present', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({
      status: 'READ', pages: null, version: '4',
      draft: {
        supplier: { id: '41', name: 'Kosta' }, invoiceNumber: 1631, invoiceDate: '01/09/26', stockInDate: '2026-10-03',
        paymentStatus: 'WHATEVER',
        items: [{ lineNo: 1, fromInvoice: { name: '16/20 prawns', quantity: 2, unit: 'KG', unitPrice: 560, total: 1120 },
          sku: { id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: 360 }, quantity: 2, unit: 'KG', amount: 1120, tax: 0,
          lineTotal: 1120, itemPrice: 560, deviation: 'ABOVE' },
        { lineNo: null, fromInvoice: null, sku: { id: null, name: 'Ice', unit: 'KG', unitPrice: 0.4525 }, quantity: 1, unit: 'KG', amount: 99.99, tax: 0 }],
        delivery: 0, deliveryOverridden: true, taxOverride: 180, subtotal: 2820, tax: 0, total: '2820.0000',
      },
      review: null,
    });
    const invoice = await fetchWalletInvoice(7, 184, 'tok');
    expect(invoice.version).toBe(4);
    expect(invoice.pages).toEqual([]);
    expect(invoice.review).toBeNull();
    expect(invoice.draft).toMatchObject({
      supplier: { id: 41, name: 'Kosta' },
      invoiceNumber: '1631',
      paymentStatus: 'PENDING',
      deliveryOverridden: true,
      taxOverride: '180',
      delivery: '0',
      total: '2820.0000',
    });
    expect(invoice.draft?.items[0]).toEqual({
      lineNo: 1,
      fromInvoice: { name: '16/20 prawns', quantity: '2', unit: 'KG', unitPrice: '560', total: '1120' },
      sku: { id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360' },
      quantity: '2', unit: 'KG', amount: '1120', tax: '0', ignoredDeviation: false,
    });
    // An added line keeps lineNo null (never its position, which would clash with a bill line).
    expect(invoice.draft?.items[1]).toMatchObject({ lineNo: null, fromInvoice: null, sku: { id: null, name: 'Ice', unitPrice: '0.4525' } });
  });

  it('an older server (no version, draft or review) still maps', () => {
    const mapped = mapInvoice({ status: 'READ', pages: [] } as never);
    expect(mapped).toMatchObject({ version: 0, draft: null, review: null });
    expect(mapReview(null)).toBeNull();
    expect(mapReview({ items: 'nope' })?.items).toEqual([]);
    expect(mapReview({ supplier: { id: null, name: null } })?.supplier).toEqual({ id: null, name: '' });
  });
});

describe('saving a review', () => {
  const form = formFromInvoice(kostaInvoice())!;
  const payload = buildReviewPayload(form, 3);

  it('PUTs the body (no totals) with its key and signal, never retried by the client layer, and maps the answer', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({
      status: 'READ', pages: [], version: 4, draft: null,
      review: { ...payload, subtotal: 2820, tax: 0, total: 2820, reviewedAt: '2026-10-03T04:00:00Z' },
    });
    const signal = new AbortController().signal;
    const saved = await saveWalletInvoiceReview(7, '184', payload, 'tok', { idempotencyKey: 'k-1', signal });
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/outlets/7/wallet/transactions/184/invoice/review', {
      method: 'PUT', token: 'tok', body: payload, idempotencyKey: 'k-1', signal, retries: 0,
    });
    const body = (apiRequest as jest.Mock).mock.calls[0][1].body;
    expect(body).not.toHaveProperty('subtotal');
    expect(body.version).toBe(3);
    expect(saved.review?.total).toBe('2820');
    expect(saved.version).toBe(4);
  });

  it('passes a 400 with field details through, and they map onto the inputs', async () => {
    const error = new ApiError({
      code: 'VALIDATION_ERROR', message: 'Check the review', status: 400,
      details: { fields: { 'items[1].quantity': 'Must be above zero', stockInDate: 'Pick a date' } },
    });
    (apiRequest as jest.Mock).mockRejectedValue(error);
    const caught = await saveWalletInvoiceReview(7, 184, payload, 'tok').catch((e) => e);
    expect(caught).toBe(error);
    const keys = form.lines.map((l) => l.key);
    expect(fieldErrorsFrom(caught, keys).fields).toEqual({
      [`line:${keys[1]}:quantity`]: 'Must be above zero', stockInDate: 'Pick a date',
    });
  });

  it('passes 409 INVOICE_CHANGED through untouched', async () => {
    (apiRequest as jest.Mock).mockRejectedValue(new ApiError({ code: 'INVOICE_CHANGED', message: 'Changed', status: 409 }));
    await expect(saveWalletInvoiceReview(7, 184, payload, 'tok')).rejects.toMatchObject({ status: 409, code: 'INVOICE_CHANGED' });
  });
});

describe('lookups', () => {
  const calls = () => (apiRequest as jest.Mock).mock.calls;

  it('asks for suppliers with q and limit only, and drops unusable rows (no city)', async () => {
    (apiRequest as jest.Mock).mockResolvedValue([
      { id: 41, name: 'Kosta Delights - Sea Food', city: 'Hyderabad' }, { id: null, name: 'x' }, { id: 9, name: ' ' }, { id: '12', name: 'Fresh Catch' },
    ]);
    const rows = await fetchSupplierLookup(7, ' kosta & co ', 'tok');
    expect(calls()[0][0]).toBe('/api/v1/outlets/7/invoice-lookups/suppliers?q=kosta%20%26%20co&limit=20');
    expect(calls()[0][1]).toMatchObject({ token: 'tok', retries: 0 });
    expect(rows).toEqual([{ id: 41, name: 'Kosta Delights - Sea Food' }, { id: 12, name: 'Fresh Catch' }]);
  });

  it('asks for SKUs without any supplierId; prices come back as strings', async () => {
    (apiRequest as jest.Mock).mockResolvedValue([{ id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: 360, categoryName: 'Seafood' }]);
    const rows = await fetchSkuLookup(7, 'prawn', 'tok', { limit: 5 });
    expect(calls()[0][0]).toBe('/api/v1/outlets/7/invoice-lookups/skus?q=prawn&limit=5');
    expect(calls()[0][0]).not.toContain('supplierId');
    expect(rows).toEqual([{ id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360', categoryName: 'Seafood' }]);
    await fetchSkuLookup(7, '', 'tok');
    expect(calls()[1][0]).toBe('/api/v1/outlets/7/invoice-lookups/skus?limit=20');
  });

  it('cuts q at 60 characters', async () => {
    (apiRequest as jest.Mock).mockResolvedValue([]);
    const long = `  ${'a'.repeat(80)}  `;
    await fetchSupplierLookup(7, long, 'tok');
    await fetchSkuLookup(7, long, 'tok');
    expect(calls()[0][0]).toContain(`q=${'a'.repeat(60)}&`);
    expect(calls()[0][0]).not.toContain('a'.repeat(61));
    expect(calls()[1][0]).toContain(`q=${'a'.repeat(60)}&`);
    expect(calls()[1][0]).not.toContain('a'.repeat(61));
  });

  it('passes the abort signal and never retries', async () => {
    (apiRequest as jest.Mock).mockResolvedValue([]);
    const { signal } = new AbortController();
    await fetchSupplierLookup(7, 'k', 'tok', { signal });
    await fetchSkuLookup(7, 'k', 'tok', { signal });
    expect(calls()[0][1]).toEqual({ token: 'tok', signal, retries: 0 });
    expect(calls()[1][1]).toEqual({ token: 'tok', signal, retries: 0 });
  });

  it('a 503 or 429 fails after one call (no retry, no waiting)', async () => {
    (apiRequest as jest.Mock).mockRejectedValue(new ApiError({ code: 'PROVIDER_UNAVAILABLE', message: 'Down', status: 503 }));
    await expect(fetchSupplierLookup(7, 'k', 'tok')).rejects.toMatchObject({ status: 503 });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    (apiRequest as jest.Mock).mockRejectedValue(new ApiError({ code: 'RATE_LIMITED', message: 'Slow', status: 429, retryAfterSeconds: 12 }));
    await expect(fetchSkuLookup(7, 'k', 'tok')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 12 });
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('a non-list answer is no rows', async () => {
    (apiRequest as jest.Mock).mockResolvedValueOnce(null);
    await expect(fetchSkuLookup(7, 'k', 'tok')).resolves.toEqual([]);
  });
});

describe('mapReview reviewedBy (L4)', () => {
  it('reads reviewedBy from the wire as a number, numeric string, or null', () => {
    expect(mapReview({ reviewedBy: 12 })?.reviewedBy).toBe(12);
    expect(mapReview({ reviewedBy: '12' })?.reviewedBy).toBe(12);
    expect(mapReview({})?.reviewedBy).toBeNull();
    expect(mapReview({ reviewedBy: 'abc' })?.reviewedBy).toBeNull();
  });
});
