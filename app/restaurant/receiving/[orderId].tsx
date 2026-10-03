import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import { receiveOrder, type ReceiveItemInput } from '@/services/trust';
import {
  MandiBottomSheet,
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney, formatQuantity } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Elevation, FontSize, IconSize, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-RECEIVE-01';

const REJECTION_REASONS = [
  { key: 'DAMAGED_CRATE', label: 'Damaged Crate' },
  { key: 'SPOILED_PERISHABLE', label: 'Spoiled Goods' },
  { key: 'WRONG_GRADE', label: 'Wrong Grade' },
  { key: 'SHORT_DELIVERY', label: 'Short Delivery' },
  { key: 'TEMPERATURE_ABUSE', label: 'Warm/Melted' },
  { key: 'OTHER', label: 'Other' },
];

interface LineState {
  received: number;
  damaged: number;
  missing: number;
  reason?: string;
}

export default function ReceivingScreen() {
  const { orderId: raw } = useLocalSearchParams<{ orderId: string }>();
  const orderId = Number(raw);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  const [lines, setLines] = useState<Record<number, LineState>>({});
  const [notes, setNotes] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const [completionModal, setCompletionModal] = useState<{
    creditNoteNumber: string | null;
    instantRefundAmount: string | null;
  } | null>(null);

  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const items = order.data?.items ?? [];

  /** What was actually agreed: the accepted quantity, falling back to requested. */
  const agreedOf = (itemId: number): number => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return 0;
    return Number(item.acceptedQuantity ?? item.requestedQuantity);
  };

  const stateOf = (itemId: number): LineState =>
    lines[itemId] ?? {
      received: agreedOf(itemId),
      damaged: 0,
      missing: 0,
      reason: 'DAMAGED_CRATE',
    };

  function setLine(itemId: number, next: Partial<LineState>) {
    setLines((current) => ({ ...current, [itemId]: { ...stateOf(itemId), ...next } }));
  }

  const problems = useMemo(
    () =>
      items
        .map((item) => {
          const state = stateOf(item.id);
          const total = state.received + state.damaged + state.missing;
          const agreed = agreedOf(item.id);
          if (total === agreed) return null;
          return {
            id: item.id,
            name: item.productName,
            total,
            agreed,
            unit: item.unit,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, lines],
  );

  const anyDiscrepancy = items.some((item) => {
    const state = stateOf(item.id);
    return state.damaged > 0 || state.missing > 0;
  });

  const estimatedRefund = useMemo(() => {
    let sum = 0;
    items.forEach((item) => {
      const state = stateOf(item.id);
      const rejected = state.damaged + state.missing;
      if (rejected > 0) {
        const lineTotal =
          item.acceptedLineTotal != null
            ? parseFloat(item.acceptedLineTotal)
            : parseFloat(item.lineTotal);
        const agreed = agreedOf(item.id);
        if (agreed > 0) {
          sum += (lineTotal / agreed) * rejected;
        }
      }
    });
    return sum;
  }, [items, lines]);

  const submit = useMutation({
    mutationFn: () => {
      const payload: ReceiveItemInput[] = items.map((item) => {
        const state = stateOf(item.id);
        return {
          supplierOrderItemId: item.id,
          receivedQuantity: String(state.received),
          damagedQuantity: String(state.damaged),
          missingQuantity: String(state.missing),
          rejectionReason:
            state.damaged > 0 || state.missing > 0
              ? state.reason ?? 'DAMAGED_CRATE'
              : undefined,
        };
      });
      return receiveOrder(
        accessToken as string,
        orderId,
        payload,
        notes || undefined,
        idempotencyKey,
      );
    },
    onSuccess: (receiving) => {
      track('receiving_completed', { screen: SCREEN, entityId: orderId },
        { discrepancy: receiving.hasDiscrepancy });
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });

      if (
        receiving.instantRefundAmount != null &&
        parseFloat(receiving.instantRefundAmount) > 0
      ) {
        setCompletionModal({
          creditNoteNumber: receiving.creditNoteNumber ?? `CN-${orderId}-01`,
          instantRefundAmount: receiving.instantRefundAmount,
        });
      } else if (receiving.hasDiscrepancy) {
        toast.show('Recorded with discrepancies. Dispute opened.', 'info');
        router.replace(`/restaurant/dispute/${orderId}`);
      } else {
        toast.show('Order received successfully', 'success');
        router.replace(`/restaurant/rating/${orderId}`);
      }
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not record that.',
        'error',
      ),
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Check in delivery" subtitle={order.data?.orderNumber} back />}
      footer={
        items.length === 0 ? undefined : (
          <MandiStickyBar>
            {problems.length > 0 && (
              <View style={styles.problemRow}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                <MandiText variant="caption" color={Colors.danger} style={styles.flex}>
                  {problems[0]?.name}: {formatQuantity(String(problems[0]?.total))} of{' '}
                  {formatQuantity(String(problems[0]?.agreed))} {problems[0]?.unit} accounted for.
                </MandiText>
              </View>
            )}

            {estimatedRefund > 0 && (
              <View style={styles.refundPreviewBanner}>
                <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
                <MandiText variant="captionEmphasis" color={Colors.primary}>
                  Estimated Instant Refund: ~₹{estimatedRefund.toFixed(2)} to Costonomy Wallet
                </MandiText>
              </View>
            )}

            <MandiButton
              label={
                anyDiscrepancy
                  ? 'Sign Off & Issue Credit Note'
                  : 'Complete receiving'
              }
              size="lg"
              disabled={problems.length > 0}
              loading={submit.isPending}
              onPress={() => submit.mutate()}
            />
          </MandiStickyBar>
        )
      }
    >
      {order.isPending ? (
        <MandiSkeletonList count={3} />
      ) : order.error ? (
        <MandiErrorState message="Couldn't load this order." onRetry={() => order.refetch()} />
      ) : (
        <>
          <MandiText variant="caption" color={Colors.textSecondary}>
            Inspect all items upon delivery. Damaged or missing quantities are rejected at the door and automatically refunded with an instant Credit Note.
          </MandiText>

          {items.map((item) => {
            const state = stateOf(item.id);
            const agreed = agreedOf(item.id);
            const hasRejection = state.damaged > 0 || state.missing > 0;

            return (
              <MandiCard key={item.id}>
                <View style={styles.itemHeaderRow}>
                  <View style={styles.flex}>
                    <MandiText variant="bodyEmphasis">{item.productName}</MandiText>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      Ordered {formatQuantity(item.requestedQuantity)} {item.unit} · supplier accepted{' '}
                      {formatQuantity(String(agreed))} {item.unit}
                    </MandiText>
                  </View>
                  {item.isCatchWeight && (
                    <View style={styles.catchWeightPill}>
                      <MandiText variant="caption" color={Colors.warning}>
                        ⚖️ Catch-weight
                      </MandiText>
                    </View>
                  )}
                </View>

                <Line
                  label="Received"
                  value={state.received}
                  max={agreed}
                  unit={item.unit}
                  onChange={(received) => setLine(item.id, { received })}
                />
                <Line
                  label="Damaged"
                  value={state.damaged}
                  max={agreed}
                  unit={item.unit}
                  onChange={(damaged) => setLine(item.id, { damaged })}
                />
                <Line
                  label="Missing"
                  value={state.missing}
                  max={agreed}
                  unit={item.unit}
                  onChange={(missing) => setLine(item.id, { missing })}
                />

                {hasRejection && (
                  <View style={styles.rejectionSection}>
                    <MandiText variant="captionEmphasis" color={Colors.danger}>
                      Rejection Reason (for Credit Note):
                    </MandiText>
                    <View style={styles.reasonsList}>
                      {REJECTION_REASONS.map((r) => {
                        const active = (state.reason ?? 'DAMAGED_CRATE') === r.key;
                        return (
                          <Pressable
                            key={r.key}
                            style={[styles.reasonChip, active && styles.reasonChipActive]}
                            onPress={() => setLine(item.id, { reason: r.key })}
                          >
                            <MandiText
                              variant="caption"
                              color={active ? Colors.surface : Colors.textSecondary}
                            >
                              {r.label}
                            </MandiText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              </MandiCard>
            );
          })}

          <MandiFormField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth recording"
          />

          <MandiBottomSheet
            visible={completionModal != null}
            onClose={() => {
              setCompletionModal(null);
              router.replace(`/restaurant/rating/${orderId}`);
            }}
            title="Doorstep Sign-Off Complete"
          >
            <View style={styles.modalContent}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-done" size={32} color={Colors.success} />
              </View>
              <MandiText variant="title" style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                Instant Credit Note Issued
              </MandiText>
              <MandiText
                variant="body"
                color={Colors.textSecondary}
                style={{ textAlign: 'center', marginTop: 4 }}
              >
                ₹{completionModal?.instantRefundAmount} has been refunded to your Costonomy Wallet.
              </MandiText>

              <View style={styles.creditNoteCard}>
                <View style={styles.creditNoteRow}>
                  <MandiText variant="caption" color={Colors.textSecondary}>Credit Note #</MandiText>
                  <MandiText variant="captionEmphasis">{completionModal?.creditNoteNumber}</MandiText>
                </View>
                <View style={styles.creditNoteRow}>
                  <MandiText variant="caption" color={Colors.textSecondary}>Refund Amount</MandiText>
                  <MandiText variant="bodyEmphasis" color={Colors.success}>
                    ₹{completionModal?.instantRefundAmount}
                  </MandiText>
                </View>
                <View style={styles.creditNoteRow}>
                  <MandiText variant="caption" color={Colors.textSecondary}>Credited To</MandiText>
                  <MandiText variant="captionEmphasis">Costonomy Wallet</MandiText>
                </View>
              </View>

              <View style={{ gap: Spacing.sm, marginTop: Spacing.lg, width: '100%' }}>
                <MandiButton
                  label="View Wallet Balance"
                  size="md"
                  onPress={() => {
                    setCompletionModal(null);
                    router.replace('/restaurant/wallet');
                  }}
                />
                <MandiButton
                  label="Rate Delivery & Supplier"
                  variant="neutral"
                  size="md"
                  onPress={() => {
                    setCompletionModal(null);
                    router.replace(`/restaurant/rating/${orderId}`);
                  }}
                />
              </View>
            </View>
          </MandiBottomSheet>
        </>
      )}
    </MandiScreen>
  );
}

function Line({
  label,
  value,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.line}>
      <MandiText variant="body" color={Colors.textSecondary}>{label}</MandiText>
      <MandiQuantityStepper value={value} onChange={onChange} min={0} max={max} unit={unit} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  catchWeightPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  problemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  refundPreviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#EFF6FF',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },
  rejectionSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
    gap: Spacing.xs,
  },
  reasonsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  reasonChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  reasonChipActive: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  modalContent: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditNoteCard: {
    width: '100%',
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  creditNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
