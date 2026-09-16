import { useQueries } from '@tanstack/react-query';
import { fetchStore, fetchSupplier, type Supplier, type SupplierStore } from '@/services/supplier';
import { useSession } from '@/contexts/SessionProvider';
import type { Membership } from '@/lib/session/types';

/**
 * The stores this user can act for.
 *
 * <p>The supplier half of D-056, and the same shape exactly: a SUPPLIER-scope
 * grant already covers every store beneath it, so an owner holds one SUPPLIER
 * membership and no SUPPLIER_STORE rows. Reading the store list off
 * SUPPLIER_STORE memberships would show an owner nothing.
 */
export interface StoresState {
  stores: SupplierStore[];
  /**
   * The organisation itself — its trading name, and whether it may trade at all.
   *
   * <p>Null for someone granted only at store scope: they act for a branch and
   * the organisation is not theirs to see. Screens that render it fall back to
   * the store's name rather than inventing one.
   */
  supplier: Supplier | null;
  loading: boolean;
  error: unknown;
}

export function supplierScopeIds(memberships: Membership[]): number[] {
  return dedupe(
    memberships
      .filter((m) => m.scopeType === 'SUPPLIER' && m.scopeId != null)
      .map((m) => m.scopeId as number),
  );
}

/** Store grants whose supplier the user does *not* already hold. */
export function directStoreIds(memberships: Membership[]): number[] {
  const covered = new Set(supplierScopeIds(memberships));
  return dedupe(
    memberships
      .filter(
        (m) =>
          m.scopeType === 'SUPPLIER_STORE' &&
          m.scopeId != null &&
          !(m.parentScopeId != null && covered.has(m.parentScopeId)),
      )
      .map((m) => m.scopeId as number),
  );
}

export function useStores(): StoresState {
  const { me, accessToken } = useSession();
  const memberships = me?.memberships ?? [];
  const enabled = accessToken != null;

  const supplierIds = supplierScopeIds(memberships);
  const storeIds = directStoreIds(memberships);

  const results = useQueries({
    queries: [
      ...supplierIds.map((id) => ({
        queryKey: ['supplier', id],
        queryFn: () => fetchSupplier(accessToken as string, id),
        enabled,
      })),
      ...storeIds.map((id) => ({
        queryKey: ['supplier-store', id],
        queryFn: () => fetchStore(accessToken as string, id),
        enabled,
      })),
    ],
  });

  // A supplier query yields the organisation and its stores; a store query yields
  // one store. Splitting them here keeps both shapes out of every caller.
  const organisations = results
    .map((r) => r.data)
    .filter((data): data is Supplier => data != null && 'displayName' in data);
  const loose = results
    .map((r) => r.data)
    .filter((data): data is SupplierStore => data != null && !('displayName' in data));

  const stores = dedupeBy(
    [...organisations.flatMap((o) => o.stores ?? []), ...loose],
    (store) => store.id,
  );

  return {
    stores: stores.sort((a, b) => a.name.localeCompare(b.name)),
    supplier: organisations[0] ?? null,
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
