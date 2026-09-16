import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { restaurantNameFor, useOutlets } from '@/hooks/useOutlets';
import { useSession } from '@/contexts/SessionProvider';
import { getPreference, setPreference } from '@/lib/preferences';
import type { Outlet } from '@/services/restaurant';

const SELECTED_OUTLET_KEY = 'mp.selectedOutletId';

/**
 * Which outlet the restaurant is acting for.
 *
 * <p>Every restaurant screen needs this: a cart belongs to an outlet, so do
 * requirements, orders, credit and the serviceability of every offer. Keeping it
 * here rather than passing an id down means a screen cannot quietly read a
 * different outlet's cart than the one named in the header.
 *
 * <p><b>The stored choice is a preference, not an authority.</b> It is re-checked
 * against the outlets the server currently returns on every load, so a user
 * removed from an outlet since they last opened the app does not keep acting for
 * it — doc 46 requires a revoked grant to take effect on the next request, and a
 * remembered id is exactly the kind of local state that would defeat that.
 */
interface OutletState {
  outlets: Outlet[];
  outlet: Outlet | null;
  outletId: number | null;
  /**
   * What the selected outlet's restaurant is called.
   *
   * <p>Null when the grants do not name it — the header falls back to the outlet
   * rather than inventing a business.
   */
  restaurantName: string | null;
  select: (outletId: number) => void;
  loading: boolean;
  error: unknown;
}

const OutletContext = createContext<OutletState | null>(null);

export function OutletProvider({ children }: { children: React.ReactNode }) {
  const { outlets, loading, error } = useOutlets();
  const { me } = useSession();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPreference(SELECTED_OUTLET_KEY)
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

  const select = useCallback((outletId: number) => {
    setSelectedId(outletId);
    void setPreference(SELECTED_OUTLET_KEY, String(outletId));
  }, []);

  // The stored id only counts if the server still lists that outlet. Falling back
  // to the first one keeps a single-outlet restaurant — most of them — from ever
  // seeing a picker.
  const outlet = useMemo(() => {
    if (outlets.length === 0) return null;
    return outlets.find((o) => o.id === selectedId) ?? outlets[0] ?? null;
  }, [outlets, selectedId]);

  const memberships = me?.memberships;
  const restaurantName = useMemo(
    () => restaurantNameFor(memberships ?? [], outlet),
    [memberships, outlet],
  );

  const value = useMemo<OutletState>(() => ({
    outlets,
    outlet,
    outletId: outlet?.id ?? null,
    restaurantName,
    select,
    loading: loading || !restored,
    error,
  }), [outlets, outlet, restaurantName, select, loading, restored, error]);

  return <OutletContext.Provider value={value}>{children}</OutletContext.Provider>;
}

export function useOutlet(): OutletState {
  const context = useContext(OutletContext);
  if (!context) throw new Error('useOutlet must be used inside an OutletProvider');
  return context;
}

/**
 * The current outlet id, for a query that cannot run without one.
 *
 * <p>Returns null while outlets are still loading; callers disable the query on
 * null rather than guessing an id.
 */
export function useOutletId(): number | null {
  return useOutlet().outletId;
}
