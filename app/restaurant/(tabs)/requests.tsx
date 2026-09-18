import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { fetchIntents } from '@/services/intent';
import { intentsKey } from '@/lib/queryKeys';
import { RequestCardBody } from '@/components/request/RequestCardBody';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import type { Intent, IntentFulfilment } from '@/models/intent';
import { restaurantIntentStatus } from '@/models/status';
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
      {/* flexGrow 0 or the rail claims the whole column: a ScrollView nested in
          a scrolling screen expands to fill it, and the chips — centred on the
          cross axis so their pill shape reads right — then float in the middle
          of a tall empty box. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRail}
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
  // Whichever clock is running belongs to somebody different: while a request
  // is open the supplier is on the hook, and once answered the restaurant is.
  const awaitingReply = request.status === 'OPEN';
  const readyToOrder = request.status === 'RESPONSES_RECEIVED' && request.withinOrderWindow;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <MandiCard>
        <RequestCardBody
          primary={request.storeName}
          secondary={[request.supplierName !== request.storeName ? request.supplierName : null]}
          status={restaurantIntentStatus(request.status, request.fulfilment)}
          deadlineAt={
            awaitingReply ? request.responseDeadline
              : readyToOrder ? request.orderCreationDeadline : null
          }
          deadlineSeconds={
            awaitingReply ? request.responseWindowSeconds : request.orderCreationWindowSeconds
          }
          deadlineAction={awaitingReply ? 'for their reply' : 'to order'}
          reference={request.reference}
          occurredAt={request.sentAt ?? request.createdAt}
          amount={request.agreedTotal}
          amountLabel={`${request.items.length} item${request.items.length === 1 ? '' : 's'}`}
          items={request.items}
        />
      </MandiCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filterRail: { flexGrow: 0, flexShrink: 0 },
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
