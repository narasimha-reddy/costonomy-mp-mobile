import {
  fetchDelivery,
  fetchDeliveryEvents,
  fetchOutletDeliveries,
  fetchOutletDeliveryRadar,
  markDeliveryDelivered,
  markDeliveryDispatched,
} from '@/services/delivery';
import type { Delivery, OutletDeliveryRadarItem } from '@/models/delivery';

function mockJsonResponse(data: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    text: async () => JSON.stringify({ data, error: null, meta: {} }),
  } as unknown as Response;
}

describe('Delivery Service API alignment', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetchDelivery calls the restaurant supplier order endpoint', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init.headers as Record<string, string>;
      return mockJsonResponse({ id: 10, supplierOrderId: 42, status: 'IN_TRANSIT' });
    }) as unknown as typeof fetch;

    const res = await fetchDelivery('test-token', 42);
    expect(res.id).toBe(10);
    expect(capturedUrl).toContain('/api/v1/supplier-orders/42/delivery');
    expect(capturedHeaders.Authorization).toBe('Bearer test-token');
  });

  it('fetchDeliveryEvents calls /api/v1/deliveries/{id}/events', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn(async (url: string) => {
      capturedUrl = url;
      return mockJsonResponse([{ id: 1, eventType: 'DriverAssigned', status: 'DRIVER_ASSIGNED' }]);
    }) as unknown as typeof fetch;

    const events = await fetchDeliveryEvents('token', 15);
    expect(events).toHaveLength(1);
    expect(capturedUrl).toContain('/api/v1/deliveries/15/events');
  });

  it('fetchOutletDeliveryRadar requests outlet-scoped radar with query params', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn(async (url: string) => {
      capturedUrl = url;
      return mockJsonResponse({
        outletId: 7,
        summary: { totalActive: 1, atDoorCount: 0, approachingCount: 1, delayedCount: 0, pendingCheckInCount: 0, requiresEscalationCount: 0 },
        items: [],
      });
    }) as unknown as typeof fetch;

    await fetchOutletDeliveryRadar('token', 7, {
      action: 'CHECK_IN',
      stage: 'AT_KITCHEN_DOOR',
      scheduleStatus: 'RUNNING_LATE',
    });

    expect(capturedUrl).toContain('/api/v1/outlets/7/deliveries/radar');
    expect(capturedUrl).toContain('action=CHECK_IN');
    expect(capturedUrl).toContain('stage=AT_KITCHEN_DOOR');
    expect(capturedUrl).toContain('scheduleStatus=RUNNING_LATE');
  });

  it('fetchOutletDeliveries requests paginated outlet deliveries', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn(async (url: string) => {
      capturedUrl = url;
      return mockJsonResponse({
        items: [],
        page: 2,
        size: 15,
        totalElements: 0,
        totalPages: 0,
        hasNext: false,
      });
    }) as unknown as typeof fetch;

    await fetchOutletDeliveries('token', 9, { page: 2, size: 15, status: 'DELIVERED' });
    expect(capturedUrl).toContain('/api/v1/outlets/9/deliveries?page=2&size=15&status=DELIVERED');
  });

  it('markDeliveryDispatched POSTs to /api/v1/deliveries/{id}/dispatched', async () => {
    let capturedUrl = '';
    let capturedMethod = '';

    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init.method ?? 'GET';
      return mockJsonResponse({ id: 25, status: 'PICKED_UP' });
    }) as unknown as typeof fetch;

    const res = await markDeliveryDispatched('token', 25);
    expect(res.status).toBe('PICKED_UP');
    expect(capturedUrl).toContain('/api/v1/deliveries/25/dispatched');
    expect(capturedMethod).toBe('POST');
  });

  it('markDeliveryDelivered POSTs to /api/v1/deliveries/{id}/delivered', async () => {
    let capturedUrl = '';
    let capturedMethod = '';

    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init.method ?? 'GET';
      return mockJsonResponse({ id: 25, status: 'DELIVERED' });
    }) as unknown as typeof fetch;

    const res = await markDeliveryDelivered('token', 25);
    expect(res.status).toBe('DELIVERED');
    expect(capturedUrl).toContain('/api/v1/deliveries/25/delivered');
    expect(capturedMethod).toBe('POST');
  });

  it('ensures OutletDeliveryRadarItem and Delivery shapes respect supply-chain confidentiality', () => {
    // TypeScript type-level verification:
    // Ensure providerCode is NOT an accepted property on OutletDeliveryRadarItem or Delivery
    type HasProviderCode<T> = 'providerCode' extends keyof T ? true : false;
    type RadarHasCarrier = HasProviderCode<OutletDeliveryRadarItem>;
    type DeliveryHasCarrier = HasProviderCode<Delivery>;

    const radarCheck: RadarHasCarrier = false;
    const deliveryCheck: DeliveryHasCarrier = false;

    expect(radarCheck).toBe(false);
    expect(deliveryCheck).toBe(false);
  });
});
