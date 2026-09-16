import { storeLabel } from '@/utils/storeName';

describe('storeLabel', () => {
  it('drops the business name a store repeats', () => {
    // "Metro Fresh Supplies Koramangala" over "Metro Fresh Supplies" says the
    // business twice, and the repetition is what pushes the useful half off a
    // 390pt screen.
    expect(storeLabel('Metro Fresh Supplies Koramangala', 'Metro Fresh Supplies'))
      .toBe('Koramangala');
  });

  it('ignores case and separators between the two', () => {
    expect(storeLabel('ABC Foods — Domlur', 'ABC Foods')).toBe('Domlur');
    expect(storeLabel('abc foods Whitefield', 'ABC Foods')).toBe('Whitefield');
  });

  it('keeps a name that does not start with the business', () => {
    expect(storeLabel('Koramangala Depot', 'Metro Fresh Supplies'))
      .toBe('Koramangala Depot');
  });

  it('keeps the full name rather than leaving nothing', () => {
    // A store genuinely called the same as its business must not become blank.
    expect(storeLabel('Metro Fresh Supplies', 'Metro Fresh Supplies'))
      .toBe('Metro Fresh Supplies');
    expect(storeLabel('ABC Foods 1', 'ABC Foods')).toBe('ABC Foods 1');
  });

  it('survives a missing half', () => {
    expect(storeLabel(null, 'ABC Foods')).toBeNull();
    expect(storeLabel('Domlur', null)).toBe('Domlur');
  });
});
