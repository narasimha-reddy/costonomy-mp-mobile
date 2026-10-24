import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchDispute, fetchRefundLimit, requestDisputeRefund } from '@/services/trust';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  useToast,
} from '@/components/common';
import { DisputeThread } from '@/components/dispute/DisputeThread';
import { categoryLabel } from '@/lib/disputes/categories';
import { RefundStatusCard } from '@/components/dispute/RefundStatusCard';
import { usePermissions } from '@/hooks/usePermissions';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { isAmount } from '@/lib/disputes/refundCopy';
import { OPS_TEAM } from '@/lib/brand';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-DISPUTE-02';

/**
 * REST-DISPUTE-02. One dispute: its conversation, and money back (API D-104).
 *
 * <p><b>A restaurant asks; it never refunds itself.</b> The form sends an amount
 * and a reason, and the supplier — or, after a decline or 48 hours without an
 * answer, {@link OPS_TEAM} — decides. An approval lands in the outlet's wallet.
 *
 * <p>The most that can be asked for is the server's figure (`refund-limit`), shown
 * before asking: the lower of what the order cost and what the supplier is paid
 * for it. Nothing here computes it, and the server checks again on sending.
 */
export default function RestaurantDisputeScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const disputeId = Number(raw);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const idempotency = useIdempotencyKey();

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const dispute = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => fetchDispute(accessToken as string, disputeId),
    enabled: Number.isFinite(disputeId) && accessToken != null,
  });

  const canAsk = canForOutlet('DISPUTE_CREATE', outlet)
    && dispute.data != null
    && dispute.data.refundRequest == null
    && dispute.data.status !== 'RESOLVED'
    && dispute.data.status !== 'REJECTED';

  const limit = useQuery({
    queryKey: ['dispute', disputeId, 'refund-limit'],
    queryFn: () => fetchRefundLimit(accessToken as string, disputeId),
    enabled: canAsk && accessToken != null,
  });

  const ask = useMutation({
    mutationFn: () =>
      requestDisputeRefund(accessToken as string, disputeId, amount.trim(),
        reason.trim() === '' ? undefined : reason.trim(), idempotency.key()),
    onSuccess: () => {
      idempotency.settle();
      setConfirming(false);
      track('dispute_refund_requested', { screen: SCREEN, entityId: disputeId });
      toast.show('Refund requested. The supplier has been told.', 'success');
      void queryClient.invalidateQueries({ queryKey: ['dispute', disputeId] });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outlet?.id, 'disputes'] });
    },
    onError: (caught) => {
      idempotency.settle(caught);
      setConfirming(false);
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that. Try again.', 'error');
      // The ceiling may have moved (another refund, a payout) — ask again.
      void limit.refetch();
    },
  });

  const amountOk = isAmount(amount);

  return (
    <MandiScreen
      header={<MandiHeader title={dispute.data?.disputeNumber ?? 'Dispute'}
        subtitle={dispute.data ? `Order ${dispute.data.orderNumber}` : undefined} back />}
      onRefresh={() => { void dispute.refetch(); if (canAsk) void limit.refetch(); }}
      refreshing={dispute.isRefetching}
    >
      {dispute.isPending ? (
        <MandiSkeletonList count={3} />
      ) : dispute.error || dispute.data == null ? (
        <MandiErrorState message="Couldn't load this dispute." onRetry={() => dispute.refetch()} />
      ) : (
        <>
          <MandiCard onPress={() => router.push(`/restaurant/orders/${dispute.data.supplierOrderId}`)}>
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">
                {categoryLabel(dispute.data.category)}
              </MandiText>
              <MandiStatusChip
                label={dispute.data.status.replace(/_/g, ' ').toLowerCase()}
                tone={dispute.data.status === 'RESOLVED' ? 'success' : 'pending'}
                size="sm"
              />
            </View>
            <MandiText variant="body">{dispute.data.description}</MandiText>
            <View style={styles.assurance}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
              <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                The order stays {dispute.data.supplierOrderStatus.toLowerCase().replace(/_/g, ' ')}.
                A dispute is tracked separately.
              </MandiText>
            </View>
          </MandiCard>

          {dispute.data.refundRequest != null && (
            <RefundStatusCard refund={dispute.data.refundRequest} viewer="restaurant">
              {(dispute.data.refundRequest.status === 'APPROVED'
                || dispute.data.refundRequest.status === 'OPS_APPROVED') && (
                <MandiButton label="Open wallet" variant="secondary" size="md"
                  onPress={() => router.push('/restaurant/wallet')} />
              )}
            </RefundStatusCard>
          )}

          {canAsk && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Ask for money back</MandiText>
              {limit.isPending ? (
                <MandiSkeletonList count={1} />
              ) : limit.error ? (
                <MandiErrorState message="Couldn't check what can be refunded." onRetry={() => limit.refetch()} />
              ) : limit.data?.refusal != null ? (
                <MandiText variant="body" color={Colors.textSecondary}>{limit.data.refusal}</MandiText>
              ) : (
                <>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {`Up to ${formatMoney(limit.data?.maxAmount)}. The supplier has 48 hours to answer; `
                      + `if they decline or don't answer, ${OPS_TEAM} decides. An approved refund goes to your wallet.`}
                  </MandiText>
                  <MandiFormField
                    label="Amount"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    prefix="₹"
                    keyboardType="decimal-pad"
                    required
                  />
                  <MandiFormField
                    label="Why"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="What the refund is for"
                    multiline
                    maxLength={500}
                  />
                  <MandiButton
                    label="Ask for refund"
                    size="lg"
                    disabled={!amountOk}
                    loading={ask.isPending}
                    onPress={() => setConfirming(true)}
                  />
                </>
              )}
            </MandiCard>
          )}

          <DisputeThread dispute={dispute.data} token={accessToken as string} />
        </>
      )}

      <MandiConfirm
        visible={confirming}
        title={`Ask for ${formatMoney(amount.trim())}?`}
        message="The supplier is told now and has 48 hours to answer. You can ask once on this dispute."
        confirmLabel="Ask for refund"
        onConfirm={() => ask.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  assurance: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
});
