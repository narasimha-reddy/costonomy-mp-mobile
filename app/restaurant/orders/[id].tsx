import { paymentStatusCopy } from '@/lib/payments/statusLabel';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { billingFailureMessage } from '@/lib/billing/messages';
import { fetchTaxInvoice, fetchCreditNotes, type TaxInvoice, type CreditNote } from '@/services/billing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder } from '@/services/procurement';
import { fetchDelivery } from '@/services/delivery';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiChatAction,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
} from '@/components/common';
import { CatchWeightNote, ColdChainBanner, PaymentMethodPill } from '@/components/order';
import { isApiError } from '@/lib/api/errors';
import { TrackingCards } from '@/components/delivery/TrackingCards';
import { TrackingTopArea } from '@/components/delivery/TrackingTopArea';
import { CollapsibleSection } from '@/components/order/CollapsibleSection';
import { useServerNow } from '@/hooks/useServerNow';
import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { formatMoment, formatMomentWithRecency } from '@/utils/dateRange';
import { paymentLine } from '@/lib/payments/paymentLine';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { DetailRow as Row } from '@/components/restaurant/DetailRow';
import { Colors, Radius, Spacing, TrackingLayout } from '@/theme';

const ACTIVE_POLL_MS = 15_000;
const ENDED_ORDER = ['COMPLETED', 'CANCELLED'];
const ENDED_DELIVERY = ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'];
/** Statuses from which a delivery can exist. A DRAFT or CANCELLED order never has one, so asking would only 404. */
const DELIVERY_POSSIBLE = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'];

