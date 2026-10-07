import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { newIdempotencyKey } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { advanceSandboxDelivery } from '@/services/delivery';

/**
 * TEST ONLY (API D-154): the supplier's "move the rider to the next step". On success the order and delivery queries
 * are invalidated so the screen shows what the server now says; nothing is advanced locally.
 */
export function useSandboxAdvance(orderId: number) {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { show } = useToast();
  const mutation = useMutation({
    mutationFn: (deliveryId: number) => advanceSandboxDelivery(accessToken as string, deliveryId, newIdempotencyKey()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
    },
    onError: (caught) => {
      show(caught instanceof ApiError ? caught.message : 'Could not move the rider.', 'error');
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
    },
  });
  return { advance: (deliveryId: number) => mutation.mutate(deliveryId), pending: mutation.isPending };
}
