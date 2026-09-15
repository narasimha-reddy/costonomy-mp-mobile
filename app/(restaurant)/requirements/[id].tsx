import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchRequirements } from '@/services/procurement';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import { formatQuantity } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * REST-REQ-01 detail. Doc 05 §9.
 *
 * <p>Requested, fulfilled and **remaining** per line, because remaining is the
 * whole point: guardrail 14 requires a shortfall to survive a supplier rejecting,
 * timing out or partially accepting, and this is where a restaurant sees that it
 * did — with a way to source the rest.
 */
export default function RequirementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requirementId = Number(id);
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  // Read from the outlet's list rather than a by-id call: the list is already
  // cached from the tab the user came from, so this opens instantly.
  const query = useQuery({
    queryKey: ['outlet', outletId, 'requirements'],
    queryFn: () => fetchRequirements(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  const requirement = (query.data ?? []).find((item) => item.id === requirementId);

  return (
    <MandiScreen
      header={<MandiHeader title="Requirement" subtitle={requirement ? `#${requirement.id}` : undefined} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={2} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load this requirement." onRetry={() => query.refetch()} />
      ) : requirement == null ? (
        <MandiErrorState
          title="Not found"
          message="This requirement no longer exists for this outlet."
        />
      ) : (
        <>
          <MandiCard>
            <View style={styles.row}>
              <MandiText variant="bodyEmphasis">
                {requirement.items.length} item{requirement.items.length === 1 ? '' : 's'}
              </MandiText>
              <MandiStatusChip
                label={requirement.status.replace(/_/g, ' ').toLowerCase()}
                tone={requirement.status === 'FULFILLED' ? 'success' : 'pending'}
              />
            </View>
            {requirement.notes && (
              <MandiText variant="caption" color={Colors.textSecondary}>
                {requirement.notes}
              </MandiText>
            )}
          </MandiCard>

          {requirement.items.map((item) => {
            const remaining = Number(item.remainingQuantity);
            return (
              <MandiCard key={item.id}>
                <MandiText variant="bodyEmphasis">{item.productName}</MandiText>
                <View style={styles.figures}>
                  <Figure label="Needed" value={`${formatQuantity(item.requestedQuantity)} ${item.unit}`} />
                  <Figure label="Sourced" value={`${formatQuantity(item.fulfilledQuantity)} ${item.unit}`} />
                  <Figure
                    label="Still needed"
                    value={`${formatQuantity(item.remainingQuantity)} ${item.unit}`}
                    tone={remaining > 0 ? Colors.warning : Colors.success}
                  />
                </View>
                {remaining > 0 && (
                  <MandiButton
                    label="Find suppliers for the rest"
                    variant="secondary"
                    size="md"
                    onPress={() => router.push(`/(restaurant)/product/${item.canonicalProductId}`)}
                  />
                )}
              </MandiCard>
            );
          })}
        </>
      )}
    </MandiScreen>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.figure}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="bodyEmphasis" color={tone}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  figures: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, marginVertical: Spacing.sm },
  figure: { gap: Spacing.xs },
});
