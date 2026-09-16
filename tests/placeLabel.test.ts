import { placeLabel } from '@/utils/placeName';

describe('placeLabel', () => {
  it('drops the business name a store repeats', () => {
    // "Metro Fresh Supplies Koramangala" over "Metro Fresh Supplies" says the
    // business twice, and the repetition is what pushes the useful half off a
    // 390pt screen.
    expect(placeLabel('Metro Fresh Supplies Koramangala', 'Metro Fresh Supplies'))
      .toBe('Koramangala');
  });

  it('ignores case and separators between the two', () => {
    expect(placeLabel('ABC Foods — Domlur', 'ABC Foods')).toBe('Domlur');
    expect(placeLabel('abc foods Whitefield', 'ABC Foods')).toBe('Whitefield');
  });

  it('keeps a name that does not start with the business', () => {
    expect(placeLabel('Koramangala Depot', 'Metro Fresh Supplies'))
      .toBe('Koramangala Depot');
  });

  it('keeps the full name rather than leaving nothing', () => {
    // A store genuinely called the same as its business must not become blank.
    expect(placeLabel('Metro Fresh Supplies', 'Metro Fresh Supplies'))
      .toBe('Metro Fresh Supplies');
    expect(placeLabel('ABC Foods 1', 'ABC Foods')).toBe('ABC Foods 1');
  });

  it('survives a missing half', () => {
    expect(placeLabel(null, 'ABC Foods')).toBeNull();
    expect(placeLabel('Domlur', null)).toBe('Domlur');
  });
});
