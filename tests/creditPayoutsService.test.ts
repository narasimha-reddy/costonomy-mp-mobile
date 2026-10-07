import { apiRequest } from '@/lib/api/client';
import { fetchPayments, fetchPayouts } from '@/services/credit';

jest.mock('@/lib/api/client', () => ({ apiRequest: jest.fn(), newIdempotencyKey: () => 'k' }));
const api = apiRequest as jest.Mock;
beforeEach(() => { api.mockReset(); api.mockResolvedValue({}); });

describe('payouts and payments services', () => {
  it('asks for payouts with the status, days and page', async () => {
    await fetchPayouts('t', 5, { status: 'PENDING', from: '2026-09-01', to: '2026-09-30', page: 2, size: 20 });
    expect(api).toHaveBeenCalledWith(
      '/api/v1/supplier-stores/5/credit/payouts?status=PENDING&from=2026-09-01&to=2026-09-30&page=2&size=20',
      { token: 't' });
  });
  it('sends ALL as ALL and leaves out days that were not chosen', async () => {
    await fetchPayouts('t', 5, { status: 'ALL', page: 0, size: 20 });
    expect(api).toHaveBeenCalledWith(
      '/api/v1/supplier-stores/5/credit/payouts?status=ALL&page=0&size=20', { token: 't' });
  });
  it('asks for payments with the source, days and page', async () => {
    await fetchPayments('t', 5, { source: 'SUPPLIER_RECORDED', from: '2026-09-01', to: '2026-09-30', page: 1, size: 20 });
    expect(api).toHaveBeenCalledWith(
      '/api/v1/supplier-stores/5/credit/payments?from=2026-09-01&to=2026-09-30&source=SUPPLIER_RECORDED&page=1&size=20',
      { token: 't' });
  });
  it('sends no source for all payments', async () => {
    await fetchPayments('t', 5, { page: 0, size: 20 });
    expect(api).toHaveBeenCalledWith(
      '/api/v1/supplier-stores/5/credit/payments?page=0&size=20', { token: 't' });
  });
});
