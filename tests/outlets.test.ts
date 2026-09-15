import { directOutletIds, restaurantScopeIds } from '@/lib/outlets';
import { audienceOf, type Membership } from '@/lib/session/types';

function membership(partial: Partial<Membership>): Membership {
  return {
    scopeType: 'OUTLET',
    scopeId: null,
    scopeName: null,
    parentScopeId: null,
    parentScopeName: null,
    roles: [],
    permissions: [],
    ...partial,
  };
}

describe('outlet resolution (D-056)', () => {
  it('treats a restaurant grant as covering the restaurant, not zero outlets', () => {
    // The bug this exists to stop: an owner holds one RESTAURANT membership and
    // no OUTLET rows, and was shown "no outlets" for outlets they had just made.
    const owner = [membership({ scopeType: 'RESTAURANT', scopeId: 1, roles: ['REST_OWNER'] })];

    expect(restaurantScopeIds(owner)).toEqual([1]);
    expect(directOutletIds(owner)).toEqual([]);
    expect(audienceOf(owner)).toBe('RESTAURANT');
  });

  it('keeps outlet grants whose restaurant the user does not hold', () => {
    // A manager on two outlets of a chain gets those two and nothing else.
    const manager = [
      membership({ scopeId: 7, parentScopeId: 3 }),
      membership({ scopeId: 9, parentScopeId: 3 }),
    ];

    expect(restaurantScopeIds(manager)).toEqual([]);
    expect(directOutletIds(manager)).toEqual([7, 9]);
  });

  it('does not fetch an outlet twice when its restaurant is already held', () => {
    // Both grants exist for the same outlet. Fetching the restaurant returns it,
    // so asking for it again is a wasted round trip on every home render.
    const both = [
      membership({ scopeType: 'RESTAURANT', scopeId: 3 }),
      membership({ scopeId: 7, parentScopeId: 3 }),
      membership({ scopeId: 11, parentScopeId: 4 }),
    ];

    expect(restaurantScopeIds(both)).toEqual([3]);
    expect(directOutletIds(both)).toEqual([11]);
  });

  it('ignores a grant with no scope id', () => {
    // PLATFORM grants carry a null scopeId; so would a malformed row.
    const platform = [membership({ scopeType: 'PLATFORM', scopeId: null })];

    expect(restaurantScopeIds(platform)).toEqual([]);
    expect(directOutletIds(platform)).toEqual([]);
  });

  it('deduplicates repeated scopes', () => {
    const duplicated = [
      membership({ scopeType: 'RESTAURANT', scopeId: 1, roles: ['REST_OWNER'] }),
      membership({ scopeType: 'RESTAURANT', scopeId: 1, roles: ['REST_MANAGER'] }),
    ];

    expect(restaurantScopeIds(duplicated)).toEqual([1]);
  });
});
