import { apiRequest } from '@/lib/api/client';
import { confirmClaim, fetchStoreClaims, rejectClaim } from '@/services/credit';

jest.mock('@/lib/api/client', () => ({ apiRequest: jest.fn(), newIdempotencyKey: () => 'k' }));
const api = apiRequest as jest.Mock;
beforeEach(() => { api.mockReset(); api.mockResolvedValue([]); });

describe('claim inbox service', () => {
  it('lists a store\'s claims, optionally by status', async () => {
    await fetchStoreClaims('t', 5, 'SUBMITTED');
    expect(api).toHaveBeenCalledWith('/api/v1/supplier-stores/5/credit/claims?status=SUBMITTED', { token: 't' });
    await fetchStoreClaims('t', 5);
    expect(api).toHaveBeenLastCalledWith('/api/v1/supplier-stores/5/credit/claims', { token: 't' });
  });
  it('confirms with a key and no body when no amount is given', async () => {
    await confirmClaim('t', 9, 'key1');
    expect(api).toHaveBeenCalledWith('/api/v1/credit/claims/9/confirm', { method: 'POST', token: 't', idempotencyKey: 'key1' });
  });
  it('confirms with an amount', async () => {
    await confirmClaim('t', 9, 'key1', '3000.00');
    expect(api).toHaveBeenCalledWith('/api/v1/credit/claims/9/confirm',
      { method: 'POST', token: 't', idempotencyKey: 'key1', body: { amount: '3000.00' } });
  });
  it('rejects with a reason', async () => {
    await rejectClaim('t', 9, 'Not received');
    expect(api).toHaveBeenCalledWith('/api/v1/credit/claims/9/reject',
      { method: 'POST', token: 't', body: { reason: 'Not received' } });
  });
});
