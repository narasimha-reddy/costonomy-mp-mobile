import { SUPPLIER_CANCEL_TOAST, SUPPLIER_CANCELLED_LINE } from '@/lib/payments/statusLabel';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { billingFailureMessage } from '@/lib/billing/messages';
import { fetchTaxInvoice, fetchCreditNotes, generateTaxInvoice, type TaxInvoice, type CreditNote } from '@/services/billing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchSupplierOrder, newIdempotencyKey } from '@/services/procurement';
import {
  fetchDelivery,
  requestDelivery,
  reassignDelivery,
  switchToOwnDelivery,
  markDeliveryDispatched,
  markDeliveryDelivered,
} from '@/services/delivery';
import {
  markPreparing,
  markReady,
  markOutForDelivery,
  markDelivered,
  supplierCancelOrder,
  recordDispatchWeights,
  type RecordDispatchWeightItem,
} from '@/services/supplier';
import {
  MandiBottomSheet,
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiErrorState,
  MandiFormField,
  MandiChatAction,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { DeliveryMode, resolveStatus } from '@/models/status';
import type { SupplierOrder, SupplierOrderStatus } from '@/models/procurement';
import { ApiError } from '@/lib/api/errors';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import {
  buildWeighPayload, canWeigh, catchWeightLines, initialWeights, readyBlockedMessage, weighedLine,
  weightAdjustmentCopy,
} from '@/lib/orders/catchWeight';
import { formatDistance, orderValue } from '@/utils/orders';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { ColdChainBanner, PaymentMethodPill } from '@/components/order';
import { ProductThumb } from '@/components/product/ProductThumb';
import { TrackingCards } from '@/components/delivery/TrackingCards';
import { usePressGuard } from '@/hooks/usePressGuard';
import { useTimeoutFlag } from '@/hooks/useTimeoutFlag';
import { FIND_TIMEOUT_MS, deliveryPollMs, partnerAwaitPhase } from '@/lib/delivery/partnerSearch';
import { partyTitle } from '@/lib/supplier/partyTitle';
import { useServerNow } from '@/hooks/useServerNow';
import { canRetryPartner, wantsDeliveryPartner } from '@/lib/delivery/deliveryPartner';
import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { track } from '@/analytics';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { Colors, FontSize, Radius, Spacing } from '@/theme';
import { radioState } from '@/lib/a11y';

const SCREEN = 'SUP-ORD-01';
/** A fee the server sent as nothing (`0`, `0.00`): not worth a line. A text check, not arithmetic. */
const ZERO_MONEY = /^0*\.?0*$/;

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
  const router = useRouter();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{ id: string }>();
  const orderId = Number(params.id);

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string>('OUT_OF_STOCK');
  const [note, setNote] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [weighingModalOpen, setWeighingModalOpen] = useState(false);
  const [actualWeights, setActualWeights] = useState<Record<number, string>>({});
  // The server's refusal (or ours for an empty field), shown inside the sheet where the supplier is looking.
  const [weighError, setWeighError] = useState<string | null>(null);

  // ── Billing: statutory invoices & credit notes ──────────────────────
  const [invoice, setInvoice] = useState<TaxInvoice | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNote[] | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const query = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
  });

  const order = query.data;
  const nowMs = useServerNow();

  const recordWeightsMutation = useMutation({
    mutationFn: (weights: RecordDispatchWeightItem[]) =>
      recordDispatchWeights(accessToken as string, orderId, weights),
    onSuccess: (updated) => {
      // Weighing moves no money: the price is fixed when the order is marked ready (API D-128).
      show('Weights saved. The price is fixed when you mark the order ready.', 'success');
      queryClient.setQueryData(['supplier-order', orderId], updated);
      invalidate();
      setWeighingModalOpen(false);
    },
    // Inside the sheet, not a toast behind it: the refusal says which reading to check.
    onError: (caught) => {
      setWeighError(caught instanceof ApiError ? caught.message : 'Could not save the weights. Try again.');
      invalidate();
    },
  });

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
      show(SUPPLIER_CANCEL_TOAST);
    },
    onError: (caught) => onRefusal(caught, "Couldn't cancel this order."),
  });

  // A Costonomy-delivery order that is Ready gets its delivery from auto-dispatch a few seconds later: until the row
  // exists the read 404s, so the screen keeps asking (fast) rather than offering a button for something in progress.
  const awaitingDelivery = order?.status === 'READY_FOR_PICKUP' && wantsDeliveryPartner(order.deliveryMode);
  // The poll interval needs 'has the search timed out', which itself needs this query's data: a ref breaks the loop.
  // (Reading a `const` declared below from react-query's first call throws a ReferenceError on web.)
  const findTimedOutRef = useRef(false);
  const delivery = useQuery({
    queryKey: ['supplier-order', orderId, 'delivery'],
    queryFn: () => fetchDelivery(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null && (order?.status === 'READY_FOR_PICKUP' || order?.status === 'OUT_FOR_DELIVERY' || order?.status === 'DELIVERED'),
    retry: false,
    // While a partner is being found the screen follows it, so the bar moves and a booking shows up without a tap.
    refetchInterval: (query) => deliveryPollMs(query.state.data, awaitingDelivery, findTimedOutRef.current),
  });
  // Computed from the query's own data (not a state mirrored by an effect, which lags a render behind it). The poll
  // interval above reads findTimedOut lazily, after this render has set it.
  const deliveryExists = delivery.data != null;
  const findTimedOut = useTimeoutFlag(awaitingDelivery && !deliveryExists, FIND_TIMEOUT_MS);
  findTimedOutRef.current = findTimedOut;
  const partnerPhase = partnerAwaitPhase({
    orderStatus: order?.status, deliveryMode: order?.deliveryMode, hasDelivery: deliveryExists, timedOut: findTimedOut,
  });
  // One press at a time on the stage bar: the next stage's button lands where this one was.
  const stageGuard = usePressGuard(order?.status);

  const requestPartner = useMutation({
    mutationFn: () =>
      requestDelivery(accessToken as string, orderId, newIdempotencyKey(), { mode: 'COSTONOMY' }),
    onSuccess: () => {
      track('delivery_partner_requested', { screen: SCREEN, entityId: orderId });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId, 'delivery'] });
      show('Delivery partner requested', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not request delivery partner.'),
  });

  const retryPartner = useMutation({
    mutationFn: (deliveryId: number) => reassignDelivery(accessToken as string, deliveryId, newIdempotencyKey()),
    onSuccess: (next) => {
      track('delivery_partner_retried', { screen: SCREEN, entityId: orderId });
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId, 'delivery'] });
      show(canRetryPartner(next.mode, next.status) ? 'Still no partner available' : 'Delivery partner requested',
        canRetryPartner(next.mode, next.status) ? 'info' : 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not request another partner.'),
  });

  const [confirmingOwn, setConfirmingOwn] = React.useState(false);
  const switchToOwn = useMutation({
    mutationFn: (deliveryId: number) => switchToOwnDelivery(accessToken as string, deliveryId, newIdempotencyKey()),
    onSuccess: () => {
      track('delivery_switched_to_own', { screen: SCREEN, entityId: orderId });
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId, 'delivery'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId] });
      show('You are delivering this order', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not switch to your own delivery.'),
  });

  const dispatchDelivery = useMutation({
    mutationFn: (deliveryId: number) => markDeliveryDispatched(accessToken as string, deliveryId),
    onSuccess: () => {
      track('delivery_dispatched', { screen: SCREEN, entityId: orderId });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId, 'delivery'] });
      show('Dispatched for delivery', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not dispatch delivery.'),
  });

  const completeDelivery = useMutation({
    mutationFn: (deliveryId: number) => markDeliveryDelivered(accessToken as string, deliveryId),
    onSuccess: () => {
      track('delivery_delivered', { screen: SCREEN, entityId: orderId });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId, 'delivery'] });
      show('Order delivered', 'success');
    },
    onError: (caught) => onRefusal(caught, 'Could not mark delivered.'),
  });

  const mode = order?.deliveryMode ?? null;
  const deliveryData = delivery.data ?? null;
  const view = order == null
    ? null
    : orderTrackingView({ audience: 'supplier', order, delivery: deliveryData, nowMs });
  const busy = advance.isPending || cancel.isPending;
  const catchWeightItems = catchWeightLines(order);
  const hasCatchWeight = catchWeightItems.length > 0;

  const billingEligible = order != null && [
    'DELIVERED', 'COMPLETED', 'SETTLED',
  ].includes(order.status);

  async function handleViewInvoice() {
    if (!accessToken || !orderId) return;
    setBillingLoading(true);
    try {
      const inv = await fetchTaxInvoice(accessToken, orderId);
      setInvoice(inv);
    } catch (caught) {
      Alert.alert('Invoice', billingFailureMessage(caught, 'Tax invoice is not yet available for this order.'));
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleGenerateInvoice() {
    if (!accessToken || !orderId) return;
    setBillingLoading(true);
    try {
      const inv = await generateTaxInvoice(accessToken, orderId);
      setInvoice(inv);
    } catch (caught) {
      Alert.alert('Invoice', billingFailureMessage(caught, 'Could not generate tax invoice for this order.'));
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleViewCreditNotes() {
    if (!accessToken || !orderId) return;
    setBillingLoading(true);
    try {
      const notes = await fetchCreditNotes(accessToken, orderId);
      if (notes.length === 0) {
        Alert.alert('Credit Notes', 'No credit notes have been issued for this order.');
      } else {
        setCreditNotes(notes);
      }
    } catch (caught) {
      Alert.alert('Credit Notes', billingFailureMessage(caught, 'Could not load credit notes for this order.'));
    } finally {
      setBillingLoading(false);
    }
  }

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Order"
          subtitle={order?.orderNumber ?? undefined}
          back
          right={
            <MandiChatAction
              outletId={order?.outletId}
              supplierStoreId={order?.supplierStoreId}
              side="SUPPLIER"
              // What this conversation is about, offered for sharing once the
              // thread opens rather than assumed.
              suggest={order == null ? undefined : { type: 'ORDER', id: order.id }}
            />
          }
        />
      }
      footer={renderFooter()}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      <MandiConfirm
        visible={confirmingOwn}
        title="Deliver this order yourself?"
        message="The restaurant has already paid the delivery charge and it stays unchanged. You will dispatch the goods and confirm delivery yourself."
        confirmLabel="Yes, I'll deliver"
        cancelLabel="Not now"
        onConfirm={() => {
          setConfirmingOwn(false);
          if (delivery.data) switchToOwn.mutate(delivery.data.id);
        }}
        onCancel={() => setConfirmingOwn(false)}
      />
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
          {view != null && (
            <View style={styles.tracker}>
              <TrackingCards
                audience="supplier"
                view={view}
                delivery={deliveryData}
                nowMs={nowMs}
                onTrack={() => router.push(`/supplier/tracking/${order.id}`)}
                onRetry={deliveryData == null ? undefined : () => retryPartner.mutate(deliveryData.id)}
                onSwitchOwn={() => setConfirmingOwn(true)}
                retrying={retryPartner.isPending}
                switching={switchToOwn.isPending}
              />
            </View>
          )}

          <MandiCard>
            {/* Where the order is leads, in the card above. The reference used to sit beside it and now lives
                in the header, so repeating it here would be the same string
                twice in forty points of screen. */}
            <MandiText variant="caption" color={Colors.textTertiary}>
              {formatMomentWithRecency(order.createdAt)}
            </MandiText>

            <View style={styles.row}>
              <View style={styles.where}>
                {/* Who the order is from, which the header carried until the
                    reference took its place there. A supplier reads this before
                    anything else on the card. */}
                <MandiText variant="bodyEmphasis" numberOfLines={2}>
                  {partyTitle(order.restaurantName, order.outletName)}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                  {[order.outletLocality, order.outletCity].filter(Boolean).join(' · ')}
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
            {/* The server's field, shown as sent: the total above already contains it. */}
            {mode !== 'PICKUP' && order.deliveryFee != null && !ZERO_MONEY.test(order.deliveryFee) && (
              <MandiText variant="caption" color={Colors.textSecondary}>
                Includes {formatMoney(order.deliveryFee)} delivery fee
              </MandiText>
            )}

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

            {(order.scheduledDeliveryDate || order.deliverySlotName) && (
              <View style={styles.valueRow}>
                <Ionicons name="time-outline" size={16} color={Colors.primary} />
                <MandiText variant="captionEmphasis" color={Colors.primary}>
                  Slot: {order.scheduledDeliveryDate ?? 'Today'} {order.deliverySlotName ? `(${order.deliverySlotName})` : ''}
                </MandiText>
                {order.isSubscriptionOrder && (
                  <MandiStatusChip tone="info" label="Subscription" size="sm" />
                )}
              </View>
            )}

            {order.hasColdChainItems && (
              <ColdChainBanner text="Cold chain: this order needs temperature-controlled transport. Only a carrier verified for chilled goods can be assigned." />
            )}

            {(() => {
              const adjustment = weightAdjustmentCopy(order.weightAdjustmentAmount);
              return adjustment == null ? null : (
                <View style={styles.valueRow}>
                  <Ionicons name="scale-outline" size={16} color={Colors.warning} />
                  <MandiText variant="captionEmphasis" color={Colors.warning}>
                    {adjustment.text}
                  </MandiText>
                </View>
              );
            })()}

            {order.doorstepRefundAmount != null && parseFloat(order.doorstepRefundAmount) > 0 && (
              <View style={styles.valueRow}>
                <Ionicons name="receipt-outline" size={16} color={Colors.danger} />
                <MandiText variant="captionEmphasis" color={Colors.danger}>
                  Doorstep Rejection Refund: -{formatMoney(order.doorstepRefundAmount)}
                </MandiText>
              </View>
            )}

            {order.finalPayableAmount != null && (
              <View style={styles.valueRow}>
                <MandiText variant="caption" color={Colors.textSecondary}>Final Payable:</MandiText>
                <MandiText variant="bodyEmphasis">{formatMoney(order.finalPayableAmount)}</MandiText>
              </View>
            )}

            {order.status === 'CANCELLED' && order.cancellationReason ? (
              <MandiText variant="caption" color={Colors.textSecondary}>
                {order.cancelledBy === 'SUPPLIER' ? 'You cancelled' : 'Cancelled'}
                {' — '}{order.cancellationReason}
              </MandiText>
            ) : null}
            {order.status === 'CANCELLED' ? (
              <MandiText variant="caption" color={Colors.textSecondary}>
                {SUPPLIER_CANCELLED_LINE}
              </MandiText>
            ) : null}
          </MandiCard>

          {order.rating != null && (
            <MandiCard>
              <View style={styles.valueRow}>
                <MandiText variant="bodyEmphasis">Restaurant rating</MandiText>
                <View style={styles.stars} accessible accessibilityLabel={`Rated ${order.rating} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons
                      key={n}
                      name={n <= (order.rating ?? 0) ? 'star' : 'star-outline'}
                      size={18}
                      color={Colors.warning}
                    />
                  ))}
                </View>
              </View>
              {order.ratingComment != null && order.ratingComment.trim() !== '' && (
                <MandiText variant="caption" color={Colors.textSecondary}>{order.ratingComment}</MandiText>
              )}
            </MandiCard>
          )}

          {/* ── Statutory Billing Documents ────────────────────────── */}
          {billingEligible && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">📄 GST Documents</MandiText>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <MandiButton
                  label={billingLoading ? 'Loading…' : (invoice ? 'View Invoice' : 'Generate Invoice')}
                  size="sm"
                  variant="secondary"
                  onPress={invoice ? handleViewInvoice : handleGenerateInvoice}
                  disabled={billingLoading}
                />
                <MandiButton
                  label={billingLoading ? 'Loading…' : 'Credit Notes'}
                  size="sm"
                  variant="secondary"
                  onPress={handleViewCreditNotes}
                  disabled={billingLoading}
                />
              </View>

              {invoice != null && (
                <View style={{ marginTop: 12 }}>
                  <MandiText variant="captionEmphasis" color={Colors.primary}>
                    {invoice.invoiceNumber} — {formatMoney(invoice.totalAmount)}
                  </MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Issued {formatMomentWithRecency(invoice.issuedAt)} • {invoice.isInterState ? 'IGST' : 'CGST + SGST'}
                  </MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Buyer: {invoice.buyerName} (GSTIN {invoice.buyerGstin ?? 'N/A'})
                  </MandiText>
                  {invoice.items.map((item) => (
                    <View key={item.id} style={styles.valueRow}>
                      <MandiText variant="caption">{item.productName} ({item.hsnCode})</MandiText>
                      <MandiText variant="caption">{formatMoney(item.totalAmount)}</MandiText>
                    </View>
                  ))}
                </View>
              )}

              {creditNotes != null && creditNotes.length > 0 && creditNotes.map((cn) => (
                <View key={cn.id} style={{ marginTop: 12 }}>
                  <MandiText variant="captionEmphasis" color={Colors.danger}>
                    {cn.creditNoteNumber} — Refund {formatMoney(cn.totalRefundAmount)}
                  </MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Reason: {cn.reasonCode} • Issued {formatMomentWithRecency(cn.issuedAt)}
                  </MandiText>
                  {cn.items.map((item) => (
                    <View key={item.id} style={styles.valueRow}>
                      <MandiText variant="caption">{item.productName}: {item.rejectedQuantity} rejected</MandiText>
                      <MandiText variant="caption" color={Colors.danger}>-{formatMoney(item.totalRefund)}</MandiText>
                    </View>
                  ))}
                </View>
              ))}
            </MandiCard>
          )}

          {hasCatchWeight && canWeigh(order.status) && (
            <MandiCard>
              <View style={styles.deliveryRow}>
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">⚖️ Catch-Weight Perishables</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {catchWeightItems.every((i) => i.dispatchedWeight != null)
                      ? 'All perishable items weighed. Dispatched scale weights verified.'
                      : 'Weigh items on the packing scale before dispatch to ensure exact invoicing.'}
                  </MandiText>
                </View>
                <MandiButton
                  label={catchWeightItems.some((i) => i.dispatchedWeight != null) ? 'Re-weigh' : 'Weigh Items'}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    // Empty, or the reading already taken: never the accepted quantity, which nobody read off a scale.
                    setActualWeights(initialWeights(catchWeightItems));
                    setWeighError(null);
                    setWeighingModalOpen(true);
                  }}
                />
              </View>
            </MandiCard>
          )}

          {order.status === 'READY_FOR_PICKUP' && !deliveryData && wantsDeliveryPartner(order.deliveryMode)
            && order.hasColdChainItems && (
            <ColdChainBanner text="Temperature-controlled: only a carrier verified for chilled goods can be assigned. If none can, the delivery fails and you will see why." />
          )}

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

                  {item.isCatchWeight && (
                    <View style={styles.itemCatchWeightRow}>
                      <Ionicons name="scale-outline" size={14} color={Colors.warning} />
                      <MandiText variant="caption" color={Colors.warning}>
                        {weighedLine(item) ?? 'Catch-weight: not weighed yet'}
                      </MandiText>
                      {(() => {
                        const adjustment = weightAdjustmentCopy(item.weightDeltaAmount);
                        return adjustment == null ? null : (
                          <MandiText variant="caption" color={Colors.textSecondary}>
                            · {adjustment.text}
                          </MandiText>
                        );
                      })()}
                    </View>
                  )}

                  {item.doorstepRejectedQty != null && parseFloat(item.doorstepRejectedQty) > 0 && (
                    <View style={styles.itemDoorstepRow}>
                      <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
                      <MandiText variant="caption" color={Colors.danger}>
                        Doorstep rejected: {item.doorstepRejectedQty} {item.unit} ({item.doorstepRejectionReason ?? 'Damaged'})
                      </MandiText>
                      {item.doorstepRefundAmount != null && (
                        <MandiText variant="caption" color={Colors.danger}>
                          · Refund: -{formatMoney(item.doorstepRefundAmount)}
                        </MandiText>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </MandiCard>
          )}

          <MandiBottomSheet
            visible={weighingModalOpen}
            onClose={() => setWeighingModalOpen(false)}
            title="Weigh Catch-Weight Items"
          >
            <MandiText variant="caption" color={Colors.textSecondary} style={{ marginBottom: Spacing.md }}>
              Enter the weight shown on the scale for each line. The buyer is billed the weighed amount, never more than was ordered; the price is fixed when you mark the order ready.
            </MandiText>
            {catchWeightItems.map((item) => (
              <View key={item.id} style={styles.weighRow}>
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis">{item.productName}</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Ordered: {formatQuantity(item.acceptedQuantity ?? item.requestedQuantity)} {item.unit}
                  </MandiText>
                </View>
                <View style={styles.weightInputBox}>
                  <TextInput
                    value={actualWeights[item.id] ?? ''}
                    onChangeText={(val) => setActualWeights((prev) => ({ ...prev, [item.id]: val }))}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Scale weight for ${item.productName}, in ${item.unit}`}
                    style={styles.weightInput}
                  />
                  <MandiText variant="caption" color={Colors.textSecondary}>{item.unit}</MandiText>
                </View>
              </View>
            ))}
            {weighError != null && (
              <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite" style={{ marginTop: Spacing.sm }}>
                {weighError}
              </MandiText>
            )}
            <MandiButton
              label="Save weights"
              size="md"
              loading={recordWeightsMutation.isPending}
              onPress={() => {
                // An empty field is refused here; anything else (the band, the decimals) is the server's call.
                const built = buildWeighPayload(catchWeightItems, actualWeights);
                if (!built.ok) {
                  setWeighError(built.message);
                  return;
                }
                setWeighError(null);
                const payload: RecordDispatchWeightItem[] = built.weights;
                recordWeightsMutation.mutate(payload);
              }}
              style={{ marginTop: Spacing.lg }}
            />
          </MandiBottomSheet>
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
            label="Cancel Order"
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

    if (partnerPhase === 'finding') {
      return (
        <MandiStickyBar>
          <View style={styles.finding} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
            <ActivityIndicator color={Colors.primary} />
            <MandiText variant="bodyEmphasis">Finding a delivery partner…</MandiText>
          </View>
        </MandiStickyBar>
      );
    }

    if (partnerPhase === 'manual') {
      return (
        <MandiStickyBar>
          <MandiButton
            label="Request Delivery Partner"
            size="lg"
            icon="bicycle-outline"
            loading={requestPartner.isPending}
            onPress={() => requestPartner.mutate()}
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

    // Weigh first: the server refuses "Mark ready" until every catch-weight line is weighed, so say so before the tap.
    const blocked = next.to === 'READY_FOR_PICKUP' ? readyBlockedMessage(order) : null;

    return (
      <MandiStickyBar>
        {blocked != null && (
          <MandiText variant="caption" color={Colors.warning} accessibilityLiveRegion="polite">
            {blocked}
          </MandiText>
        )}
        <MandiButton
          label={next.label}
          variant="primary"
          size="md"
          loading={busy}
          disabled={blocked != null}
          onPress={() => stageGuard.press(() => advance.mutate({ to: next.to }))}
        />
        {/* Only while the goods are still in the store. Doc 01 §13: once they
            have left, the path is return or dispute. */}
        {(order.status === 'CONFIRMED' || order.status === 'PREPARING') && (
          <MandiButton
            label="Cannot Fulfil"
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
              accessibilityState={radioState(active)}
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
  tracker: { gap: Spacing.listGap },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  where: { flex: 1, gap: 2 },
  finding: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, minHeight: 48 },
  stars: { flexDirection: 'row', gap: 2 },
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
  itemCatchWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  itemDoorstepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  weighRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.md,
  },
  weightInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    height: 40,
    minWidth: 100,
    backgroundColor: Colors.surface,
    gap: 4,
  },
  weightInput: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    paddingVertical: 0,
    textAlign: 'right',
  },
});
