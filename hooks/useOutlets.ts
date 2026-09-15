import { useQueries } from '@tanstack/react-query';
import { fetchOutlet, fetchRestaurantOutlets, type Outlet } from '@/services/restaurant';
import { useSession } from '@/contexts/SessionProvider';
import type { Membership } from '@/lib/session/types';

/**
 * The outlets this user can order for.
 *
 * <p><b>A restaurant-scope grant already covers every outlet under it.</b> The
 * server says so — {@code ScopeResolver}: "a grant at the parent satisfies a
 * check at the child — an owner does not need re-granting for every outlet they
 * open". So an owner holds one RESTAURANT membership and no OUTLET memberships,
 * and reading the outlet list off OUTLET-scope memberships alone shows an owner
 * an empty list for outlets they demonstrably own.
 *
 * <p>The list is therefore resolved the way the server models it: outlets are
 * fetched per restaurant the user holds a grant in, and unioned with the outlets
 * named by any OUTLET-scope grant — which is how a manager assigned to two of a
 * chain's nine outlets gets exactly those two.
 *
 * <p>`/auth/me` is deliberately not the place for this. A chain with fifty
 * outlets would carry all fifty on every session restore, and outlets change far
 * more often than grants do.
 */
export interface OutletsState {
  outlets: Outlet[];
  loading: boolean;
  error: unknown;
}

export function restaurantScopeIds(memberships: Membership[]): number[] {
  return dedupe(
    memberships
      .filter((m) => m.scopeType === 'RESTAURANT' && m.scopeId != null)
      .map((m) => m.scopeId as number),
  );
}

/** Outlet-scope grants whose restaurant the user does *not* already hold. */
export function directOutletIds(memberships: Membership[]): number[] {
  const covered = new Set(restaurantScopeIds(memberships));
  return dedupe(
    memberships
      .filter(
        (m) =>
          m.scopeType === 'OUTLET' &&
          m.scopeId != null &&
          !(m.parentScopeId != null && covered.has(m.parentScopeId)),
      )
      .map((m) => m.scopeId as number),
  );
}

export function useOutlets(): OutletsState {
  const { me, accessToken } = useSession();
  const memberships = me?.memberships ?? [];
  const enabled = accessToken != null;

  const restaurantIds = restaurantScopeIds(memberships);
  const outletIds = directOutletIds(memberships);

  const results = useQueries({
    queries: [
      ...restaurantIds.map((id) => ({
        queryKey: ['restaurant', id, 'outlets'],
        queryFn: () => fetchRestaurantOutlets(id, accessToken as string),
        enabled,
      })),
      ...outletIds.map((id) => ({
        queryKey: ['outlet', id],
        queryFn: () => fetchOutlet(id, accessToken as string).then((o) => [o]),
        enabled,
      })),
    ],
  });

  const outlets = dedupeBy(
    results.flatMap((r) => r.data ?? []),
    (o) => o.id,
  );

  return {
    // Sorted by name so the switcher does not reshuffle between fetches; the
    // queries resolve in whatever order the network returns them.
    outlets: outlets.sort((a, b) => a.name.localeCompare(b.name)),
    loading: results.some((r) => r.isPending) && enabled,
    error: results.find((r) => r.error)?.error,
  };
}

function dedupe(ids: number[]): number[] {
  return [...new Set(ids)];
}

function dedupeBy<T>(items: T[], key: (item: T) => number): T[] {
  const seen = new Map<number, T>();
  items.forEach((item) => {
    if (!seen.has(key(item))) seen.set(key(item), item);
  });
  return [...seen.values()];
}
