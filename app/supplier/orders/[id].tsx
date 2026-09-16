import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import {
  acceptOrder,
  markPreparing,
  markReady,
  partialAcceptOrder,
  rejectOrder,
  type PartialAcceptItem,
  type RejectionReason,
} from '@/services/supplier';
import {
  MandiButton,
  MandiCard,
  MandiCountdown,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiQuantityStepper,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { formatDistance } from '@/utils/orders';
import { PaymentMethodPill } from '@/components/order';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-ORD-01';

const REASONS: { key: RejectionReason; label: string }[] = [
  { key: 'OUT_OF_STOCK', label: 'Out of stock' },
  { key: 'UNABLE_TO_DELIVER', label: 'Unable to deliver' },
  { key: 'STORE_CLOSED', label: 'Store closed' },
  { key: 'PRICE_ISSUE', label: 'Price is wrong' },
  { key: 'BELOW_MINIMUM_ORDER', label: 'Below our minimum' },
  { key: 'OTHER', label: 'Something else' },
];

type Mode = 'view' | 'partial' | 'reject';

/**
 * SUP-ORD-01 through SUP-ORD-05. Doc 05 §25–§28.
 *
 * <p>One screen, because they are one decision followed by its consequences: the
 * supplier looks at an order and either takes it, takes part of it, or declines
 * it — and then moves it along. Splitting that across five screens would put a
 * navigation step inside a sixty-second window.
 *
 * <p><b>The deadline is the server's.</b> §25: "deadline is authoritative from
 * backend".
 *
 * <p><b>Accept and partial-accept carry idempotency keys.</b> One tap on a flaky
 * connection must not become two answers to the same order.
 */
export default function SupplierOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const [mode, setMode] = useState<Mode>('view');
  const [accepted, setAccepted] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [note, setNote] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey());

  const query = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const order = query.data;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'orders', 'pending'] });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'orders', 'active'] });
  }

  function onRefusal(caught: unknown, fallback: string) {
    // The server's message says which of the several real reasons this is —
    // expired, already answered, no longer yours. Replacing it with "failed"
    // would leave the supplier tapping at an order that is already gone.
    toast.show(caught instanceof ApiError ? caught.message : fallback, 'error');
    void query.refetch();
  }

  const accept = useMutation({
    mutationFn: () => acceptOrder(accessToken as string, orderId, idempotencyKey),
    onSuccess: () => {
      track('order_accepted', { screen: SCREEN, entityId: orderId });
      invalidate();
      toast.show('Order accepted', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not accept this order.'),
  });

  const partial = useMutation({
    mutationFn: (items: PartialAcceptItem[]) =>
      partialAcceptOrder(accessToken as string, orderId, items, note || undefined, idempotencyKey),
    onSuccess: () => {
      track('order_partially_accepted', { screen: SCREEN, entityId: orderId });
      invalidate();
      setMode('view');
      toast.show('Partial acceptance sent', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not send that.'),
  });

  const reject = useMutation({
    mutationFn: () =>
      rejectOrder(accessToken as string, orderId, reason as RejectionReason,
        note || undefined, idempotencyKey),
    onSuccess: () => {
      track('order_rejected', { screen: SCREEN, entityId: orderId }, { reason });
      invalidate();
      setMode('view');
      toast.show('Order declined', 'info');
      router.replace('/supplier/orders');
    },
    onError: (caught) => onRefusal(caught, 'Could not decline this order.'),
  });

  const advance = useMutation({
    // A fresh key per transition, not the screen's: `preparing` and `ready` are
    // two different operations, and reusing one key would make the second look
    // like a replay of the first.
    mutationFn: (to: 'preparing' | 'ready') =>
      to === 'preparing'
        ? markPreparing(accessToken as string, orderId, newIdempotencyKey())
        : markReady(accessToken as string, orderId, newIdempotencyKey()),
    onSuccess: (_data, to) => {
      track(to === 'ready' ? 'order_ready' : 'order_preparing', { screen: SCREEN, entityId: orderId });
      invalidate();
    },
    onError: (caught) => onRefusal(caught, 'Could not update this order.'),
  });

  // Every line must be answered — an omitted line is unanswered, not declined
  // (doc 04 §11). So the map is seeded with the full requested quantity and the
  // supplier reduces what they cannot supply.
  const partialItems = useMemo<PartialAcceptItem[]>(() => {
    if (!order) return [];
    return order.items.map((item) => ({
      supplierOrderItemId: item.id,
      acceptedQuantity: String(accepted[item.id] ?? Number(item.requestedQuantity)),
    }));
  }, [order, accepted]);

  const anyReduced = useMemo(
    () => order != null && order.items.some(
      (item) => (accepted[item.id] ?? Number(item.requestedQuantity)) < Number(item.requestedQuantity),
    ),
    [order, accepted],
  );

  const pending = order?.status === 'PENDING_ACCEPTANCE';

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={order?.outletName ?? 'Order'}
          subtitle={order?.restaurantName ?? undefined}
          back
        />
      }
      footer={renderFooter()}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error || order == null ? (
        <MandiErrorState message="Couldn't load this order." onRetry={() => query.refetch()} />
      ) : (
        <>
          <MandiCard>
            {/* Where it is going, then what it is called and how it is paid for.
                The supplier is deciding inside a sixty-second window, and the
                first of those is the one they cannot look up later. */}
            <View style={styles.row}>
              <View style={styles.where}>
                <MandiText variant="bodyEmphasis" numberOfLines={2}>
                  {[order.outletLocality, order.outletCity].filter(Boolean).join(', ')
                    || order.outletName}
                </MandiText>
                {formatDistance(order.distanceKm) ? (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {formatDistance(order.distanceKm)} from your store
                  </MandiText>
                ) : null}
              </View>
              <MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} />
            </View>
            {/* The same two columns as the card, so a supplier who tapped
                through finds the four facts where they already were. */}
            <View style={styles.columns}>
              <View style={styles.left}>
                <PaymentMethodPill method={order.paymentMethod} />
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {order.orderNumber}
                </MandiText>
              </View>
              <View style={styles.right}>
                <MandiText variant="price">
                  {formatMoney(pending ? order.totalAmount : order.acceptedAmount)}
                </MandiText>
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {order.items.length} item{order.items.length === 1 ? '' : 's'}
                </MandiText>
              </View>
            </View>
            {pending && order.acceptanceDeadline && (
              <View style={styles.deadline}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Respond within
                </MandiText>
                <MandiCountdown
                  deadlineAt={order.acceptanceDeadline}
                  slaSeconds={order.responseSlaSeconds ?? undefined}
                  size="lg"
                />
              </View>
            )}
          </MandiCard>

          {mode === 'reject' ? (
            <RejectPanel
              reason={reason}
              onReason={setReason}
              note={note}
              onNote={setNote}
            />
          ) : (
            <MandiCard>
              <MandiText variant="bodyEmphasis">
                {mode === 'partial' ? 'What can you supply?' : 'Items'}
              </MandiText>
              {order.items.map((item) => {
                const requested = Number(item.requestedQuantity);
                const value = accepted[item.id] ?? requested;
                return (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.itemHead}>
                      <View style={styles.itemText}>
                        <MandiText variant="body">{item.productName}</MandiText>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          {item.skuName} · {formatMoney(item.unitPrice)} per {item.unit} · GST{' '}
                          {formatGstRate(item.gstRate)}
                        </MandiText>
                      </View>
                      <MandiText variant="bodyEmphasis">{formatMoney(item.lineTotal)}</MandiText>
                    </View>

                    {mode === 'partial' ? (
                      <View style={styles.itemFoot}>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          Asked for {formatQuantity(item.requestedQuantity)} {item.unit}
                        </MandiText>
                        <MandiQuantityStepper
                          value={value}
                          onChange={(next) =>
                            setAccepted((current) => ({ ...current, [item.id]: next }))
                          }
                          min={0}
                          max={requested}
                          unit={item.unit}
                        />
                      </View>
                    ) : (
                      <MandiText variant="caption" color={Colors.textSecondary}>
                        {formatQuantity(item.requestedQuantity)} {item.unit}
                        {item.acceptedQuantity != null &&
                          Number(item.acceptedQuantity) !== requested &&
                          ` · you accepted ${formatQuantity(item.acceptedQuantity)} ${item.unit}`}
                      </MandiText>
                    )}
                  </View>
                );
              })}
            </MandiCard>
          )}

          {mode === 'partial' && anyReduced && (
            <MandiCard accentColor={Colors.warning}>
              <MandiText variant="bodyEmphasis">The rest goes back to the restaurant</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Anything you cannot supply stays on their requirement so they can source it
                elsewhere. You are only charged for what you accept.
              </MandiText>
              <MandiFormField
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="Anything they should know"
              />
            </MandiCard>
          )}

          <MandiCard>
            <Row label="Subtotal" value={formatMoney(order.subtotal)} />
            <Row label="GST" value={formatMoney(order.gstAmount)} />
            <Row label="Order value" value={formatMoney(order.totalAmount)} emphasis />
          </MandiCard>
        </>
      )}
    </MandiScreen>
  );

  function renderFooter() {
    if (order == null) return undefined;

    if (mode === 'reject') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Decline this order"
            size="lg"
            variant="destructive"
            disabled={reason == null}
            loading={reject.isPending}
            onPress={() => reject.mutate()}
          />
          <MandiButton label="Back" variant="tertiary" size="md" onPress={() => setMode('view')} />
        </MandiStickyBar>
      );
    }

    if (mode === 'partial') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Send partial acceptance"
            size="lg"
            loading={partial.isPending}
            onPress={() => partial.mutate(partialItems)}
          />
          <MandiButton label="Back" variant="tertiary" size="md" onPress={() => setMode('view')} />
        </MandiStickyBar>
      );
    }

    if (pending) {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Accept in full"
            size="lg"
            loading={accept.isPending}
            onPress={() => accept.mutate()}
          />
          <View style={styles.secondaryRow}>
            <MandiButton
              label="Accept part"
              variant="secondary"
              size="md"
              onPress={() => setMode('partial')}
              style={styles.flex}
            />
            <MandiButton
              label="Decline"
              variant="tertiary"
              size="md"
              onPress={() => setMode('reject')}
              style={styles.flex}
            />
          </View>
        </MandiStickyBar>
      );
    }

    if (order.status === 'CONFIRMED' || order.status === 'PARTIALLY_ACCEPTED') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Start preparing"
            size="lg"
            loading={advance.isPending}
            onPress={() => advance.mutate('preparing')}
          />
        </MandiStickyBar>
      );
    }

    if (order.status === 'PREPARING') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Ready for pickup"
            size="lg"
            loading={advance.isPending}
            onPress={() => advance.mutate('ready')}
          />
        </MandiStickyBar>
      );
    }

    return undefined;
  }
}

