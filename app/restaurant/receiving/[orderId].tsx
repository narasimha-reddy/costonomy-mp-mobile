import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder } from '@/services/procurement';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { accountsFor, billedQuantityOf, quantityString, rebalanceReceived, refundOutcome, unaccountedHint, weighedCaption, type RefundOutcome } from '@/lib/orders/receiving';
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
import type { Receiving } from '@/models/trust';
import { Colors, Elevation, FontSize, IconSize, Radius, Spacing } from '@/theme';
import { radioState } from '@/lib/a11y';

const SCREEN = 'REST-RECEIVE-01';

const REJECTION_REASONS = [
  { key: 'DAMAGED_CRATE', label: 'Damaged Crate' },
  { key: 'SPOILED_PERISHABLE', label: 'Spoiled Goods' },
  { key: 'WRONG_GRADE', label: 'Wrong Grade' },
  { key: 'SHORT_DELIVERY', label: 'Short Delivery' },
  { key: 'TEMPERATURE_ABUSE', label: 'Warm/Melted' },
  { key: 'OTHER', label: 'Other' },
];

/**
 * What was recorded, line by line as the server sent it: "Chicken: 0.1 KG missing". A total across lines would add
 * kilos to packets and weighed to ordered quantities, so none is shown and nothing is added up here.
 */
function problemLines(r: Receiving): string[] {
  const out: string[] = [];
  for (const i of r.items) {
    if (Number(i.damagedQuantity) > 0) out.push(`${i.productName}: ${formatQuantity(i.damagedQuantity, i.unit)} damaged`);
    if (Number(i.missingQuantity) > 0) out.push(`${i.productName}: ${formatQuantity(i.missingQuantity, i.unit)} missing`);
  }
  return out;
}

