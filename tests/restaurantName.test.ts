import { restaurantNameFor } from '@/hooks/useOutlets';
import type { Membership } from '@/lib/session/types';
import type { Outlet } from '@/services/restaurant';

function outlet(id: number, restaurantId: number): Outlet {
  return {
    id,
    restaurantId,
    name: `Outlet ${id}`,
    addressLine1: null,
    addressLine2: null,
    landmark: null,
    city: null,
    state: null,
    pincode: null,
    latitude: null,
    longitude: null,
    contactName: null,
    contactPhone: null,
    deliveryInstructions: null,
    status: 'ACTIVE',
  };
}

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

describe('restaurantNameFor', () => {
  it('reads an owner’s restaurant grant', () => {
    const grants = [grant({ scopeType: 'RESTAURANT', scopeId: 1, scopeName: 'Spice Garden' })];
    expect(restaurantNameFor(grants, outlet(5, 1))).toBe('Spice Garden');
  });

  it('reads a manager’s outlet grant through its parent', () => {
    const grants = [
      grant({
        scopeType: 'OUTLET',
        scopeId: 5,
        scopeName: 'Indiranagar',
        parentScopeId: 1,
        parentScopeName: 'Spice Garden',
      }),
    ];
    expect(restaurantNameFor(grants, outlet(5, 1))).toBe('Spice Garden');
  });

  // The reason this is resolved per outlet rather than per user: someone can hold
  // outlet grants in two restaurants, and the name has to follow the selection.
  it('follows the selected outlet across two restaurants', () => {
    const grants = [
      grant({
        scopeType: 'OUTLET',
        scopeId: 5,
        parentScopeId: 1,
        parentScopeName: 'Spice Garden',
      }),
      grant({
        scopeType: 'OUTLET',
        scopeId: 9,
        parentScopeId: 2,
        parentScopeName: 'Curry Leaf Kitchen',
      }),
    ];
    expect(restaurantNameFor(grants, outlet(5, 1))).toBe('Spice Garden');
    expect(restaurantNameFor(grants, outlet(9, 2))).toBe('Curry Leaf Kitchen');
  });

  it('prefers the restaurant grant over an outlet grant naming the same place', () => {
    const grants = [
      grant({ scopeType: 'OUTLET', scopeId: 5, parentScopeId: 1, parentScopeName: 'Stale Name' }),
      grant({ scopeType: 'RESTAURANT', scopeId: 1, scopeName: 'Spice Garden' }),
    ];
    expect(restaurantNameFor(grants, outlet(5, 1))).toBe('Spice Garden');
  });

  it('ignores a grant for a different restaurant', () => {
    const grants = [grant({ scopeType: 'RESTAURANT', scopeId: 2, scopeName: 'Curry Leaf Kitchen' })];
    expect(restaurantNameFor(grants, outlet(5, 1))).toBeNull();
  });

  // The header falls back to the outlet rather than inventing a business.
  it('is null with no outlet, and null when nothing names it', () => {
    expect(restaurantNameFor([grant({ scopeId: 1, scopeName: 'Spice Garden' })], null)).toBeNull();
    expect(restaurantNameFor([], outlet(5, 1))).toBeNull();
    expect(
      restaurantNameFor([grant({ scopeType: 'RESTAURANT', scopeId: 1 })], outlet(5, 1)),
    ).toBeNull();
  });
});