/**
 * REST-ORDERS-01 detail. Doc 05 §15–§16.
 *
 * <p>While a supplier is deciding, the acceptance deadline is live — and it is
 * **the server's instant**, counted down to directly. A local timer started when
 * the screen opened would drift from the deadline the backend will actually
 * enforce, and the one number a restaurant is watching would be wrong.
 *
 * <p>The header carries only the order number: the card below leads with the
 * supplier, and repeating it two lines above would push the status down the
 * screen.
 *
 * <p>A partial acceptance shows requested and accepted side by side. Guardrail
 * 14: the shortfall is never silently dropped, and this is where it becomes
 * visible.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const router = useRouter();
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
    // An order still moving is changing under us; a settled one is not. The tracker follows the partner, so it polls
    // until the order is completed or cancelled.
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status != null && ENDED_ORDER.includes(status) ? false : ACTIVE_POLL_MS;
    },
  });

  const order = query.data;
  const nowMs = useServerNow();

  const delivery = useQuery({
    queryKey: ['supplier-order', orderId, 'delivery'],
    queryFn: () => fetchDelivery(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null
      && order != null && DELIVERY_POSSIBLE.includes(order.status),
    // A 404 is "no delivery yet"; retrying it would only delay the screen.
    retry: (count, error) => !isApiError(error) && count < 2,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status != null && ENDED_DELIVERY.includes(status)) return false;
      const orderStatus = order?.status;
      if (status == null && orderStatus != null && ENDED_ORDER.includes(orderStatus)) return false;
      return ACTIVE_POLL_MS;
    },
  });

  const deliveryStatus = delivery.data ?? null;
  const view = order == null
    ? null
    : orderTrackingView({ audience: 'buyer', order, delivery: deliveryStatus, nowMs });

  /**
   * The supplier answered, and for less than was asked.
   *
   * <p>Only then are there two sets of figures. Before an answer
   * `acceptedAmount` is zero and means "not yet" rather than "nothing" — reading
   * it as a total would tell a restaurant their order was worthless.
   */
  const settled = order != null
    && order.acceptedAmount != null
    && order.items.some((item) => item.acceptedQuantity != null)
    && Number(order.acceptedAmount) !== Number(order.totalAmount);

  const payment = order?.paymentStatus
    ? paymentStatusCopy({
      status: order.paymentStatus,
      instrument: order.paymentInstrument,
      // The figure the Total row shows: as sent, not worked out here.
      amount: settled ? order.acceptedAmount : order.totalAmount,
      cancelled: order.status === 'CANCELLED',
      refundAmount: order.refundAmount,
      refundedAt: order.refundedAt,
    })
    : undefined;

  // ── Billing: statutory invoices & credit notes ──────────────────────
  const [invoice, setInvoice] = useState<TaxInvoice | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNote[] | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

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
        />
      }
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footer={renderActions()}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error || order == null ? (
        <MandiErrorState message="Couldn't load this order." onRetry={() => query.refetch()} />
      ) : (
        <>
          {/* The tracker: where the order is, from what the server said. The top is an illustration until a partner
              is reporting, then a map preview that opens the live view. */}
          {view != null && (
            <View style={styles.tracker}>
              <View style={styles.topClip}>
                <TrackingTopArea
                  view={view}
                  delivery={deliveryStatus}
                  destination={null}
                  height={TrackingLayout.previewHeight}
                  overlap={0}
                  compact
                  onPress={view.showTrack && view.showMap ? () => router.push(`/restaurant/tracking/${order.id}`) : undefined}
                />
              </View>
              <TrackingCards
                audience="buyer"
                view={view}
                delivery={deliveryStatus}
                nowMs={nowMs}
                onReport={() => router.push(`/restaurant/dispute/${order.id}`)}
              />
            </View>
          )}

          <MandiCard>
            <MandiText variant="caption" color={Colors.textTertiary}>
              {formatMomentWithRecency(order.createdAt)}
            </MandiText>
            {/* Through to the supplier's shelf. Somebody reading an order
                often wants the next one, or to check what else this supplier
                carries — and the name is where they reach for it. */}
            <Pressable
              onPress={() => router.push(`/restaurant/supplier/${order.supplierStoreId}`)}
              accessibilityRole="button"
              accessibilityLabel={`See everything ${order.storeName ?? order.supplierName} sells`}
              style={({ pressed }) => [styles.partyRow, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <MandiText variant="bodyEmphasis" style={styles.party}>
                  {order.supplierName}
                </MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {order.storeName}
                </MandiText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </Pressable>
          </MandiCard>

          {(order.hasColdChainItems || order.scheduledDeliveryDate || order.deliverySlotName
            || order.isSubscriptionOrder) && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">Delivery</MandiText>
              {order.hasColdChainItems && (
                <ColdChainBanner text="Chilled goods: carried only by a carrier verified for temperature-controlled transport." />
              )}
              {order.scheduledDeliveryDate && (
                <Row label="Scheduled Date" value={order.scheduledDeliveryDate} />
              )}
              {order.deliverySlotName && (
                <Row label="Delivery Window" value={order.deliverySlotName} />
              )}
              {order.isSubscriptionOrder && (
                <Row label="Order Type" value="Daily Subscription" />
              )}
            </MandiCard>
          )}

          <CollapsibleSection
            key={`summary-${view?.terminal ?? false}`}
            title="Items and totals"
            summary={`${order.items.length} ${order.items.length === 1 ? 'item' : 'items'} · ${formatMoney(settled ? order.acceptedAmount : order.totalAmount)}`}
            defaultOpen={view?.terminal ?? false}
          >
            {order.items.map((item) => {
              const short =
                item.acceptedQuantity != null &&
                Number(item.acceptedQuantity) < Number(item.requestedQuantity);
              return (
                <View key={item.id} style={styles.item}>
                  {/* The line opens the pack it was bought as. D-096: an order
                      is often where somebody goes to check what a thing
                      actually was before ordering it again. */}
                  <Pressable
                    onPress={() => router.push(`/restaurant/sku/${item.supplierSkuId}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`About ${item.productName}`}
                    style={styles.itemText}
                  >
                    <MandiText variant="body">{item.productName}</MandiText>
                    {/* The pack, as every other screen describes it. The
                        quantity goes below: it belongs to this order, not to
                        the pack. */}
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {skuSecondaryLine(item.sku, item.unitPriceInclusiveGst)}
                    </MandiText>
                    <MandiText variant="caption" color={Colors.textTertiary}>
                      {formatQuantity(item.requestedQuantity)} {item.unit} ordered ·
                      Inc. {formatGstRate(item.gstRate)} GST
                    </MandiText>
                    {item.requiresColdChain && (
                      <ColdChainBanner compact text="Chilled goods" />
                    )}
                    {short && (
                      <View style={styles.shortRow}>
                        <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
                        <MandiText variant="caption" color={Colors.warning}>
                          Supplier accepted {formatQuantity(item.acceptedQuantity)} {item.unit}
                        </MandiText>
                      </View>
                    )}
                  </Pressable>
                  {/* What this line will cost. The ordered figure stays, struck,
                      so a shortfall is visible as a change rather than as a
                      number that happens not to match the quantity above it. */}
                  <View style={styles.lineValue}>
                    {item.acceptedLineTotal != null
                      && item.acceptedLineTotal !== item.lineTotal && (
                        <MandiText variant="caption" color={Colors.textTertiary} struck>
                          {formatMoney(item.lineTotal)}
                        </MandiText>
                      )}
                    <MandiText variant="bodyEmphasis">
                      {formatMoney(item.acceptedLineTotal ?? item.lineTotal)}
                    </MandiText>
                    {item.isCatchWeight === true && (
                      <CatchWeightNote billed={item.billableQuantity} unit={item.unit} />
                    )}
                  </View>
                </View>
              );
            })}
            <View style={styles.sectionGap}>
            {/* One figure per row: what this order actually comes to. The
                ordered amounts are struck on the lines above, where the change is
                a fact about a particular item — repeating them here turned a
                summary into a second comparison, and a summary that shows two
                numbers for every row is not a summary. */}
            <Row
              label="Item value"
              value={formatMoney(settled ? order.acceptedSubtotal : order.subtotal)}
            />
            <Row
              label="GST"
              value={formatMoney(settled ? order.acceptedGst : order.gstAmount)}
            />
            {/* Where the request screen puts it. A charge is a line; free delivery is a line too (below). */}
            {order.deliveryFee != null && Number(order.deliveryFee) > 0 && (
              <Row label="Delivery" value={formatMoney(order.deliveryFee)} />
            )}
            {/* Said outright when somebody delivers for nothing: a missing line reads as "not charged yet". Still
                nothing for a collected order, where it would state the obvious. */}
            {order.deliveryFee != null && Number(order.deliveryFee) === 0
              && order.deliveryMode != null && order.deliveryMode !== 'PICKUP' && (
              <Row label="Delivery" value="Free" />
            )}
            <Row
              label="Total"
              value={formatMoney(settled ? order.acceptedAmount : order.totalAmount)}
              emphasis
            />
            </View>
          </CollapsibleSection>

          <MandiCard>
            {order.paymentStatus && (
              <Row label="Payment" value={payment?.label ?? ''} />
            )}
            {/* Said by the server's status and instrument, never guessed: a
                UPI order that was cancelled has been debited and is being
                refunded, which is not "no money was taken". */}
            {payment?.detail != null && (
              <MandiText variant="caption" color={Colors.textSecondary}>{payment.detail}</MandiText>
            )}
            {/* How this one is funded — the restaurant is the party who either
                paid or owes, and until now its own view of the order was the
                only one that never said which. It takes a labelled row like
                every other line in this block rather than floating under them,
                and the same pill the card and the supplier's view carry, so the
                two sides cannot describe one order's funding differently. */}
            {order.paymentMethod != null && (
              <View style={styles.totalsRow}>
                <View style={styles.flex}>
                  <MandiText variant="body" color={Colors.textSecondary}>Funded by</MandiText>
                </View>
                <PaymentMethodPill method={order.paymentMethod} />
              </View>
            )}
          </MandiCard>

          <MandiCard>
            <View style={styles.helpRow}>
              <View style={styles.flex}>
                <MandiText variant="bodyEmphasis">Need help?</MandiText>
              </View>
              <MandiChatAction
                outletId={order.outletId}
                supplierStoreId={order.supplierStoreId}
                side="RESTAURANT"
                // What this conversation is about, offered for sharing once the
                // thread opens rather than assumed.
                suggest={{ type: 'ORDER', id: order.id }}
              />
            </View>
          </MandiCard>

          {/* ── Statutory Billing Documents ────────────────────────── */}
          {billingEligible && (
            <MandiCard>
              <MandiText variant="bodyEmphasis">📄 GST Documents</MandiText>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <MandiButton
                  label={billingLoading ? 'Loading…' : 'View Invoice'}
                  size="sm"
                  variant="secondary"
                  onPress={handleViewInvoice}
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
                    Issued {formatMoment(invoice.issuedAt)} • {invoice.isInterState ? 'IGST' : 'CGST + SGST'}
                  </MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Seller: {invoice.supplierName} (GSTIN {invoice.supplierGstin})
                  </MandiText>
                  {invoice.items.map((item) => (
                    <View key={item.id} style={styles.totalsRow}>
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
                    Reason: {cn.reasonCode} • Issued {formatMoment(cn.issuedAt)}
                  </MandiText>
                  {cn.items.map((item) => (
                    <View key={item.id} style={styles.totalsRow}>
                      <MandiText variant="caption">{item.productName}: {item.rejectedQuantity} rejected</MandiText>
                      <MandiText variant="caption" color={Colors.danger}>-{formatMoney(item.totalRefund)}</MandiText>
                    </View>
                  ))}
                </View>
              ))}
            </MandiCard>
          )}
        </>
      )}
    </MandiScreen>
  );

  /**
   * What the restaurant can do next, decided by the order's own status.
   *
   * <p>Deliberately driven by what the server says the order is, never by what
   * the app last did — guardrail 4. A screen that offered "Check in delivery"
   * because the user tapped something a moment ago would offer it on an order the
   * backend has since expired.
   */
  function renderActions() {
    if (order == null) return undefined;

    // Only somebody else carrying it can be received as a delivery; a collected order has no courier and no positions.
    const carried = order.deliveryMode != null && order.deliveryMode !== 'PICKUP';
    // From the tracker: a partner is assigned, not yet delivered, and the server says it can be followed.
    const trackable = view?.showTrack ?? false;

    // A collected order is received when the restaurant has it, which is the
    // moment it is ready — nothing delivers it, so it never reaches DELIVERED.
    const receivable = order.status === 'DELIVERED'
      || (!carried && order.status === 'READY_FOR_PICKUP');
    const settled = order.status === 'COMPLETED';
    // Not paid yet, and nothing else leads back to the pay screen: without this an
    // order whose payment screen was closed or refreshed could not be paid (D-102).
    const unpaid = order.status === 'DRAFT' && order.paymentMethod === 'PREPAID';

    if (!trackable && !receivable && !settled && !unpaid) return undefined;

    return (
      <MandiStickyBar>
        {/* The figure first, then what can be done about it — the request
            screen's bar, so the two read the same. "You paid" rather than "You
            pay": by the time an order exists the money has moved. */}
        <View style={styles.barRow}>
          <MandiText variant="caption" color={Colors.textSecondary}>
            {paymentLine(order).barLabel}
          </MandiText>
          <MandiText variant="priceLarge">
            {formatMoney(settled ? order.acceptedAmount : order.totalAmount)}
          </MandiText>
        </View>

        <View style={styles.barActions}>
          {unpaid && (
            <MandiButton
              label="Pay Now"
              size="lg"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/pay/${order.id}`)}
            />
          )}
          {trackable && (
            <MandiButton
              label="Track Delivery"
              size="lg"
              icon="navigate-outline"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/tracking/${order.id}`)}
            />
          )}
          {receivable && (
            <MandiButton
              label={carried ? 'Check in delivery' : 'Confirm Collection'}
              size="lg"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/receiving/${order.id}`)}
            />
          )}
          {settled && (
            <MandiButton
              label="Rate This Order"
              size="lg"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/rating/${order.id}`)}
            />
          )}
        </View>
      </MandiStickyBar>
    );
  }
}

const styles = StyleSheet.create({
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pressed: { opacity: 0.7 },
  tracker: { gap: Spacing.listGap },
  topClip: { borderRadius: Radius.lg, overflow: 'hidden' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  // The request screen's chip row, so the two read alike.
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  placed: { marginTop: Spacing.sm },
  sectionGap: { gap: Spacing.xs },
  helpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  countdown: { marginTop: Spacing.md, gap: Spacing.xs },
  deliverySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  barActions: { flexDirection: 'row', gap: Spacing.sm },
  barAction: { flex: 1 },
  party: { marginTop: Spacing.xs },
  deliverySummaryBody: { gap: Spacing.xs },
  item: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemText: { flex: 1, gap: Spacing.xs },
  shortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  lineValue: { alignItems: 'flex-end' },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
});