function CheckInSummary({ receiving, centred, heading = true }: { receiving: Receiving; centred?: boolean; heading?: boolean }) {
  const lines = problemLines(receiving);
  if (!receiving.hasDiscrepancy && lines.length === 0) {
    return <MandiText variant="bodyEmphasis" style={centred ? styles.centred : undefined}>All items received as billed</MandiText>;
  }
  return (
    <>
      {/* The refund sheet's own title already says it. */}
      {heading && <MandiText variant="bodyEmphasis" style={centred ? styles.centred : undefined}>Delivery checked in.</MandiText>}
      {lines.map((line) => (
        <MandiText key={line} variant="body" color={Colors.textSecondary} style={centred ? styles.centred : undefined}>{line}</MandiText>
      ))}
    </>
  );
}

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
  // One key per attempt: kept across a retry whose outcome is unknown, replaced once the server answers definitively.
  // A key fixed for the whole screen made every retry after one refusal report "previous attempt failed".
  const idempotency = useIdempotencyKey();
  const [completionModal, setCompletionModal] = useState<RefundOutcome | null>(null);
  // The server's answer to the check-in, kept to say what was recorded before the buyer is asked to rate.
  const [checkedIn, setCheckedIn] = useState<Receiving | null>(null);

  const order = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const items = order.data?.items ?? [];

  /**
   * What the three counts must add up to: the billed quantity on a weighed catch-weight line (API D-128), otherwise
   * what the supplier accepted.
   */
  const agreedOf = (itemId: number): number => {
    const item = items.find((i) => i.id === itemId);
    return item ? billedQuantityOf(item) : 0;
  };

  /**
   * The reason follows the problem entered: damaged goods default to a damaged crate, goods that never came to a short
   * delivery. What the buyer picked wins.
   */
  const reasonOf = (state: LineState): string =>
    state.reason ?? (state.damaged > 0 ? 'DAMAGED_CRATE' : 'SHORT_DELIVERY');

  const stateOf = (itemId: number): LineState =>
    lines[itemId] ?? {
      received: agreedOf(itemId),
      damaged: 0,
      missing: 0,
    };

  function setLine(itemId: number, next: Partial<LineState>) {
    setLines((current) => ({ ...current, [itemId]: { ...stateOf(itemId), ...next } }));
  }

  /** Damaged or Missing entered: Received follows so the three still add up (not on a weighed line). */
  function setProblem(itemId: number, next: Partial<LineState>) {
    const item = items.find((i) => i.id === itemId);
    const merged = { ...stateOf(itemId), ...next };
    const received = item ? rebalanceReceived(item, agreedOf(itemId), merged) : merged.received;
    setLine(itemId, { ...next, received });
  }

  const problems = useMemo(
    () =>
      items
        .map((item) => {
          const state = stateOf(item.id);
          const total = state.received + state.damaged + state.missing;
          const agreed = agreedOf(item.id);
          if (accountsFor(state.received, state.damaged, state.missing, agreed)) return null;
          return {
            id: item.id,
            name: item.productName,
            total,
            agreed,
            unit: item.unit,
            hint: unaccountedHint(state, agreed, item.unit),
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

  const submit = useMutation({
    mutationFn: () => {
      const payload: ReceiveItemInput[] = items.map((item) => {
        const state = stateOf(item.id);
        return {
          supplierOrderItemId: item.id,
          receivedQuantity: quantityString(state.received),
          damagedQuantity: quantityString(state.damaged),
          missingQuantity: quantityString(state.missing),
          rejectionReason:
            state.damaged > 0 || state.missing > 0
              ? reasonOf(state)
              : undefined,
        };
      });
      return receiveOrder(
        accessToken as string,
        orderId,
        payload,
        notes || undefined,
        idempotency.key(),
      );
    },
    onSuccess: (receiving) => {
      idempotency.settle();
      track('receiving_completed', { screen: SCREEN, entityId: orderId },
        { discrepancy: receiving.hasDiscrepancy });
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
      // The refund went back by the order's payment method: the wallet, or the credit invoice.
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['credit'] });

      // Only what the server said: its refund amount, where it went, and a credit note if it has issued one.
      setCheckedIn(receiving);
      const outcome = refundOutcome(receiving, order.data?.paymentMethod);
      if (outcome != null) setCompletionModal(outcome);
    },
    onError: (caught) => {
      idempotency.settle(caught);
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not record that.',
        'error',
      );
    },
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Check in delivery" subtitle={order.data?.orderNumber} back />}
      footer={
        items.length === 0 || checkedIn != null ? undefined : (
          <MandiStickyBar>
            {problems.length > 0 && (
              <View style={styles.problemRow}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                <MandiText variant="caption" color={Colors.danger} style={styles.flex}>
                  {problems[0]?.name}: {formatQuantity(String(problems[0]?.total))} of{' '}
                  {formatQuantity(String(problems[0]?.agreed))} {problems[0]?.unit} accounted for. {problems[0]?.hint}
                </MandiText>
              </View>
            )}

            <MandiButton
              label="Complete check-in"
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
      ) : checkedIn != null && completionModal == null ? (
        <MandiCard>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark-done" size={32} color={Colors.success} />
          </View>
          <CheckInSummary receiving={checkedIn} centred />
          {checkedIn.hasDiscrepancy && (
            // Receiving and disputes are independent on the API: checking in opens nothing, so say what to do.
            <MandiText variant="caption" color={Colors.textSecondary} style={styles.centred}>
              Something was short or damaged. Raise a dispute to get it resolved.
            </MandiText>
          )}
          <View style={styles.confirmActions}>
            {checkedIn.hasDiscrepancy && (
              <MandiButton label="Raise a dispute" size="lg" onPress={() => router.replace(`/restaurant/dispute/${orderId}`)} />
            )}
            <MandiButton
              label="Rate this order"
              size="lg"
              variant={checkedIn.hasDiscrepancy ? 'secondary' : undefined}
              onPress={() => router.replace(`/restaurant/rating/${orderId}`)}
            />
            <MandiButton
              label="Done"
              size="lg"
              variant={checkedIn.hasDiscrepancy ? 'tertiary' : 'secondary'}
              onPress={() => router.replace(`/restaurant/orders/${orderId}`)}
            />
          </View>
        </MandiCard>
      ) : (
        <>
          <MandiText variant="caption" color={Colors.textSecondary}>
            Inspect all items when they arrive. Anything damaged or missing is rejected at the door and refunded to you automatically; the amount is worked out when you complete the check-in.
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
                      {formatQuantity(String(item.acceptedQuantity ?? item.requestedQuantity))} {item.unit}
                    </MandiText>
                    {weighedCaption(item) != null && (
                      <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
                        {weighedCaption(item)}
                      </MandiText>
                    )}
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
                  onChange={(damaged) => setProblem(item.id, { damaged })}
                />
                <Line
                  label="Missing"
                  value={state.missing}
                  max={agreed}
                  unit={item.unit}
                  onChange={(missing) => setProblem(item.id, { missing })}
                />

                {hasRejection && (
                  <View style={styles.rejectionSection}>
                    <MandiText variant="captionEmphasis" color={Colors.danger}>
                      Why was it rejected?
                    </MandiText>
                    <View style={styles.reasonsList}>
                      {REJECTION_REASONS.map((r) => {
                        const active = reasonOf(state) === r.key;
                        return (
                          <Pressable
                            key={r.key}
                            style={[styles.reasonChip, active && styles.reasonChipActive]}
                            onPress={() => setLine(item.id, { reason: r.key })}
                            accessibilityRole="radio"
                            accessibilityState={radioState(active)}
                            accessibilityLabel={`${r.label} for ${item.productName}`}
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
            title="Delivery checked in"
          >
            <View style={styles.modalContent}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-done" size={32} color={Colors.success} />
              </View>
              <MandiText variant="title" style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                Refund of {completionModal?.amount}
              </MandiText>
              {completionModal?.where != null && (
                <MandiText
                  variant="body"
                  color={Colors.textSecondary}
                  style={{ textAlign: 'center', marginTop: 4 }}
                >
                  {completionModal.where}
                </MandiText>
              )}

              {checkedIn != null && <CheckInSummary receiving={checkedIn} centred heading={false} />}

              <View style={styles.creditNoteCard}>
                {completionModal?.lines.map((line) => (
                  <View key={line.name} style={styles.creditNoteRow}>
                    <MandiText variant="caption" color={Colors.textSecondary}>{line.name}</MandiText>
                    <MandiText variant="captionEmphasis">{line.amount}</MandiText>
                  </View>
                ))}
                <View style={styles.creditNoteRow}>
                  <MandiText variant="caption" color={Colors.textSecondary}>Total refund</MandiText>
                  <MandiText variant="bodyEmphasis" color={Colors.success}>{completionModal?.amount}</MandiText>
                </View>
                {completionModal?.creditNoteNumber != null && (
                  <View style={styles.creditNoteRow}>
                    <MandiText variant="caption" color={Colors.textSecondary}>Credit note</MandiText>
                    <MandiText variant="captionEmphasis">{completionModal.creditNoteNumber}</MandiText>
                  </View>
                )}
              </View>

              <View style={{ gap: Spacing.sm, marginTop: Spacing.lg, width: '100%' }}>
                {completionModal?.toWallet && (
                  <MandiButton
                    label="View Wallet Balance"
                    size="md"
                    onPress={() => {
                      setCompletionModal(null);
                      router.replace('/restaurant/wallet');
                    }}
                  />
                )}
                <MandiButton
                  label="Rate this order"
                  size="md"
                  variant={completionModal?.toWallet ? 'secondary' : undefined}
                  onPress={() => {
                    setCompletionModal(null);
                    router.replace(`/restaurant/rating/${orderId}`);
                  }}
                />
                {checkedIn?.hasDiscrepancy && (
                  <MandiButton
                    label="Raise a dispute"
                    variant="secondary"
                    size="md"
                    onPress={() => {
                      setCompletionModal(null);
                      router.replace(`/restaurant/dispute/${orderId}`);
                    }}
                  />
                )}
                <MandiButton
                  label="Done"
                  variant="tertiary"
                  size="md"
                  onPress={() => {
                    setCompletionModal(null);
                    router.replace(`/restaurant/orders/${orderId}`);
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
      <MandiQuantityStepper value={value} onChange={onChange} min={0} max={max} unit={unit} editable />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centred: { textAlign: 'center' },
  confirmActions: { gap: Spacing.sm, marginTop: Spacing.md },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  catchWeightPill: {
    backgroundColor: Colors.warningLight,
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
