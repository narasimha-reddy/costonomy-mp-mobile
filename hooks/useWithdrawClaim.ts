import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useToast } from '@/components/common';
import { isClaimStateError, withdrawClaim } from '@/services/credit';

/**
 * Take back an "I paid" report the supplier has not answered yet.
 *
 * <p>Refreshes the outlet's credit data once the server has answered. If the
 * supplier answered first (a 409), the screen is refreshed and the person is told
 * so, rather than shown a bare failure.
 */
export function useWithdrawClaim(agreementId: number) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const queryClient = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const withdraw = useCallback(async (claimId: number): Promise<boolean> => {
    if (inFlight.current || accessToken == null) return false;
    inFlight.current = true;
    setPending(true);
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
    };
    try {
      await withdrawClaim(accessToken, claimId);
      refresh();
      toast.show('Report withdrawn', 'success');
      return true;
    } catch (caught) {
      if (isClaimStateError(caught)) {
        refresh();
        toast.show('Your supplier already answered this report.', 'error');
      } else {
        toast.show("Couldn't withdraw that. Please try again.", 'error');
      }
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [accessToken, agreementId, outletId, queryClient, toast]);

  return { withdraw, pending };
}
