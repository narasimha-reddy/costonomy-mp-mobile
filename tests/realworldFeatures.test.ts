import React from 'react';
import { sectionWarning } from '@/components/restaurant/CartSupplierSection';
import { weightAdjustmentCopy } from '@/lib/orders/catchWeight';
import { ORDER_PREPARING_WEIGHED_9_6, RECEIVING_APPLIED_NO_NOTE_YET } from './fixtures/catchWeightContract';
import {
  fetchRateSheet,
  recordDispatchWeights,
  updateRateSheet,
} from '@/services/supplier';
import { receiveOrder } from '@/services/trust';
import type { Intent } from '@/models/intent';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
  PROVIDER_GOOGLE: 'google',
}));

function jsonResponse(data: unknown, status = 200) {
  const body =
    status < 300
      ? { data, error: null, meta: {} }
      : { data: null, error: data, meta: {} };
  return {
    status,
    ok: status < 300,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mockFetch(...responses: Response[]) {
  const fn = jest.fn(async () => responses.shift() as Response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function lastCall(fn: jest.Mock) {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1] as unknown as [
    string,
    RequestInit,
  ];
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('Store Minimum Order Value (MOV) & Free Delivery Rules', () => {
  const baseDraft: Intent = {
    id: 1,
    reference: 'REQ-001',
    outletId: 10,
    outletName: 'Koramangala Kitchen',
    restaurantName: 'The Coastal Joint',
    outletLocality: 'Koramangala',
    outletCity: 'Bengaluru',
    distanceKm: '2.5',
    supplierStoreId: 20,
    storeName: 'Mandi Wholesalers',
    supplierName: 'Mandi Supply Co',
    directOrdersEnabled: true,
    status: 'DRAFT',
    fulfilment: 'AWAITING',
    source: 'DIRECT',
    clonedFromId: null,
    requestedDeliveryTime: null,
    preferredDeliveryDate: null,
    deliveryPreference: 'DELIVERY',
    notes: null,
    sentAt: null,
    responseDeadline: null,
    responseWindowSeconds: 1800,
    acceptedAt: null,
    orderCreationDeadline: null,
    orderCreationWindowSeconds: 1800,
    cancelledAt: null,
    expiredAt: null,
    createdAt: '2026-10-03T00:00:00Z',
    serverTime: '2026-10-03T00:00:00Z',
    editable: true,
    quantityEditable: true,
    revision: 1,
    withinOrderWindow: true,
    items: [],
    agreedValue: '800.00',
    agreedGst: '40.00',
    agreedTotal: '840.00',
    pricedComplete: true,
    priceChanged: false,
    acceptance: null,
    supplierOrderId: null,
    supplierOrderNumber: null,
    minOrderValue: '1000.00',
    freeDeliveryThreshold: '2000.00',
  };

  it('warns when the goods before GST are below the store minimum, saying both figures and no sum', () => {
    expect(sectionWarning(baseDraft)).toBe('Minimum order ₹1,000.00 before GST · items ₹800.00');
  });

  it('compares the goods before GST, as the server does, not the GST-inclusive total', () => {
    // Rs 800 of goods + GST is over Rs 1,000 with the delivery or a high rate, but the server still refuses it.
    const gstInflated: Intent = { ...baseDraft, agreedValue: '800.00', agreedGst: '250.00', agreedTotal: '1050.00' };
    expect(sectionWarning(gstInflated)).toBe('Minimum order ₹1,000.00 before GST · items ₹800.00');
  });

  it('returns no warning once the goods before GST reach the minimum', () => {
    expect(sectionWarning({ ...baseDraft, agreedValue: '1000.00', agreedGst: '50.00', agreedTotal: '1050.00' })).toBeNull();
    expect(sectionWarning({ ...baseDraft, agreedValue: '1250.00', agreedGst: '62.50', agreedTotal: '1312.50' })).toBeNull();
  });

  it('prioritises price change warning over MOV warning', () => {
    const repricedDraft: Intent = {
      ...baseDraft,
      items: [{ priceChanged: true } as never],
    };
    expect(sectionWarning(repricedDraft)).toBe('A price has changed');
  });

  it('prioritises missing price warning over MOV warning', () => {
    const unpricedDraft: Intent = {
      ...baseDraft,
      pricedComplete: false,
    };
    expect(sectionWarning(unpricedDraft)).toBe('Some items have no price');
  });
});

describe('Catch-Weight Weighing API Service', () => {
  it('posts scale weights to order weights endpoint', async () => {
    // The API's own response for a 9.6 kg reading on 10 kg accepted at Rs 100 + 5% GST: the buyer pays Rs 42 less.
    // Positive means a refund to the buyer (`SupplierOrder.weightAdjustmentAmount`); the old mock here had it negative.
    const fn = mockFetch(jsonResponse(ORDER_PREPARING_WEIGHED_9_6));

    const weights = [{ supplierOrderItemId: 301, dispatchedWeight: '9.6' }];

    const result = await recordDispatchWeights('test-token', 501, weights);

    expect(result.id).toBe(501);
    expect(Number(result.weightAdjustmentAmount)).toBe(42);
    expect(weightAdjustmentCopy(result.weightAdjustmentAmount)?.refund).toBe(true);
    expect(result.items[0]?.billableQuantity).toBe(9.6);

    const call = lastCall(fn);
    expect(call.url).toContain('/api/v1/supplier-orders/501/weights');
    expect(call.init.method).toBe('POST');
    expect(call.body).toEqual({ weights });
  });
});

describe('Morning Mandi Rate Sheet API Service', () => {
  it('fetches rate sheet for supplier store', async () => {
    const mockSheet = {
      supplierStoreId: 12,
      rows: [
        {
          skuId: 201,
          canonicalProductId: 1,
          productName: 'Paneer Fresh',
          skuName: 'Paneer Fresh 1kg',
          brandName: 'Amul',
          grade: 'Grade A',
          isCatchWeight: true,
          packSize: '1.00',
          packUnit: 'kg',
          mrp: '420.00',
          sellingPrice: '380.00',
          gstRate: '5.00',
          availability: 'AVAILABLE',
          availableQuantity: '50.00',
          updatedAt: '2026-10-03T05:00:00Z',
        },
      ],
    };

    const fn = mockFetch(jsonResponse(mockSheet));
    const sheet = await fetchRateSheet('test-token', 12);

    expect(sheet.supplierStoreId).toBe(12);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]!.productName).toBe('Paneer Fresh');
    expect(sheet.rows[0]!.isCatchWeight).toBe(true);

    const call = lastCall(fn);
    expect(call.url).toContain('/api/v1/supplier-stores/12/rate-sheet');
  });

  it('updates rate sheet with modified items', async () => {
    const updateResponse = {
      updatedCount: 2,
      rows: [],
    };
    const fn = mockFetch(jsonResponse(updateResponse));

    const payload = [
      { skuId: 201, sellingPrice: '375.00', mrp: '420.00' },
      { skuId: 202, sellingPrice: '210.00', availability: 'OUT_OF_STOCK' },
    ];

    const res = await updateRateSheet('test-token', 12, payload);
    expect(res.updatedCount).toBe(2);

    const call = lastCall(fn);
    expect(call.url).toContain('/api/v1/supplier-stores/12/rate-sheet');
    expect(call.init.method).toBe('POST');
    expect(call.body).toEqual({ rows: payload });
  });
});

describe('Doorstep Receiving with Instant Credit Note', () => {
  it('submits doorstep receiving with line rejection reasons', async () => {
    // The API's response for 0.1 kg of the weighed 9.6 missing: Rs 10.50 back, no credit note yet (it is issued after the
    // check-in commits, and not at all while tax invoices are off). The old mock invented a 'CN-MP-101-01'.
    const mockReceiving = RECEIVING_APPLIED_NO_NOTE_YET;
    const fn = mockFetch(jsonResponse(mockReceiving));

    const items = [
      {
        supplierOrderItemId: 501,
        receivedQuantity: '4.00',
        damagedQuantity: '1.00',
        missingQuantity: '0.00',
        rejectionReason: 'SPOILED_PERISHABLE',
      },
      {
        supplierOrderItemId: 502,
        receivedQuantity: '10.00',
        damagedQuantity: '0.00',
        missingQuantity: '0.00',
      },
    ];

    const result = await receiveOrder('test-token', 101, items, 'Damaged crate rejected at door', 'idemp-123');

    expect(result.id).toBe(701);
    expect(result.hasDiscrepancy).toBe(true);
    expect(Number(result.instantRefundAmount)).toBe(10.5);
    expect(result.creditNoteNumber).toBeNull();
    expect(result.refundStatus).toBe('APPLIED');

    const call = lastCall(fn);
    expect(call.url).toContain('/api/v1/supplier-orders/101/receive');
    expect(call.body.items[0].rejectionReason).toBe('SPOILED_PERISHABLE');
  });
});
