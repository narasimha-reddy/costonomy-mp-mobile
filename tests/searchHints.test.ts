import {
  HINT_INTERVAL_MS,
  HINT_TRANSITION_MS,
  SEARCH_HINT_ITEMS,
  formatSearchHint,
  searchHints,
} from '@/lib/search/hints';

describe('search hints', () => {
  it('uses exactly the agreed items in order', () => {
    expect([...SEARCH_HINT_ITEMS]).toEqual(['paneer', 'rice', 'eggs', 'milk', 'sugar', 'curd']);
  });
  it('formats with straight double quotes', () => {
    expect(formatSearchHint('paneer')).toBe('Search "paneer"');
  });
  it('maps every item', () => {
    expect(searchHints()).toEqual(SEARCH_HINT_ITEMS.map(formatSearchHint));
    expect(searchHints()[0]).toBe('Search "paneer"');
  });
  it('timing constants', () => {
    expect(HINT_INTERVAL_MS).toBe(2600);
    expect(HINT_TRANSITION_MS).toBe(350);
  });
});
