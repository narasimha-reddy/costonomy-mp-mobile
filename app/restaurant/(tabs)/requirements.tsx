import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchRequirements } from '@/services/procurement';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
  OutletSelector,
} from '@/components/common';
import { formatQuantity } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * REST-REQ-01. Doc 05 §9.
 *
 * <p>Shows requested, fulfilled and **remaining** per line. The remaining figure
 * is the point of the screen: guardrail 14 requires a shortfall to survive a
 * supplier rejecting, timing out or partially accepting, and this is where a
 * restaurant sees that it did.
 */
export default function RequirementsScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId, loading: outletLoading } = useOutlet();

  const query = useQuery({
    queryKey: ['outlet', outletId, 'requirements'],
    queryFn: () => fetchRequirements(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  return (
    <MandiScreen
      header={<Header />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {outletLoading || query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load requirements." onRetry={() => query.refetch()} />
      ) : (query.data ?? []).length === 0 ? (
        <MandiEmptyState
          icon="clipboard-outline"
          title="No requirements yet"
          description="Raise one to track what you still need across suppliers."
        />
      ) : (
        (query.data ?? []).map((requirement) => (
          <MandiCard
            key={requirement.id}
            onPress={() => router.push(`/restaurant/requirements/${requirement.id}`)}
          >
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">
                {requirement.items.length} item{requirement.items.length === 1 ? '' : 's'}
              </MandiText>
              <MandiStatusChip
                label={requirement.status.replace(/_/g, ' ').toLowerCase()}
                tone={requirement.status === 'FULFILLED' ? 'success' : 'pending'}
                size="sm"
              />
            </View>
            {requirement.items.slice(0, 4).map((item) => (
              <View key={item.id} style={styles.row}>
                <MandiText variant="caption" color={Colors.textSecondary}>{item.productName}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {formatQuantity(item.remainingQuantity)} {item.unit} left
                </MandiText>
              </View>
            ))}
          </MandiCard>
        ))
      )}
    </MandiScreen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <MandiText variant="title">Requirements</MandiText>
      <OutletSelector />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
