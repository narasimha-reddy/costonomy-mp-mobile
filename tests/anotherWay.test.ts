import { anotherWayLabel, canPayAnotherWay, paidAnotherWayMessage } from '@/lib/payments/anotherWay';

describe('anotherWayLabel', () => {
  it('names the method and the amount', () => {
    expect(anotherWayLabel('WALLET', '1178.00')).toBe('Pay ₹1,178.00 from wallet');
    expect(anotherWayLabel('CREDIT', '1178.00')).toBe('Put ₹1,178.00 on credit');
  });

  it('still reads when the total is not loaded', () => {
    expect(anotherWayLabel('WALLET', null)).toBe('Pay from wallet');
  });
});

describe('canPayAnotherWay', () => {
  it('is offered on an unpaid card order before paying or after a failed attempt', () => {
    expect(canPayAnotherWay(true, 'review')).toBe(true);
    expect(canPayAnotherWay(true, 'failed')).toBe(true);
  });

  it('is never offered mid-payment, once paid, once over, or when the server did not say so', () => {
    for (const phase of ['authorizing', 'confirming', 'success', 'unknown', 'ended'] as const) {
      expect(canPayAnotherWay(true, phase)).toBe(false);
    }
    expect(canPayAnotherWay(false, 'review')).toBe(false);
    expect(canPayAnotherWay(undefined, 'review')).toBe(false);
  });
});

describe('paidAnotherWayMessage', () => {
  it('says how it was paid', () => {
    expect(paidAnotherWayMessage('WALLET')).toBe('Paid from your wallet.');
    expect(paidAnotherWayMessage('CREDIT')).toBe('Placed on credit.');
  });
});
