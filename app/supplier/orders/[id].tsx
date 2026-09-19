import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import {
  markDelivered,
  markOutForDelivery,
  markPreparing,
  markReady,
  supplierCancelOrder,
} from '@/services/supplier';
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
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { DeliveryMode, orderStatusFor, resolveStatus } from '@/models/status';
import type { SupplierOrder, SupplierOrderStatus } from '@/models/procurement';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { formatDistance, orderValue } from '@/utils/orders';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { PaymentMethodPill } from '@/components/order';
import { ProductThumb } from '@/components/product/ProductThumb';
import { track } from '@/analytics';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'SUP-ORD-01';

/**
 * Why a supplier is backing out. D-091 turned these from rejection reasons into
 * cancellation reasons; the words a supplier would use have not changed.
 */
const REASONS: { key: string; label: string }[] = [
  { key: 'OUT_OF_STOCK', label: 'Out of stock' },
  { key: 'UNABLE_TO_DELIVER', label: 'Unable to deliver' },
  { key: 'STORE_CLOSED', label: 'Store closed' },
  { key: 'PRICE_ISSUE', label: 'Price is wrong' },
  { key: 'BELOW_MINIMUM_ORDER', label: 'Below our minimum' },
  { key: 'OTHER', label: 'Something else' },
];

/**
 * SUP-ORD-01 — one order, as the store that has to fulfil it sees it.
 *
 * <p><b>Nothing here accepts an order.</b> D-088 moved the supplier's commitment
 * to the request and D-091 removed the second acceptance entirely: an order
 * exists because this store already said yes, and because the restaurant paid
 * against that answer. So the screen that used to carry accept, accept-in-part
 * and decline now carries the work — prepare it, mark it ready, and move it if
 * this store is the one carrying it.
 *
 * <p><b>The mode decides the buttons.</b> Under `SUPPLIER_DELIVERY` this store is
 * the courier and may report the van leaving and arriving. Under
 * `COSTONOMY_DELIVERY` it may not (§23A.38) — those states come from the
 * provider's events, and the screen says so rather than offering a button the
 * server would refuse. Under `PICKUP` there is no delivery leg at all: the
 * kitchen collects, and confirming what they collected is what completes it.
 *
 * <p>Cancelling is the one way out of an order this store cannot fulfil, and it
 * refunds. That is the difference from the rejection it replaced, and it is why
 * it is confirmed rather than being one tap.
 */
