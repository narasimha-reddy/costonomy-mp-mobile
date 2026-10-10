import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchDisputes } from '@/services/trust';
import { formatMoney } from '@/utils/money';
import { AmountRow } from './AmountRow';
import { Colors, Spacing } from '@/theme';

/**
 * The refunds a dispute on this order was approved for, one row each.
 *
 * <p>The order itself carries no dispute-refund figure (`finalPayableAmount` is before it), so the amounts come from
 * the order's disputes: each approved refund is shown as the server sent it. Nothing is added up or taken off here.
 * A failed or empty read shows nothing; the order page does not depend on it.
 */
export function DisputeRefundLines({ orderId, style }: { orderId: number; style?: ViewStyle }) {
  const { accessToken } = useSession();
  const query = useQuery({
    queryKey: ['order-disputes', orderId],
    queryFn: () => fetchDisputes(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
    retry: false,
  });

  const approved = (query.data ?? []).filter(
    (d) => d.refundRequest != null && (d.refundRequest.status === 'APPROVED' || d.refundRequest.status === 'OPS_APPROVED'),
  );
  if (approved.length === 0) return null;

  return (
    <View style={[styles.block, style]}>
      {approved.map((d) => (
        <AmountRow
          key={d.id}
          variant="captionEmphasis"
          color={Colors.danger}
          label={`Dispute refund ${d.disputeNumber}`}
          amount={`-${formatMoney(d.refundRequest?.amount)}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.xs },
});
