import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { approveDisputeRefund, declineDisputeRefund, fetchDispute } from '@/services/trust';
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
import { refundCopy } from '@/lib/disputes/refundCopy';
import { serverNow } from '@/lib/server-clock';
import { OPS_TEAM } from '@/lib/brand';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'SUP-DISPUTE-02';

type Decision = 'approve' | 'decline';

/**
 * SUP-DISPUTE-02. A dispute on the store's order, and the refund asked for on it
 * (API D-104).
 *
 * <p><b>An approval is the supplier's money.</b> It is added to the restaurant's
 * wallet at once and taken from the supplier's payout for this order, and the
 * confirmation says exactly that, with the amount, before anything is sent.
 * Declining needs a reason, because {@link OPS_TEAM} will read it when they decide.
 *
 * <p>Deciding needs `DISPUTE_REFUND_DECIDE` — owner, admin, store manager or
 * finance. Anyone else sees the request and is told who can answer it.
 */
export default function SupplierDisputeScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const disputeId = Number(raw);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { store } = useStore();
  const { canForStore } = usePermissions();
  const idempotency = useIdempotencyKey();

  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<Decision | null>(null);

  const dispute = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => fetchDispute(accessToken as string, disputeId),
    enabled: Number.isFinite(disputeId) && accessToken != null,
  });

  const refund = dispute.data?.refundRequest ?? null;
  const actionable = refund != null && refundCopy(refund, 'supplier', serverNow()).actionable;
  const mayDecide = canForStore('DISPUTE_REFUND_DECIDE', store);

  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      decision === 'approve'
        ? approveDisputeRefund(accessToken as string, refund!.id,
          note.trim() === '' ? undefined : note.trim(), idempotency.key())
        : declineDisputeRefund(accessToken as string, refund!.id, note.trim(), idempotency.key()),
    onSuccess: (_, decision) => {
      idempotency.settle();
      setConfirming(null);
      setDeclining(false);
      track(decision === 'approve' ? 'dispute_refund_approved' : 'dispute_refund_declined',
        { screen: SCREEN, entityId: disputeId });
      toast.show(decision === 'approve'
        ? 'Approved. The restaurant has been refunded.'
        : `Declined. ${OPS_TEAM} will decide.`, 'success');
      void queryClient.invalidateQueries({ queryKey: ['dispute', disputeId] });
      void queryClient.invalidateQueries({ queryKey: ['store', store?.id, 'disputes'] });
    },
    onError: (caught) => {
      idempotency.settle(caught);
      setConfirming(null);
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that. Try again.', 'error');
      // Someone else may have decided it meanwhile: show what is true now.
      void dispute.refetch();
    },
  });

  return (
    <MandiScreen
      header={<MandiHeader title={dispute.data?.disputeNumber ?? 'Dispute'}
        subtitle={dispute.data ? `Order ${dispute.data.orderNumber}` : undefined} back />}
      onRefresh={() => dispute.refetch()}
      refreshing={dispute.isRefetching}
    >
      {dispute.isPending ? (
        <MandiSkeletonList count={3} />
      ) : dispute.error || dispute.data == null ? (
        <MandiErrorState message="Couldn't load this dispute." onRetry={() => dispute.refetch()} />
      ) : (
        <>
          <MandiCard onPress={() => router.push(`/supplier/orders/${dispute.data.supplierOrderId}`)}>
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
          </MandiCard>

          {refund != null && (
            <RefundStatusCard refund={refund} viewer="supplier">
              {actionable && !mayDecide && (
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Your owner, admin, store manager or finance team can answer this.
                </MandiText>
              )}
              {actionable && mayDecide && !declining && (
                <View style={styles.actions}>
                  <MandiButton label="Approve Refund" size="md"
                    loading={decide.isPending && confirming === 'approve'}
                    onPress={() => setConfirming('approve')} />
                  <MandiButton label="Decline" variant="secondary" size="md"
                    onPress={() => setDeclining(true)} />
                </View>
              )}
              {actionable && mayDecide && declining && (
                <>
                  <MandiFormField
                    label="Why are you declining?"
                    value={note}
                    onChangeText={setNote}
                    placeholder={`${OPS_TEAM} and the restaurant will read this`}
                    multiline
                    maxLength={500}
                    required
                  />
                  <View style={styles.actions}>
                    <MandiButton label="Decline Refund" variant="secondary" size="md"
                      disabled={note.trim().length === 0}
                      loading={decide.isPending && confirming === 'decline'}
                      onPress={() => setConfirming('decline')} />
                    <MandiButton label="Back" variant="tertiary" size="md"
                      onPress={() => setDeclining(false)} />
                  </View>
                </>
              )}
            </RefundStatusCard>
          )}

          <DisputeThread dispute={dispute.data} token={accessToken as string} />
        </>
      )}

      <MandiConfirm
        visible={confirming === 'approve'}
        title={`Refund ${formatMoney(refund?.amount)}?`}
        message={`${formatMoney(refund?.amount)} is added to the restaurant's wallet now and taken from `
          + `your payout for order ${dispute.data?.orderNumber ?? ''}. This can't be undone.`}
        confirmLabel="Approve Refund"
        destructive
        onConfirm={() => decide.mutate('approve')}
        onCancel={() => setConfirming(null)}
      />
      <MandiConfirm
        visible={confirming === 'decline'}
        title="Decline this refund?"
        message={`${OPS_TEAM} will then decide, and may still approve it.`}
        confirmLabel="Decline Refund"
        onConfirm={() => decide.mutate('decline')}
        onCancel={() => setConfirming(null)}
      />
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
});
