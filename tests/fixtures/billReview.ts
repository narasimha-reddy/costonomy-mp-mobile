import type { InvoiceReview, ReviewLine, WalletInvoice } from '@/models/wallet';

/**
 * The draft is always sent with a READ or UNREADABLE bill, also beside a saved review (the contract
 * from the API review fixes). `kostaInvoice({ review })` therefore keeps the draft.
 *
 * The bill from the cost app's reference screen: Kosta Delights, three lines of prawns, ₹2,820.
 * Line 1 (16/20 at ₹560/KG against the SKU's ₹360) deviates by more than 50%; lines 2 and 3 do not.
 */
export function kostaLines(): ReviewLine[] {
  return [
    {
      lineNo: 1,
      fromInvoice: { name: '16/20 prawns', quantity: '2', unit: 'KG', unitPrice: '560.00', total: '1120.00' },
      sku: { id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360.00' },
      quantity: '2', unit: 'KG', amount: '1120.00', tax: '0.00', ignoredDeviation: false,
    },
    {
      lineNo: 2,
      fromInvoice: { name: '21/25 prawns', quantity: '2', unit: 'KG', unitPrice: '450.00', total: '900.00' },
      sku: { id: 502, name: 'PRAWNS 21/25', unit: 'KG', unitPrice: '300.00' },
      quantity: '2', unit: 'KG', amount: '900.00', tax: '0.00', ignoredDeviation: false,
    },
    {
      lineNo: 3,
      fromInvoice: { name: '30/50 prawns', quantity: '2', unit: 'KG', unitPrice: '400.00', total: '800.00' },
      sku: { id: 503, name: 'Prawns 30/40', unit: 'KG', unitPrice: '270.00' },
      quantity: '2', unit: 'KG', amount: '800.00', tax: '0.00', ignoredDeviation: false,
    },
  ];
}

export function kostaDraft(over: Partial<InvoiceReview> = {}): InvoiceReview {
  return {
    supplier: { id: 41, name: 'Kosta Delights - Sea Food' },
    invoiceNumber: '1631',
    invoiceDate: '01/09/26',
    stockInDate: '2026-10-03',
    paymentStatus: 'PENDING',
    items: kostaLines(),
    delivery: '0.00',
    deliveryOverridden: false,
    taxOverride: null,
    subtotal: '2820.00',
    tax: '0.00',
    total: '2820.00',
    reviewedAt: null,
    ...over,
  };
}

export function kostaInvoice(over: Partial<WalletInvoice> = {}, pageUrl = 'https://cdn.test/p1?sig=a'): WalletInvoice {
  return {
    status: 'READ',
    createdAt: '2026-10-03T03:41:00Z',
    pageCount: 1,
    attempts: 1,
    error: null,
    pages: [{
      page: 1, contentType: 'image/jpeg', sizeBytes: 812_000, url: pageUrl,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }],
    reading: {
      vendorName: 'KOSTA Delights', vendorAddress: 'Plot No. 28&29, Khanamet, Hyderabad', invoiceNumber: '1631',
      invoiceDate: '01/09/26', customerName: 'Delicia', currency: 'INR',
      items: [
        {
          name: '16/20 prawns', quantity: 2, unit: 'KG', unitPrice: 560, total: 1120,
          skuMatch: { id: 501, name: 'Prawns 16/20', unit: 'KG', unitPrice: '360.00', categoryName: 'Seafood' },
        },
        {
          name: '21/25 prawns', quantity: 2, unit: 'KG', unitPrice: 450, total: 900,
          skuMatch: { id: 502, name: 'PRAWNS 21/25', unit: 'KG', unitPrice: '300.00', categoryName: 'Seafood' },
        },
        {
          name: '30/50 prawns', quantity: 2, unit: 'KG', unitPrice: 400, total: 800,
          skuMatch: { id: 503, name: 'Prawns 30/40', unit: 'KG', unitPrice: '270.00', categoryName: 'Seafood' },
        },
      ],
      subtotal: 2820, tax: null, delivery: null, total: 2820,
      supplierMatch: { id: 41, name: 'Kosta Delights - Sea Food' },
    },
    check: { paid: 2820, billTotal: 2820, matches: true, difference: 0 },
    version: 3,
    draft: kostaDraft(),
    review: null,
    ...over,
  };
}
