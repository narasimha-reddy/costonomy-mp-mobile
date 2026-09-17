import { useCallback, useMemo } from 'react';
import { useSession } from '@/contexts/SessionProvider';
import type { Membership } from '@/lib/session/types';

/**
 * What this user may do, and where.
 *
 * <p><b>Hiding an action is a courtesy, never a control.</b> Doc 09 §2: the
 * server checks every call regardless, and a denial on another tenant's resource
 * comes back as a 404 so ids cannot be enumerated. What this buys is a screen
 * that does not offer a button whose only possible outcome is an error.
 *
 * <p><b>A grant on the parent satisfies a check on the child</b>, which is the
 * rule `ScopeResolver` applies on the server. An owner holds one RESTAURANT
 * membership and no OUTLET rows at all, so a check that read OUTLET grants alone
 * would tell them they cannot edit the outlets they own — and it would do it
 * silently, by hiding something.
 *
 * <p>That is why the outlet check takes the outlet's restaurant rather than just
 * its id: the grant knows which restaurant it covers, and nothing in a membership
 * says which restaurant an outlet belongs to.
 */
export function usePermissions() {
  const { me } = useSession();
  const memberships = useMemo(() => me?.memberships ?? [], [me]);

  const holds = useCallback(
    (permission: string, covers: (grant: Membership) => boolean) =>
      memberships.some((grant) =>
        grant.permissions.includes(permission)
        // A PLATFORM grant answers at any scope; that is what platform scope is.
        && (grant.scopeType === 'PLATFORM' || covers(grant))),
    [memberships],
  );

  const canForRestaurant = useCallback(
    (permission: string, restaurantId: number | null | undefined) =>
      restaurantId != null
      && holds(permission, (g) => g.scopeType === 'RESTAURANT' && g.scopeId === restaurantId),
    [holds],
  );

  const canForOutlet = useCallback(
    (permission: string, outlet: { id: number; restaurantId: number } | null | undefined) =>
      outlet != null
      && holds(permission, (g) =>
        (g.scopeType === 'OUTLET' && g.scopeId === outlet.id)
        || (g.scopeType === 'RESTAURANT' && g.scopeId === outlet.restaurantId)),
    [holds],
  );

  return { canForRestaurant, canForOutlet };
}