export default function SupplierOrderScreen() {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{ id: string }>();
  const orderId = Number(params.id);

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string>('OUT_OF_STOCK');
  const [note, setNote] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const query = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const order = query.data;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
    queryClient.invalidateQueries({ queryKey: ['supplier-orders', storeId] });
  }

  /**
   * Report what the server said, not what the tap meant.
   *
   * <p>A refusal here is usually the order having moved underneath the screen —
   * the restaurant cancelled, or a courier's event landed first. Guardrail 4:
   * the state comes back from the server, so the screen reloads rather than
   * assuming the action took.
   */
  function onRefusal(caught: unknown, fallback: string) {
    const message = caught instanceof ApiError ? caught.message : fallback;
    show(message, 'error');
    invalidate();
  }

  const advance = useMutation({
    mutationFn: ({ to }: { to: SupplierOrderStatus }) => {
      const key = newIdempotencyKey();
      const token = accessToken as string;
      if (to === 'PREPARING') return markPreparing(token, orderId, key);
      if (to === 'READY_FOR_PICKUP') return markReady(token, orderId, key);
      if (to === 'OUT_FOR_DELIVERY') return markOutForDelivery(token, orderId, key);
      return markDelivered(token, orderId, key);
    },
    onSuccess: (updated, variables) => {
      track('supplier_order_advanced', { screen: SCREEN, entityId: orderId },
        { to: variables.to });
      queryClient.setQueryData(['supplier-order', orderId], updated);
      invalidate();
    },
    onError: (caught) => onRefusal(caught, "Couldn't update this order."),
  });

  const cancel = useMutation({
    mutationFn: () => supplierCancelOrder(
      accessToken as string, orderId,
      note.trim() ? `${reason}: ${note.trim()}` : reason,
      newIdempotencyKey(),
    ),
    onSuccess: (updated) => {
      track('supplier_order_cancelled', { screen: SCREEN, entityId: orderId },
        { reason });
      queryClient.setQueryData(['supplier-order', orderId], updated);
      invalidate();
      setCancelling(false);
      // Navigating rather than toasting: the authoritative state is the order,
      // and a toast is not a confirmation.
      show('Order cancelled. The restaurant has been refunded.');
    },
    onError: (caught) => onRefusal(caught, "Couldn't cancel this order."),
  });

  const mode = order?.deliveryMode ?? null;
  const busy = advance.isPending || cancel.isPending;

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
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      <MandiConfirm
        visible={confirmingCancel}
        title="Cancel this order?"
        message="The restaurant has already paid, so this refunds them. It cannot be undone."
        confirmLabel="Cancel order"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          setConfirmingCancel(false);
          cancel.mutate();
        }}
        onCancel={() => setConfirmingCancel(false)}
      />

      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error || order == null ? (
        <MandiErrorState message="Couldn't load this order." onRetry={() => query.refetch()} />
      ) : (
        <>
          <MandiCard>
            {/* Status leads and the reference follows, as on a request: the two
                screens describe stages of one thing, and a reader should not
                have to re-learn where to look. */}
            <View style={styles.row}>
              <MandiStatusChip {...orderStatusFor(order.status, mode)} />
              <MandiText variant="caption" color={Colors.textTertiary}>
                {order.orderNumber}
              </MandiText>
            </View>
            <MandiText variant="caption" color={Colors.textTertiary}>
              {formatMomentWithRecency(order.createdAt)}
            </MandiText>

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
            </View>

            <View style={styles.valueRow}>
              <MandiText variant="price">{formatMoney(orderValue(order))}</MandiText>
              <MandiText variant="caption" color={Colors.textTertiary}>
                {order.items.length} item{order.items.length === 1 ? '' : 's'}
              </MandiText>
              <PaymentMethodPill method={order.paymentMethod} />
            </View>

            {/* How it travels, which is what the buttons below depend on. Shown
                rather than inferred from which actions appear, because a
                supplier deciding whether to load a van should not have to work
                that out from an absent button. */}
            {mode != null && (
              <View style={styles.valueRow}>
                <MandiStatusChip {...resolveStatus(DeliveryMode, mode)} size="sm" />
                {mode === 'PICKUP' ? (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    The restaurant collects from your store
                  </MandiText>
                ) : null}
              </View>
            )}

            {order.status === 'CANCELLED' && order.cancellationReason ? (
              <MandiText variant="caption" color={Colors.textSecondary}>
                {order.cancelledBy === 'SUPPLIER' ? 'You cancelled' : 'Cancelled'}
                {' — '}{order.cancellationReason}
              </MandiText>
            ) : null}
          </MandiCard>

          {cancelling ? (
            <CancelPanel
              reason={reason}
              onReason={setReason}
              note={note}
              onNote={setNote}
            />
          ) : (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Items</MandiText>
              {order.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemHead}>
                    {/* 44pt, not the card's 26: here the supplier is checking
                        they have the right thing, and a picture too small to
                        recognise is decoration. */}
                    <ProductThumb uri={item.productImageUrl} size={44} radius={Radius.sm} />
                    <View style={styles.flex}>
                      <MandiText variant="body" numberOfLines={2}>
                        {item.productName}
                      </MandiText>
                      <MandiText variant="caption" color={Colors.textSecondary}>
                        {skuSecondaryLine(item.sku, item.unitPriceInclusiveGst)}
                      </MandiText>
                    </View>
                  </View>
                  <View style={styles.itemFoot}>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {formatQuantity(item.requestedQuantity)} {item.unit}
                      {item.gstRate != null ? ` · GST ${formatGstRate(item.gstRate)}` : ''}
                    </MandiText>
                    <MandiText variant="bodyEmphasis">
                      {formatMoney(item.lineTotal)}
                    </MandiText>
                  </View>
                </View>
              ))}
            </MandiCard>
          )}
        </>
      )}
    </MandiScreen>
  );

  /**
   * The one action this store can take right now, plus the way out.
   *
   * <p>One primary button, never a row of them: at any point in an order's life
   * there is exactly one next step, and offering the others greyed out asks the
   * supplier to work out which applies.
   */
  function renderFooter() {
    if (order == null) return null;

    if (cancelling) {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Cancel order"
            variant="destructive"
            size="md"
            loading={cancel.isPending}
            onPress={() => setConfirmingCancel(true)}
          />
          <MandiButton
            label="Back"
            variant="neutral"
            size="md"
            onPress={() => setCancelling(false)}
          />
        </MandiStickyBar>
      );
    }

    const next = nextStep(order);

    if (next == null) {
      // Delivered, completed or cancelled. Nothing to do, and no bar rather than
      // a bar with nothing in it.
      return null;
    }

    return (
      <MandiStickyBar>
        <MandiButton
          label={next.label}
          variant="primary"
          size="md"
          loading={busy}
          onPress={() => advance.mutate({ to: next.to })}
        />
        {/* Only while the goods are still in the store. Doc 01 §13: once they
            have left, the path is return or dispute. */}
        {(order.status === 'CONFIRMED' || order.status === 'PREPARING') && (
          <MandiButton
            label="Cannot fulfil"
            variant="neutral"
            size="md"
            onPress={() => setCancelling(true)}
          />
        )}
      </MandiStickyBar>
    );
  }
}

