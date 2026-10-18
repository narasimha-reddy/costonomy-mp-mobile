import { renderHook } from '@testing-library/react-native';
import { usePermissions } from '@/hooks/usePermissions';
import type { Membership } from '@/lib/session/types';

const mockSession = jest.fn();
jest.mock('@/contexts/SessionProvider', () => ({
  useSession: () => mockSession(),
}));

function grant(partial: Partial<Membership>): Membership {
  return {
    scopeType: 'RESTAURANT',
    scopeId: null,
    scopeName: null,
    parentScopeId: null,
    parentScopeName: null,
    roles: [],
    permissions: [],
    ...partial,
  };
}

function permissions(memberships: Membership[]) {
  mockSession.mockReturnValue({ me: { memberships } });
  return renderHook(() => usePermissions()).result.current;
}

const OUTLET = { id: 5, restaurantId: 1 };

describe('usePermissions', () => {
  it('honours a grant on the outlet itself', () => {
    const { canForOutlet } = permissions([
      grant({ scopeType: 'OUTLET', scopeId: 5, permissions: ['outlets.edit'] }),
    ]);
    expect(canForOutlet('outlets.edit', OUTLET)).toBe(true);
  });

  // The case that makes this hook necessary: an owner holds one RESTAURANT
  // membership and no OUTLET rows, and must still be able to edit their outlets.
  it('honours a restaurant grant on an outlet beneath it', () => {
    const { canForOutlet } = permissions([
      grant({ scopeType: 'RESTAURANT', scopeId: 1, permissions: ['outlets.edit'] }),
    ]);
    expect(canForOutlet('outlets.edit', OUTLET)).toBe(true);
  });

  it('does not let a grant on one outlet answer for another', () => {
    const { canForOutlet } = permissions([
      grant({ scopeType: 'OUTLET', scopeId: 9, permissions: ['outlets.edit'] }),
    ]);
    expect(canForOutlet('outlets.edit', OUTLET)).toBe(false);
  });

  it('does not let another restaurant answer for this one', () => {
    const { canForOutlet, canForRestaurant } = permissions([
      grant({ scopeType: 'RESTAURANT', scopeId: 2, permissions: ['outlets.edit', 'business.edit'] }),
    ]);
    expect(canForOutlet('outlets.edit', OUTLET)).toBe(false);
    expect(canForRestaurant('business.edit', 1)).toBe(false);
  });

  // A grant beneath the restaurant does not reach up to it.
  it('does not let an outlet grant edit the restaurant', () => {
    const { canForRestaurant } = permissions([
      grant({
        scopeType: 'OUTLET',
        scopeId: 5,
        parentScopeId: 1,
        permissions: ['business.edit'],
      }),
    ]);
    expect(canForRestaurant('business.edit', 1)).toBe(false);
  });

  it('refuses a permission the grant does not carry', () => {
    const { canForOutlet } = permissions([
      grant({ scopeType: 'RESTAURANT', scopeId: 1, permissions: ['outlets.view'] }),
    ]);
    expect(canForOutlet('outlets.edit', OUTLET)).toBe(false);
  });

  it('lets a platform grant answer at any scope', () => {
    const { canForOutlet, canForRestaurant } = permissions([
      grant({ scopeType: 'PLATFORM', scopeId: null, permissions: ['outlets.edit'] }),
    ]);
    expect(canForOutlet('outlets.edit', OUTLET)).toBe(true);
    expect(canForRestaurant('outlets.edit', 1)).toBe(true);
  });

  it('is false with no grants and with nothing to check against', () => {
    const { canForOutlet, canForRestaurant } = permissions([]);
    expect(canForOutlet('outlets.edit', OUTLET)).toBe(false);
    expect(canForRestaurant('business.edit', 1)).toBe(false);

    const held = permissions([
      grant({ scopeType: 'RESTAURANT', scopeId: 1, permissions: ['outlets.edit'] }),
    ]);
    expect(held.canForOutlet('outlets.edit', null)).toBe(false);
    expect(held.canForRestaurant('outlets.edit', null)).toBe(false);
  });
});
