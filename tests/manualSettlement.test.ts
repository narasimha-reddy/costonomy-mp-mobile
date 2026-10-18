import { MANUAL_SETTLEMENT_ENABLED } from '@/lib/credit/manualSettlement';

describe('manual settlement switch', () => {
  it('is off: restaurants settle credit through Mandi (UPI, Card, Wallet) only', () => {
    expect(MANUAL_SETTLEMENT_ENABLED).toBe(false);
  });
});
