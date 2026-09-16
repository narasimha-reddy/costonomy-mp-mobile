import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useStores } from '@/hooks/useStores';
import { getPreference, setPreference } from '@/lib/preferences';
import type { Supplier, SupplierStore } from '@/services/supplier';

const SELECTED_STORE_KEY = 'mp.selectedStoreId';

/**
 * Which store the supplier is acting for. The mirror of `OutletProvider`.
 *
 * <p>Orders, catalog, credit and settlements all belong to a store, so resolving
 * it per screen would let two screens disagree about which one is on display —
 * and on this side that means accepting an order for the wrong branch.
 */
interface StoreState {
  stores: SupplierStore[];
  /** The organisation. Null when the user holds only a store-scope grant. */
  supplier: Supplier | null;
  store: SupplierStore | null;
  storeId: number | null;
  select: (storeId: number) => void;
  loading: boolean;
  error: unknown;
}

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { stores, supplier, loading, error } = useStores();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPreference(SELECTED_STORE_KEY)
      .then((stored) => {
        if (cancelled) return;
        const parsed = stored ? Number(stored) : NaN;
        if (Number.isFinite(parsed)) setSelectedId(parsed);
      })
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const select = useCallback((storeId: number) => {
    setSelectedId(storeId);
    void setPreference(SELECTED_STORE_KEY, String(storeId));
  }, []);

  // The remembered id counts only if the server still lists that store.
  const store = useMemo(() => {
    if (stores.length === 0) return null;
    return stores.find((s) => s.id === selectedId) ?? stores[0] ?? null;
  }, [stores, selectedId]);

  const value = useMemo<StoreState>(() => ({
    stores,
    supplier,
    store,
    storeId: store?.id ?? null,
    select,
    loading: loading || !restored,
    error,
  }), [stores, supplier, store, select, loading, restored, error]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside a StoreProvider');
  return context;
}
