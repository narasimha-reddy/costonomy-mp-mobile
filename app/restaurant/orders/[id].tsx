import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder } from '@/services/procurement';
import { fetchDelivery } from '@/services/delivery';
import {
  MandiButton,
  MandiCard,
  MandiCountdown,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStickyBar,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { isApiError } from '@/lib/api/errors';
import { resolveStatus, DeliveryStatus as DeliveryStatusRegistry, SupplierOrderStatus } from '@/models/status';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { formatMoment } from '@/utils/dateRange';
import { Colors, Spacing } from '@/theme';

/**
 * REST-ORDERS-01 detail. Doc 05 §15–§16.
 *
 * <p>While a supplier is deciding, the acceptance deadline is live — and it is
 * **the server's instant**, counted down to directly. A local timer started when
 * the screen opened would drift from the deadline the backend will actually
 * enforce, and the one number a restaurant is watching would be wrong.
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
    // A pending order is changing under us; a settled one is not.
    refetchInterval: (q) =>
      q.state.data?.status === 'PENDING_ACCEPTANCE' ? 10_000 : false,
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

  return (
    <MandiScreen
      header={<MandiHeader title={order?.orderNumber ?? 'Order'} subtitle={order?.supplierName} back />}
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
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">{order.supplierName}</MandiText>
              <MandiStatusChip {...resolveStatus(SupplierOrderStatus, order.status)} />
            </View>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {order.storeName}
            </MandiText>

            {order.status === 'PENDING_ACCEPTANCE' && order.acceptanceDeadline && (
              <View style={styles.countdown}>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  Supplier must respond within
                </MandiText>
                <MandiCountdown
                  deadlineAt={order.acceptanceDeadline}
                  slaSeconds={order.responseSlaSeconds ?? undefined}
                />
              </View>
            )}
          </MandiCard>

          <MandiCard>
            <MandiText variant="bodyEmphasis">Items</MandiText>
            {order.items.map((item) => {
              const short =
                item.acceptedQuantity != null &&
                Number(item.acceptedQuantity) < Number(item.requestedQuantity);
              return (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemText}>
                    <MandiText variant="body">{item.productName}</MandiText>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {formatQuantity(item.requestedQuantity)} {item.unit} ·{' '}
                      {formatMoney(item.unitPrice)} · GST {formatGstRate(item.gstRate)}
                    </MandiText>
                    {short && (
                      <View style={styles.shortRow}>
                        <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
                        <MandiText variant="caption" color={Colors.warning}>
                          Supplier accepted {formatQuantity(item.acceptedQuantity)} {item.unit}
                        </MandiText>
                      </View>
                    )}
                  </View>
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
              label="Subtotal"
              value={formatMoney(settled ? order.acceptedSubtotal : order.subtotal)}
            />
            <Row
              label="GST"
              value={formatMoney(settled ? order.acceptedGst : order.gstAmount)}
            />
            <Row
              label={settled ? 'You pay' : 'Total'}
              value={formatMoney(settled ? order.acceptedAmount : order.totalAmount)}
              hint={settled ? 'You are charged for what the supplier accepted.' : undefined}
              emphasis
            />
            {order.paymentStatus && (
              <Row label="Payment" value={humanise(order.paymentStatus)} />
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

    const trackable = ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'PREPARING'].includes(order.status);
    const receivable = order.status === 'DELIVERED';
    const settled = order.status === 'COMPLETED';

    if (!trackable && !receivable && !settled) return undefined;

    return (
      <MandiStickyBar>
        {trackable && (
          <MandiButton
            label="Track delivery"
            size="lg"
            icon="navigate-outline"
            onPress={() => router.push(`/restaurant/tracking/${order.id}`)}
          />
        )}
        {receivable && (
          <MandiButton
            label="Check in delivery"
            size="lg"
            onPress={() => router.push(`/restaurant/receiving/${order.id}`)}
          />
        )}
        {settled && (
          <>
            <MandiButton
              label="Rate this order"
              size="lg"
              onPress={() => router.push(`/restaurant/rating/${order.id}`)}
            />
            <MandiButton
              label="Something was wrong"
              variant="tertiary"
              size="md"
              onPress={() => router.push(`/restaurant/dispute/${order.id}`)}
            />
          </>
        )}
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

function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  countdown: { marginTop: Spacing.md, gap: Spacing.xs },
  deliverySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
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
