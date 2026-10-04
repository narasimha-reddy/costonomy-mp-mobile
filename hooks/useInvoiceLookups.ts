import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { invoiceLookupKey } from '@/lib/queryKeys';
import { fetchSkuLookup, fetchSupplierLookup } from '@/services/wallet';

/**
 * Suppliers for the picker. `q` is already debounced by the caller. Not retried: the picker shows the
 * problem. The previous list stays up while a new query loads, and a superseded request is aborted, so
 * the rows always belong to the latest query.
 */
export function useSupplierLookup(q: string, enabled: boolean) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  return useQuery({
    queryKey: invoiceLookupKey(outlet?.id, 'suppliers', q.trim()),
    queryFn: ({ signal }) => fetchSupplierLookup(outlet?.id as number, q, accessToken as string, { signal }),
    enabled: enabled && outlet != null && accessToken != null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  });
}

/** SKUs for the picker (the outlet's catalogue; the server does not rank by supplier). */
export function useSkuLookup(q: string, enabled: boolean) {
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  return useQuery({
    queryKey: invoiceLookupKey(outlet?.id, 'skus', q.trim()),
    queryFn: ({ signal }) => fetchSkuLookup(outlet?.id as number, q, accessToken as string, { signal }),
    enabled: enabled && outlet != null && accessToken != null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  });
}
