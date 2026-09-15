import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchSettlement } from '@/services/settlement';
import {
  MandiCard,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * One payout. Doc 05 §33.
 *
 * <p>Each line shows **the rate that applied when it was calculated**, not the
 * current one (D-053). A settlement that moved because someone changed a
 * commission rate afterwards would be a settlement nobody could reconcile.
 */
export default function SettlementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const settlementId = Number(id);
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['settlement', settlementId],
    queryFn: () => fetchSettlement(accessToken as string, settlementId),
    enabled: Number.isFinite(settlementId) && accessToken != null,
  });

  const data = query.data;

  return (
    <MandiScreen
      header={<MandiHeader title={data?.settlementNumber ?? 'Settlement'} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error || data == null ? (
        <MandiErrorState message="Couldn't load this settlement." onRetry={() => query.refetch()} />
      ) : (
        <>
          <MandiCard>
            <View style={styles.row}>
              <MandiText variant="caption" color={Colors.textSecondary}>Net payout</MandiText>
              <MandiStatusChip
                label={data.status.toLowerCase()}
                tone={data.status === 'PAID' ? 'success' : data.status === 'FAILED' ? 'danger' : 'pending'}
                size="sm"
              />
            </View>
            <MandiText variant="display">{formatMoney(data.netAmount)}</MandiText>
            {data.paymentReference && (
              <MandiText variant="caption" color={Colors.textTertiary}>
                Reference {data.paymentReference}
              </MandiText>
            )}
            {data.failureReason && (
              <MandiText variant="caption" color={Colors.danger}>{data.failureReason}</MandiText>
            )}
          </MandiCard>

          <MandiCard>
            <Row label="Gross" value={formatMoney(data.grossAmount)} />
            <Row label="Commission" value={`− ${formatMoney(data.commissionAmount)}`} />
            {Number(data.adjustmentAmount) !== 0 && (
              <Row label="Adjustments" value={formatMoney(data.adjustmentAmount)} />
            )}
            <View style={styles.rule} />
            <Row label="Net" value={formatMoney(data.netAmount)} emphasis />
          </MandiCard>

          <View style={styles.section}>
            <MandiSectionHeader
              title="Orders"
              subtitle={`${data.orderCount} in this period`}
            />
            {data.lines.map((line) => (
              <MandiCard key={line.supplierOrderId} compact>
                <View style={styles.row}>
                  <MandiText variant="body">{line.orderNumber}</MandiText>
                  <MandiText variant="bodyEmphasis">{formatMoney(line.netAmount)}</MandiText>
                </View>
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {formatMoney(line.grossAmount)} gross · {line.ratePercent}% commission applied
                </MandiText>
              </MandiCard>
            ))}
          </View>

          {data.adjustments.length > 0 && (
            <View style={styles.section}>
              <MandiSectionHeader title="Adjustments" />
              {data.adjustments.map((adjustment) => (
                <MandiCard key={adjustment.id} compact>
                  <View style={styles.row}>
                    <MandiText variant="body">{adjustment.reason}</MandiText>
                    <MandiText
                      variant="bodyEmphasis"
                      color={adjustment.direction === 'DEBIT' ? Colors.danger : Colors.success}
                    >
                      {adjustment.direction === 'DEBIT' ? '−' : '+'} {formatMoney(adjustment.amount)}
                    </MandiText>
                  </View>
                  <MandiText variant="caption" color={Colors.textTertiary}>
                    {adjustment.reasonCode.replace(/_/g, ' ').toLowerCase()}
                  </MandiText>
                </MandiCard>
              ))}
            </View>
          )}
        </>
      )}
    </MandiScreen>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.row}>
      <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
        {label}
      </MandiText>
      <MandiText variant={emphasis ? 'price' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: Spacing.xs },
});
