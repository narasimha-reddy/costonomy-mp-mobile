import { partnerWording } from '@/lib/delivery/partnerWording';

describe('partnerWording', () => {
  it.each([
    ['Rider app timed out', 'Delivery partner app timed out'],
    ['No riders available', 'No delivery partners available'],
    ['Call driver', 'Call delivery partner'],
    ['Courier cancelled the pickup', 'Delivery partner cancelled the pickup'],
    ['Provider is slow', 'Provider is slow'],
  ])('%s -> %s', (from, to) => expect(partnerWording(from)).toBe(to));
});