/**
 * The single next transition, given where the order is and who carries it.
 *
 * <p>Returns null where this store has nothing to do — including the whole
 * delivery leg of a Costonomy order, which moves on the courier's events.
 */
function nextStep(
  order: SupplierOrder,
): { to: SupplierOrderStatus; label: string } | null {
  const mode = order.deliveryMode;

  switch (order.status) {
    case 'CONFIRMED':
      return { to: 'PREPARING', label: 'Start preparing' };
    case 'PREPARING':
      return {
        to: 'READY_FOR_PICKUP',
        label: mode === 'PICKUP' ? 'Ready to collect' : 'Mark ready',
      };
    case 'READY_FOR_PICKUP':
      // Only the supplier's own van. A pickup waits on the kitchen, and a
      // courier reports itself.
      return mode === 'SUPPLIER_DELIVERY'
        ? { to: 'OUT_FOR_DELIVERY', label: 'Out for delivery' }
        : null;
    case 'OUT_FOR_DELIVERY':
      return mode === 'SUPPLIER_DELIVERY'
        ? { to: 'DELIVERED', label: 'Mark delivered' }
        : null;
    default:
      return null;
  }
}

/** Why the order cannot be fulfilled, in the supplier's own words. */
function CancelPanel({
  reason,
  onReason,
  note,
  onNote,
}: {
  reason: string;
  onReason: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
}) {
  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">Why can&apos;t you fulfil this?</MandiText>
      <MandiText variant="caption" color={Colors.textSecondary}>
        The restaurant is refunded in full, and they are told the reason.
      </MandiText>
      <View style={styles.reasons}>
        {REASONS.map((option) => {
          const active = reason === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => onReason(option.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.reason, active && styles.reasonActive]}
            >
              <MandiText
                variant="caption"
                color={active ? Colors.surface : Colors.textSecondary}
              >
                {option.label}
              </MandiText>
            </Pressable>
          );
        })}
      </View>
      <MandiFormField
        label="Anything to add?"
        value={note}
        onChangeText={onNote}
        placeholder="Optional"
        multiline
      />
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  where: { flex: 1, gap: 2 },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  item: {
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  itemFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  reason: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  reasonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
});
