import { useQueries } from '@tanstack/react-query';
import { fetchStore, fetchSupplier, type SupplierStore } from '@/services/supplier';
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
        queryFn: () =>
          fetchSupplier(accessToken as string, id).then((supplier) => supplier.stores ?? []),
        enabled,
      })),
      ...storeIds.map((id) => ({
        queryKey: ['supplier-store', id],
        queryFn: () => fetchStore(accessToken as string, id).then((store) => [store]),
        enabled,
      })),
    ],
  });

  const stores = dedupeBy(results.flatMap((r) => r.data ?? []), (store) => store.id);

  return {
    stores: stores.sort((a, b) => a.name.localeCompare(b.name)),
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
