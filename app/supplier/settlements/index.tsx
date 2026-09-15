import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchSettlements } from '@/services/settlement';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/** SUP-SETTLE-01. Doc 05 §33. */
export default function SettlementsScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const query = useQuery({
    queryKey: ['store', storeId, 'settlements'],
    queryFn: () => fetchSettlements(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Settlements" back right={<StoreSelector />} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load settlements." onRetry={() => query.refetch()} />
      ) : (query.data ?? []).length === 0 ? (
        <MandiEmptyState
          icon="cash-outline"
          title="No payouts yet"
          description="Settlements appear once orders you have delivered are settled for the period."
        />
      ) : (
        (query.data ?? []).map((settlement) => (
          <MandiCard
            key={settlement.id}
            onPress={() => router.push(`/supplier/settlements/${settlement.id}`)}
          >
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">{settlement.settlementNumber}</MandiText>
              <MandiStatusChip
                label={settlement.status.toLowerCase()}
                tone={
                  settlement.status === 'PAID' ? 'success'
                    : settlement.status === 'FAILED' ? 'danger' : 'pending'
                }
                size="sm"
              />
            </View>
            <View style={styles.row}>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {settlement.orderCount} order{settlement.orderCount === 1 ? '' : 's'}
              </MandiText>
              <MandiText variant="price">{formatMoney(settlement.netAmount)}</MandiText>
            </View>
          </MandiCard>
        ))
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
