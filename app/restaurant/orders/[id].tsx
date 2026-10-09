import { paymentStatusCopy } from '@/lib/payments/statusLabel';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { billingFailureMessage, creditNotesNotice } from '@/lib/billing/messages';
import { fetchTaxInvoice, fetchCreditNotes, type TaxInvoice, type CreditNote } from '@/services/billing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder } from '@/services/procurement';
import { fetchRating } from '@/services/trust';
import { fetchDelivery } from '@/services/delivery';
import {
  MandiButton,
  DetailRowCard,
  type DetailRow,
  MandiCard,
  MandiErrorState,
  MandiChatAction,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
} from '@/components/common';
import { AmountRow, BillSummary, DisputeRefundLines, billSummaryFor, CatchWeightNote, ColdChainBanner, PaymentMethodPill } from '@/components/order';
import { isApiError } from '@/lib/api/errors';
import { useServerNow } from '@/hooks/useServerNow';
import { orderTrackingView } from '@/lib/delivery/orderTracking';
import { buyerTrackingHeader } from '@/lib/delivery/trackingHeader';
import { formatMoney, formatQuantity } from '@/utils/money';
import { itemTaxLine } from '@/components/order/BillSummary';
import { formatDay, formatMoment, formatMomentWithRecency } from '@/utils/dateRange';
import { paymentLine } from '@/lib/payments/paymentLine';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { splitStoreName } from '@/components/restaurant/SupplierStoreHeader';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

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

  // The receipt's own read (same key, a GET): a rated order no longer offers "Rate this order". A 404 is "not rated yet".
  const rating = useQuery({
    queryKey: ['supplier-order', orderId, 'rating'],
    queryFn: () => fetchRating(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null && order?.status === 'COMPLETED',
    retry: (count, error) => !isApiError(error) && count < 2,
  });
  const rated = rating.data != null;

  const deliveryStatus = delivery.data ?? null;
  const view = order == null
    ? null
    : orderTrackingView({ audience: 'buyer', order, delivery: deliveryStatus, nowMs });

  const header = order == null || view == null
    ? null
    : buyerTrackingHeader({ view, order, delivery: deliveryStatus, drop: null, nowMs });
  // Who it is from, the name once (SupplierStoreHeader's rule). No store name: the supplier alone.
  const party = order?.storeName != null && order.storeName.trim() !== ''
    ? splitStoreName(order.storeName, order.supplierName)
    : { title: order?.supplierName ?? '', subtitle: null };
  // Track while the order is moving, or whenever the server says the partner can be followed. A DRAFT is not yet sent.
  const showTrack = view != null && order != null && order.status !== 'DRAFT'
    && (view.showTrack || !view.terminal);

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

  /** Payment method, the delivery window, the address, and a way to report a problem once it has arrived. */
  function detailRows(o: NonNullable<typeof order>): DetailRow[] {
    const rows: DetailRow[] = [];
    // A plain on-credit order already says "On credit" on the bar and in the bill: no row for it. Any other status on a
    // credit order (Refunded, Cancelled · being settled, Refund delayed) is news, and keeps its row, label and pill.
    // The same goes for a plain wallet or card payment ("Paid from wallet" is the bill's own last line): one payment
    // line, not three. Only a status that is news (held, refunded, delayed, failed) gets a row.
    const plainCredit = o.paymentStatus === 'ON_CREDIT' || o.paymentStatus === 'PAID' || o.paymentStatus === 'CAPTURED';
    if (!plainCredit && (o.paymentMethod != null || payment != null)) {
      rows.push({
        key: 'payment',
        icon: 'card-outline',
        title: 'Payment method',
        // Said by the server's status and instrument, never guessed: a UPI order that was cancelled has been
        // debited and is being refunded, which is not "no money was taken".
        subtitle: payment == null ? null : [payment.label, payment.detail].filter(Boolean).join('. '),
        right: o.paymentMethod != null ? <PaymentMethodPill method={o.paymentMethod} /> : undefined,
      });
    }
    const when = o.deliverySlotName ?? o.scheduledDeliveryDate;
    if (when) {
      rows.push({
        key: 'window',
        icon: 'time-outline',
        title: 'Delivery window',
        subtitle: o.deliverySlotName && o.scheduledDeliveryDate
          ? `${formatDay(o.scheduledDeliveryDate) ?? o.scheduledDeliveryDate}, ${o.deliverySlotName}`
          : o.deliverySlotName ?? formatDay(o.scheduledDeliveryDate) ?? when,
      });
    }
    if (o.isSubscriptionOrder) {
      rows.push({ key: 'subscription', icon: 'repeat-outline', title: 'Order type', subtitle: 'Daily subscription' });
    }
    const address = [o.outletName, o.outletLocality, o.outletCity].filter(Boolean).join(', ');
    if (address) {
      rows.push({ key: 'address', icon: 'location-outline', title: 'Delivery address', subtitle: address });
    }
    if (view?.complete) {
      rows.push({
        key: 'report',
        icon: 'flag-outline',
        title: 'Report an issue',
        onPress: () => router.push(`/restaurant/dispute/${o.id}`),
        right: <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />,
      });
    }
    return rows;
  }

  // ── Billing: statutory invoices & credit notes ──────────────────────
  const [invoice, setInvoice] = useState<TaxInvoice | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNote[] | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  // On the card, not an Alert: Alert.alert does nothing on the web.
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const billingEligible = order != null && [
    'DELIVERED', 'COMPLETED', 'SETTLED',
  ].includes(order.status);

  async function handleViewInvoice() {
    if (!accessToken || !orderId) return;
    setBillingLoading(true);
    setBillingNotice(null);
    try {
      const inv = await fetchTaxInvoice(accessToken, orderId);
      setInvoice(inv);
    } catch (caught) {
      setBillingNotice(billingFailureMessage(caught, 'Tax invoice is not yet available for this order.'));
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleViewCreditNotes() {
    if (!accessToken || !orderId) return;
    setBillingLoading(true);
    setBillingNotice(null);
    try {
      const notes = await fetchCreditNotes(accessToken, orderId);
      if (notes.length === 0) {
        setBillingNotice('No credit notes yet.');
      } else {
        setCreditNotes(notes);
      }
    } catch (caught) {
      setBillingNotice(creditNotesNotice(caught));
    } finally {
      setBillingLoading(false);
    }
  }

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Order details"
          back
          right={order != null && (
            <MandiChatAction
              outletId={order.outletId}
              supplierStoreId={order.supplierStoreId}
              side="RESTAURANT"
              // What this conversation is about, offered for sharing once the thread opens rather than assumed.
              suggest={{ type: 'ORDER', id: order.id }}
            >
              {({ onPress, label, busy }) => (
                <Pressable
                  onPress={onPress}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={styles.support}
                >
                  <MandiText variant="bodyEmphasis" color={Colors.primaryDark}>Support</MandiText>
                </Pressable>
              )}
            </MandiChatAction>
          )}
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
          {/* The status card: where the order is, in the buyer tracking header's own words. Hidden once cancelled,
              when the payment row below carries the refund copy. */}
          {header != null && order.status !== 'CANCELLED' && (
            <DetailRowCard
              rows={[{
                key: 'status',
                // A finished order gets a check: the navigate arrow says "on its way", which it no longer is.
                icon: header.state === 'completed' ? 'checkmark-circle-outline' : 'navigate-outline',
                title: header.title,
                subtitle: header.pill?.text ?? null,
                accessibilityLabel: `Order status, ${header.title}`,
                // Track while the order is moving (or the server says it can be followed); nothing once it ended.
                right: showTrack ? (
                  <MandiText variant="bodyEmphasis" color={Colors.primaryDark}>Track ›</MandiText>
                ) : undefined,
                onPress: showTrack ? () => router.push(`/restaurant/tracking/${order.id}`) : undefined,
              }]}
            />
          )}

          <MandiCard>
            <MandiText variant="caption" color={Colors.textTertiary}>
              {formatMomentWithRecency(order.createdAt)}
            </MandiText>
            {/* Through to the supplier's shelf. Somebody reading an order
                often wants the next one, or to check what else this supplier
                carries — and the name is where they reach for it. */}
            <View style={styles.partyRow}>
              <Pressable
                onPress={() => router.push(`/restaurant/supplier/${order.supplierStoreId}`)}
                accessibilityRole="button"
                accessibilityLabel={`See everything ${order.storeName ?? order.supplierName} sells`}
                style={({ pressed }) => [styles.partyLink, pressed && styles.pressed]}
              >
                {/* The name once: "Sri Balaji Traders — Domlur" under "Sri Balaji Traders" reads as the supplier
                    with the locality as the caption (the storefront header's own rule). */}
                <View style={styles.flex}>
                  <MandiText variant="bodyEmphasis" style={styles.party}>
                    {party.title}
                  </MandiText>
                  {party.subtitle != null && party.subtitle !== '' && (
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {party.subtitle}
                    </MandiText>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </Pressable>
              <MandiChatAction
                outletId={order.outletId}
                supplierStoreId={order.supplierStoreId}
                side="RESTAURANT"
                suggest={{ type: 'ORDER', id: order.id }}
              />
            </View>
            <View style={styles.hairline} />
            <View style={styles.orderIdRow}>
              <MandiText variant="caption" color={Colors.textSecondary} style={styles.flex}>
                Order ID: {order.orderNumber}
              </MandiText>
              <Pressable
                onPress={() => { void Clipboard.setStringAsync(order.orderNumber); }}
                accessibilityRole="button"
                accessibilityLabel="Copy order ID"
                style={styles.copy}
              >
                <Ionicons name="copy-outline" size={IconSize.md} color={Colors.textSecondary} />
              </Pressable>
            </View>

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
                    <MandiText variant="body">
                      {formatQuantity(item.requestedQuantity)} x {item.productName}
                    </MandiText>
                    {/* The pack, as every other screen describes it. */}
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {skuSecondaryLine(item.sku, item.unitPriceInclusiveGst)}
                    </MandiText>
                    <MandiText variant="caption" color={Colors.textTertiary}>
                      {itemTaxLine(item)}
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
          </MandiCard>

          {/* Each figure is a server field: nothing is added here. */}
          <BillSummary {...billSummaryFor(order, settled)} />
          {billingEligible && <DisputeRefundLines orderId={orderId} />}

          {order.hasColdChainItems && (
            <ColdChainBanner text="Chilled goods: carried only by a carrier verified for temperature-controlled transport." />
          )}
          <DetailRowCard rows={detailRows(order)} />

          {/* ── Statutory Billing Documents ────────────────────────── */}
          {billingEligible && (
            <MandiCard>
              <View style={styles.docsHead}>
                <Ionicons name="document-text-outline" size={IconSize.md} color={Colors.textSecondary} />
                <MandiText variant="bodyEmphasis">GST documents</MandiText>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <MandiButton
                  label={billingLoading ? 'Loading…' : 'View invoice'}
                  size="sm"
                  variant="secondary"
                  onPress={handleViewInvoice}
                  disabled={billingLoading}
                />
                <MandiButton
                  label={billingLoading ? 'Loading…' : 'Credit notes'}
                  size="sm"
                  variant="secondary"
                  onPress={handleViewCreditNotes}
                  disabled={billingLoading}
                />
              </View>

              {billingNotice != null && (
                <MandiText variant="caption" color={Colors.textSecondary} style={{ marginTop: 8 }} testID="billing-notice">
                  {billingNotice}
                </MandiText>
              )}

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
                  <AmountRow
                    variant="captionEmphasis"
                    color={Colors.danger}
                    label={`${cn.creditNoteNumber} — Refund`}
                    amount={formatMoney(cn.totalRefundAmount)}
                  />
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
            {formatMoney(paymentLine(order).amount)}
          </MandiText>
        </View>

        <View style={styles.barActions}>
          {unpaid && (
            <MandiButton
              label="Pay now"
              size="lg"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/pay/${order.id}`)}
            />
          )}
          {trackable && (
            <MandiButton
              label="Track delivery"
              size="lg"
              icon="navigate-outline"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/tracking/${order.id}`)}
            />
          )}
          {receivable && (
            <MandiButton
              label={carried ? 'Check in delivery' : 'Confirm collection'}
              size="lg"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/receiving/${order.id}`)}
            />
          )}
          {settled && !rated && !rating.isPending && (
            <MandiButton
              label="Rate this order"
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
  docsHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  partyLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  copy: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  support: { minHeight: 48, minWidth: TouchTarget.min, paddingHorizontal: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
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
