import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useToast } from '@/components/common/MandiToast';
import { addIntentItem } from '@/services/intent';
import { draftsKey } from '@/lib/queryKeys';
import { ApiError } from '@/lib/api/errors';

/**
 * Put one pack on a request, from wherever it was found.
 *
 * <p>Search, a supplier's catalogue and the product comparison all do the same
 * thing here, and had started doing it three times.
 *
 * <p><b>Takes a SKU, not an offer.</b> An offer id would pin a price onto a
 * record that deliberately has none — the request says what is wanted, and the
 * supplier's answer says what it costs. The server works out which supplier, and
 * therefore which draft, from the SKU.
 *
 * <p>Quantity is always one pack. Choosing a quantity belongs on the product
 * screen and in the basket, where the consequence is visible; a list row that
 * silently added four would be worse than one that adds one.
 */
export function useAddToRequest() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (supplierSkuId: number) =>
      addIntentItem(accessToken as string, outletId as number, {
        supplierSkuId,
        quantity: '1',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: draftsKey(outletId) });
      toast.show('Added to your request', 'success');
    },
    // The server's own words. §23A.8: a refusal explains itself, and a generic
    // "something went wrong" is what makes someone try the same thing again.
    onError: (error) => toast.show(
      error instanceof ApiError ? error.message : 'Could not add that. Try again.',
      'error',
    ),
  });
}
