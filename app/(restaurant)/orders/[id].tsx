import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSupplierOrder } from '@/services/procurement';
import {
  MandiCard,
  MandiCountdown,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { resolveStatus, SupplierOrderStatus } from '@/models/status';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
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
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['supplier-order', orderId],
    queryFn: () => fetchSupplierOrder(accessToken as string, orderId),
    enabled: Number.isFinite(orderId) && accessToken != null,
    // A pending order is changing under us; a settled one is not.
    refetchInterval: (q) =>
      q.state.data?.status === 'PENDING_ACCEPTANCE' ? 10_000 : false,
  });

  const order = query.data;

  return (
    <MandiScreen
      header={<MandiHeader title={order?.orderNumber ?? 'Order'} subtitle={order?.supplierName} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
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
                  <MandiText variant="bodyEmphasis">{formatMoney(item.lineTotal)}</MandiText>
                </View>
              );
            })}
          </MandiCard>

          <MandiCard>
            <Row label="Subtotal" value={formatMoney(order.subtotal)} />
            <Row label="GST" value={formatMoney(order.gstAmount)} />
            <Row label="Total" value={formatMoney(order.totalAmount)} emphasis />
            {order.acceptedAmount != null &&
              Number(order.acceptedAmount) !== Number(order.totalAmount) && (
                <Row
                  label="Accepted value"
                  value={formatMoney(order.acceptedAmount)}
                  hint="You are charged for what the supplier accepted."
                />
              )}
            {order.paymentStatus && (
              <Row label="Payment" value={humanise(order.paymentStatus)} />
            )}
          </MandiCard>
        </>
      )}
    </MandiScreen>
  );
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
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
});
