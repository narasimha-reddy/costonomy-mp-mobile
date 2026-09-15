import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import { receiveOrder, type ReceiveItemInput } from '@/services/trust';
import {
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
import { formatQuantity } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'REST-RECEIVE-01';

interface LineState {
  received: number;
  damaged: number;
  missing: number;
}

/**
 * REST-RECEIVE-01. Doc 05 §17.
 *
 * <p>Ordered, accepted, received, damaged and missing for every line. The server
 * requires received + damaged + missing to equal what was accepted, and this
 * screen shows the arithmetic rather than silently correcting it — a line that
 * does not add up is a real question ("where did the rest go?"), not a validation
 * nuisance.
 *
 * <p><b>The CTA is not a blind "Complete".</b> §23A.22 forbids one: every line
 * starts at "all received" because that is the common case, but a discrepancy has
 * to be entered deliberately, and the summary says what is about to be recorded
 * before it is recorded.
 */
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
    lines[itemId] ?? { received: agreedOf(itemId), damaged: 0, missing: 0 };

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

  const submit = useMutation({
    mutationFn: () => {
      const payload: ReceiveItemInput[] = items.map((item) => {
        const state = stateOf(item.id);
        return {
          supplierOrderItemId: item.id,
          receivedQuantity: String(state.received),
          damagedQuantity: String(state.damaged),
          missingQuantity: String(state.missing),
        };
      });
      return receiveOrder(accessToken as string, orderId, payload, notes || undefined, idempotencyKey);
    },
    onSuccess: (receiving) => {
      track('receiving_completed', { screen: SCREEN, entityId: orderId },
        { discrepancy: receiving.hasDiscrepancy });
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
      if (receiving.hasDiscrepancy) {
        // §17: a discrepancy can become a dispute immediately, while the delivery
        // is still in front of the person who counted it.
        toast.show('Recorded. Raise a dispute if you need to.', 'info');
        router.replace(`/(restaurant)/dispute/${orderId}`);
      } else {
        toast.show('Order received', 'success');
        router.replace(`/(restaurant)/rating/${orderId}`);
      }
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not record that.', 'error'),
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
            <MandiButton
              label={anyDiscrepancy ? 'Complete with discrepancy' : 'Complete receiving'}
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
            Count what arrived. Anything damaged or missing stays on the record and can become a
            dispute.
          </MandiText>

          {items.map((item) => {
            const state = stateOf(item.id);
            const agreed = agreedOf(item.id);
            return (
              <MandiCard key={item.id}>
                <MandiText variant="bodyEmphasis">{item.productName}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Ordered {formatQuantity(item.requestedQuantity)} {item.unit} · supplier accepted{' '}
                  {formatQuantity(String(agreed))} {item.unit}
                </MandiText>

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
              </MandiCard>
            );
          })}

          <MandiFormField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth recording"
          />
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
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  problemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
