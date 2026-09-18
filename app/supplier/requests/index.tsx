import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchStoreIntents } from '@/services/intent';
import { storeIntentsKey } from '@/lib/queryKeys';
import { RequestCardBody } from '@/components/request/RequestCardBody';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import type { Intent, IntentStatus as IntentStatusCode } from '@/models/intent';
import { supplierIntentStatus } from '@/models/status';
import { Colors, Radius, Spacing } from '@/theme';

/** Narrow by what the supplier would actually go looking for. */
const FILTERS: { key: IntentStatusCode | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Needs acceptance' },
  { key: 'RESPONSES_RECEIVED', label: 'Accepted' },
  { key: 'ORDERED', label: 'Ordered' },
  { key: 'EXPIRED', label: 'Missed' },
];

/**
 * SUP-REQ-01 — every request this store has received.
 *
 * <p>Drafts never appear, and that is enforced by the server rather than here: a
 * basket a restaurant is still filling has not been sent to anybody.
 */
export default function SupplierRequestsScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const [filter, setFilter] = useState<IntentStatusCode | 'ALL'>('ALL');

  const query = useQuery({
    queryKey: [...storeIntentsKey(storeId), filter],
    queryFn: () =>
      fetchStoreIntents(accessToken as string, storeId as number,
        filter === 'ALL' ? undefined : filter),
    enabled: storeId != null && accessToken != null,
  });

  const requests = query.data ?? [];

  return (
    <MandiScreen
      header={<MandiHeader title="Requests" back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((option) => {
          const active = filter === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setFilter(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
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
      </ScrollView>

      {query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load requests." onRetry={() => query.refetch()} />
      ) : requests.length === 0 ? (
        <MandiEmptyState
          icon="document-text-outline"
          title={filter === 'ALL' ? 'No requests yet' : 'Nothing matches that'}
          description={
            filter === 'ALL'
              ? 'When a restaurant asks what you have, it shows here. Accepting quickly is what wins the order.'
              : 'Try a different filter.'
          }
        />
      ) : (
        requests.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            onPress={() => router.push(`/supplier/requests/${request.id}`)}
          />
        ))
      )}
    </MandiScreen>
  );
}

function RequestRow({ request, onPress }: { request: Intent; onPress: () => void }) {
  // Only the supplier's own clock. Once they have answered, the time that is
  // running is the restaurant's to order — counting it down on the supplier's
  // list would show them a deadline they cannot act on.
  const needsAcceptance = request.status === 'OPEN';

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <MandiCard>
        <RequestCardBody
          primary={request.outletName ?? request.restaurantName}
          secondary={[
            request.outletName != null ? request.restaurantName : null,
            request.outletLocality ?? request.outletCity,
            request.distanceKm != null ? `${request.distanceKm} km away` : null,
          ]}
          status={supplierIntentStatus(request.status, request.fulfilment)}
          deadlineAt={needsAcceptance ? request.responseDeadline : null}
          deadlineSeconds={request.responseWindowSeconds}
          deadlineAction="to accept"
          reference={request.reference}
          amount={request.acceptance?.offeredTotal ?? request.agreedTotal}
          amountLabel={
            request.acceptance != null
              ? 'you accepted'
              : `${request.items.length} item${request.items.length === 1 ? '' : 's'}`
          }
          items={request.items}
        />
      </MandiCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    // Without this the chips stretch to the rail's height, and a pill radius
    // on a tall box draws an oval.
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  items: { marginTop: Spacing.sm },
});
