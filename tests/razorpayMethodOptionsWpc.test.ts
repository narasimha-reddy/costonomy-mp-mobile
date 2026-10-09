import { methodOptions } from '@/lib/payments/types';

describe('methodOptions', () => {
  it('adds nothing when no method is set (order pay, top-up)', () => {
    expect(methodOptions(undefined)).toEqual({});
  });
  it('pre-selects the method and hides the others', () => {
    expect(methodOptions('upi')).toEqual({
      prefill: { method: 'upi' },
      config: { display: { hide: [{ method: 'netbanking' }, { method: 'wallet' }, { method: 'paylater' }, { method: 'emi' }] } },
    });
    expect(methodOptions('card').prefill).toEqual({ method: 'card' });
  });
});
