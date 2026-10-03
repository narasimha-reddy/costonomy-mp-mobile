import React from 'react';
import { sectionWarning } from '@/components/restaurant/CartSupplierSection';
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

  it('triggers warning when agreed total is below store minimum order value', () => {
    const warning = sectionWarning(baseDraft);
    expect(warning).toBe('Min order ₹1000 (Add ₹160 more)');
  });

  it('returns no warning when agreed total meets or exceeds store minimum order value', () => {
    const qualifyingDraft: Intent = {
      ...baseDraft,
      agreedTotal: '1250.00',
    };
    expect(sectionWarning(qualifyingDraft)).toBeNull();
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
    const mockOrder = {
      id: 55,
      orderNumber: 'MP-ORD-55',
      weightAdjustmentAmount: '-15.50',
      finalPayableAmount: '484.50',
    };
    const fn = mockFetch(jsonResponse(mockOrder));

    const weights = [
      { skuId: 101, actualDispatchedWeight: '4.85' },
      { skuId: 102, actualDispatchedWeight: '2.10' },
    ];

    const result = await recordDispatchWeights('test-token', 55, weights);

    expect(result.id).toBe(55);
    expect(result.weightAdjustmentAmount).toBe('-15.50');

    const call = lastCall(fn);
    expect(call.url).toContain('/api/v1/supplier-orders/55/weights');
    expect(call.init.method).toBe('POST');
    expect(call.body).toEqual({ items: weights });
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
    expect(sheet.rows[0].productName).toBe('Paneer Fresh');
    expect(sheet.rows[0].isCatchWeight).toBe(true);

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
    const mockReceiving = {
      id: 77,
      supplierOrderId: 101,
      orderNumber: 'MP-101',
      status: 'RECEIVED',
      hasDiscrepancy: true,
      instantRefundAmount: '120.00',
      creditNoteNumber: 'CN-MP-101-01',
      items: [],
    };
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

    expect(result.id).toBe(77);
    expect(result.hasDiscrepancy).toBe(true);
    expect(result.instantRefundAmount).toBe('120.00');
    expect(result.creditNoteNumber).toBe('CN-MP-101-01');

    const call = lastCall(fn);
    expect(call.url).toContain('/api/v1/supplier-orders/101/receive');
    expect(call.body.items[0].rejectionReason).toBe('SPOILED_PERISHABLE');
  });
});
