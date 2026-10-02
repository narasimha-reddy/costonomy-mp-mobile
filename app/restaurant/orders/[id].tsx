import { paymentStatusCopy } from '@/lib/payments/statusLabel';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { PaymentMethodPill } from '@/components/order';
import { isApiError } from '@/lib/api/errors';
import { DeliveryMode, orderStatusFor, resolveStatus, DeliveryStatus as DeliveryStatusRegistry, SupplierOrderStatus } from '@/models/status';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { formatMoment, formatMomentWithRecency } from '@/utils/dateRange';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { Colors, Spacing } from '@/theme';

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
    // An order still moving is changing under us; a settled one is not. After
    // D-091 nothing is waiting on an acceptance, so what is worth polling is the
    // work itself — being prepared, or on its way.
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'CONFIRMED' || status === 'PREPARING'
        || status === 'OUT_FOR_DELIVERY' ? 30_000 : false;
    },
  });

  const delivery = useQuery({
    queryKey: ['supplier-order', orderId, 'delivery'],
    queryFn: () => fetchDelivery(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
    retry: (count, error) => !isApiError(error) && count < 2,
  });

  const order = query.data;
  const deliveryStatus = delivery.data;
  const deliveryNotYet = delivery.error != null && isApiError(delivery.error);

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
              side="RESTAURANT"
              // What this conversation is about, offered for sharing once the
              // thread opens rather than assumed.
              suggest={order == null ? undefined : { type: 'ORDER', id: order.id }}
            />
          }
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
          <MandiCard>
            {/* Laid out like the request this came from: both chips on one
                line, then when, then who. An order and the request behind it
                are two stages of one thing, and a reader should not have to
                re-learn where to look when they move between them.
                
                The two chips answer different questions — where the order is,
                and how it travels — which is why they sit together rather than
                one being buried further down. */}
            <View style={styles.statusRow}>
              <MandiStatusChip {...orderStatusFor(order.status, order.deliveryMode)} />
              {order.deliveryMode != null && (
                <MandiStatusChip {...resolveStatus(DeliveryMode, order.deliveryMode)} />
              )}
            </View>

            {/* The number is the screen's title; only the date belongs here. */}
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

            {/* No acceptance countdown. The supplier answered on the request,
                and this order exists because they said yes — a clock here would
                count down to nothing. The request's own clock is on the request.
                D-091. */}
          </MandiCard>

          <MandiCard>
            <MandiText variant="bodyEmphasis">Items</MandiText>
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
                  </View>
                </View>
              );
            })}
          </MandiCard>

          <MandiCard>
            <View style={styles.deliverySummaryHeader}>
              <MandiText variant="bodyEmphasis">Delivery</MandiText>
              {deliveryStatus && (
                <MandiStatusChip {...resolveStatus(DeliveryStatusRegistry, deliveryStatus.status)} size="sm" />
              )}
            </View>

            {deliveryStatus ? (
              <View style={styles.deliverySummaryBody}>
                {deliveryStatus.etaMinutes != null && (
                  <Row label="ETA" value={`${deliveryStatus.etaMinutes} min`} />
                )}
                {deliveryStatus.estimatedArrivalAt && (
                  <Row label="Arriving" value={formatMoment(deliveryStatus.estimatedArrivalAt)} />
                )}
                {deliveryStatus.driverName && (
                  <Row label="Driver" value={deliveryStatus.driverName} />
                )}
                {deliveryStatus.pickupAddress && (
                  <Row label="Pickup" value={deliveryStatus.pickupAddress} />
                )}
                {deliveryStatus.dropAddress && (
                  <Row label="Destination" value={deliveryStatus.dropAddress} />
                )}
                {!deliveryStatus.trackable && deliveryStatus.mode === 'SUPPLIER_OWN' && (
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    Supplier own delivery does not show live tracking.
                  </MandiText>
                )}
              </View>
            ) : !deliveryNotYet ? (
              <MandiText variant="caption" color={Colors.textSecondary}>
                Delivery details will appear once the supplier prepares this order.
              </MandiText>
            ) : null}
          </MandiCard>

          <MandiCard>
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
            {/* Where the request screen puts it, and only when it cost
                something: a "Delivery  Free" line on a collected order states
                the obvious next to a chip that already said "You collect". */}
            {order.deliveryFee != null && Number(order.deliveryFee) > 0 && (
              <Row label="Delivery" value={formatMoney(order.deliveryFee)} />
            )}
            <Row
              label="Total"
              value={formatMoney(settled ? order.acceptedAmount : order.totalAmount)}
              emphasis
            />
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

    // There is something to track only when somebody else is carrying it.
    // D-091 gave orders a mode, and this check predates it: a PICKUP order has
    // no courier and no positions, so "Track Delivery" opened a map of nothing.
    const carried = order.deliveryMode != null && order.deliveryMode !== 'PICKUP';
    const trackable = carried
      && ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'PREPARING'].includes(order.status);

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
            {unpaid ? 'To pay' : 'You paid'}
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
          {settled && (
            <MandiButton
              label="Something Was Wrong"
              variant="tertiary"
              size="lg"
              style={styles.barAction}
              onPress={() => router.push(`/restaurant/dispute/${order.id}`)}
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
              label={carried ? 'Check In Delivery' : 'Confirm Collection'}
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

function Row({
  label,
  value,
  emphasis,
  hint,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.totalsRow}>
      <View style={styles.flex}>
        <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
          {label}
        </MandiText>
        {hint && (
          <MandiText variant="caption" color={Colors.textTertiary}>{hint}</MandiText>
        )}
      </View>
      <MandiText variant={emphasis ? 'price' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
