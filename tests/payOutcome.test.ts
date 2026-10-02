import { payOutcome } from '@/lib/payments/outcome';

describe('payOutcome', () => {
  it('is paid only when the server says the funds are secured', () => {
    expect(payOutcome({ fundsSecured: true, status: 'AUTHORIZED' })).toBe('paid');
    expect(payOutcome({ fundsSecured: true, status: 'CAPTURED' })).toBe('paid');
  });

  it('never treats a payment that is not funded as paid, whatever its status', () => {
    // It used to: anything but FAILED showed "Payment authorised".
    expect(payOutcome({ fundsSecured: false, status: 'CREATED' })).toBe('retry');
    expect(payOutcome({ fundsSecured: false, status: 'SOMETHING_NEW' })).toBe('ended');
  });

  it('offers a retry only while the payment is still payable', () => {
    expect(payOutcome({ fundsSecured: false, status: 'CREATED', payable: true })).toBe('retry');
    // Server-confirmed FAILED is over: no checkout the server would ignore.
    expect(payOutcome({ fundsSecured: false, status: 'FAILED' })).toBe('ended');
    expect(payOutcome({ fundsSecured: false, status: 'FAILED', payable: false })).toBe('ended');
  });
});
