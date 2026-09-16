import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useToast } from '@/components/common/MandiToast';
import { addCartItem } from '@/services/procurement';
import { ApiError } from '@/lib/api/errors';

/**
 * Add one pack to the cart, from wherever it was found.
 *
 * <p>Search, a supplier's catalog and the product comparison all do the same
 * thing here, and had started doing it three times. The cart is keyed by outlet,
 * so the invalidation has to be too — a copy that forgets that leaves the badge
 * showing yesterday's count.
 *
 * <p>Quantity is always one pack. Choosing a quantity is a decision that belongs
 * on the product screen and in the cart, where the consequence is visible; a list
 * row that silently added four would be worse than one that adds one.
 */
export function useAddToCart() {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (offerId: number) =>
      addCartItem(accessToken as string, outletId as number, {
        supplierOfferId: offerId,
        quantity: '1',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'cart'] });
      toast.show('Added to cart', 'success');
    },
    // The server's own words. §23A.8: a refusal explains itself, and a generic
    // "something went wrong" is what makes someone try the same thing again.
    onError: (error) => toast.show(
      error instanceof ApiError ? error.message : 'Could not add that. Try again.',
      'error',
    ),
  });
}
