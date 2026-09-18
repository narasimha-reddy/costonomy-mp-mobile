import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { fetchIntents } from '@/services/intent';
import { intentsKey } from '@/lib/queryKeys';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import type { Intent, IntentFulfilment } from '@/models/intent';
import { IntentFulfilment as FulfilmentDisplay, resolveStatus, restaurantIntentStatus } from '@/models/status';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-REQ-01';

/** The filters, in the order a kitchen cares about them. */
const FILTERS: { key: IntentFulfilment | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'AWAITING', label: 'Awaiting' },
  { key: 'FULFILLED', label: 'All available' },
  { key: 'PARTIALLY_FULFILLED', label: 'Partly' },
  { key: 'NOT_FULFILLED', label: 'None' },
];

/**
 * REST-REQ-01 — what this kitchen has asked for, and what came back.
 *
 * <p><b>Filtered by fulfilment, not status.</b> The question being asked is
 * "what didn't I get?", and that is not the same as where a request is in its
 * life — a request can be ORDERED and only a third filled. Both are shown on
 * each row because they answer different questions.
 *
 * <p>The filter is applied server-side so the counts and the list cannot
 * disagree; fulfilment is derived from quantities, so it is not something the
 * app could correctly compute for itself.
 */
export default function RequestsScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const [filter, setFilter] = useState<IntentFulfilment | 'ALL'>('ALL');

  const query = useQuery({
    queryKey: [...intentsKey(outletId), filter],
    queryFn: () =>
      fetchIntents(accessToken as string, outletId as number,
        filter === 'ALL' ? undefined : filter),
    enabled: outletId != null && accessToken != null,
  });

  const requests = useMemo(() => query.data ?? [], [query.data]);

  return (
    <MandiScreen
      header={<RestaurantHeader screen={SCREEN} />}
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
        <MandiErrorState
          message="Couldn't load your requests."
          onRetry={() => query.refetch()}
        />
      ) : requests.length === 0 ? (
        <MandiEmptyState
          icon="document-text-outline"
          title={filter === 'ALL' ? 'No requests yet' : 'Nothing matches that'}
          description={
            filter === 'ALL'
              ? 'Add what you need and send it to a supplier. They reply with what they have and what it costs.'
              : 'Try a different filter.'
          }
          actionLabel={filter === 'ALL' ? 'Start searching' : undefined}
          onAction={filter === 'ALL' ? () => router.push('/restaurant/search') : undefined}
        />
      ) : (
        requests.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            onPress={() => router.push(`/restaurant/requests/${request.id}`)}
          />
        ))
      )}
    </MandiScreen>
  );
}

function RequestRow({ request, onPress }: { request: Intent; onPress: () => void }) {
  const lifecycle = restaurantIntentStatus(request.status, request.fulfilment);
  const fulfilment = resolveStatus(FulfilmentDisplay, request.fulfilment);

  const showFulfilment = request.fulfilment !== 'AWAITING';

  // A request the supplier answered and that can still be ordered from is the
  // one thing on this screen with a deadline attached, so it says so.
  const actionable = request.status === 'RESPONSES_RECEIVED' && request.withinOrderWindow;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <MandiCard>
        <View style={styles.row}>
          <View style={styles.flex}>
            <MandiText variant="bodyEmphasis" numberOfLines={1}>
              {request.storeName ?? 'Supplier'}
            </MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {request.reference} · {request.items.length} item
              {request.items.length === 1 ? '' : 's'}
            </MandiText>
          </View>
          <MandiStatusChip {...lifecycle} />
        </View>

        {/* Skipped entirely when there is nothing in it, or the row keeps a
            margin for an empty line. */}
        {(showFulfilment || actionable) && (
        <View style={styles.metaRow}>
          {/* Only once there is an answer to describe. While a request is
              awaiting, the chip above already says so — and on an expired one
              "Awaiting acceptance" beside "No reply in time" reads as a
              contradiction rather than as two facts. */}
          {showFulfilment && <MandiStatusChip {...fulfilment} />}
          {actionable && (
            <View style={styles.actionHint}>
              <Ionicons name="time-outline" size={14} color={Colors.primary} />
              <MandiText variant="caption" color={Colors.primary}>
                Ready to order
              </MandiText>
            </View>
          )}
        </View>
        )}
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionHint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
});