function RejectPanel({
  reason,
  onReason,
  note,
  onNote,
}: {
  reason: RejectionReason | null;
  onReason: (reason: RejectionReason) => void;
  note: string;
  onNote: (note: string) => void;
}) {
  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">Why are you declining?</MandiText>
      <MandiText variant="caption" color={Colors.textSecondary}>
        This is required. It goes to the restaurant so they can source elsewhere, and it is
        counted — &ldquo;out of stock&rdquo; and &ldquo;store closed&rdquo; are different problems.
      </MandiText>
      <View style={styles.reasons}>
        {REASONS.map((option) => {
          const active = option.key === reason;
          return (
            <Pressable
              key={option.key}
              onPress={() => onReason(option.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.reason, active && styles.reasonActive]}
            >
              {active && <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />}
              <MandiText
                variant="caption"
                color={active ? Colors.primary : Colors.textSecondary}
              >
                {option.label}
              </MandiText>
            </Pressable>
          );
        })}
      </View>
      <MandiFormField
        label="Note (optional)"
        value={note}
        onChangeText={onNote}
        placeholder="Anything that helps them understand"
      />
    </MandiCard>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
        {label}
      </MandiText>
      <MandiText variant={emphasis ? 'price' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  where: { flex: 1, gap: 2 },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  left: { flex: 1, gap: 2, alignItems: 'flex-start' },
  right: { gap: 2, alignItems: 'flex-end' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  deadline: { marginTop: Spacing.md, gap: Spacing.xs },
  item: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemHead: { flexDirection: 'row', gap: Spacing.md },
  itemText: { flex: 1, gap: Spacing.xs },
  itemFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  secondaryRow: { flexDirection: 'row', gap: Spacing.sm },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginVertical: Spacing.sm },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  reasonActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
