import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchStoreIntentCarousel } from '@/services/intent';
import { storeIntentsKey } from '@/lib/queryKeys';
import {
  MandiCard,
  MandiCountdown,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiStatusChip,
  MandiText,
} from '@/components/common';
import type { Intent } from '@/models/intent';
import { supplierIntentStatus } from '@/models/status';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Requests waiting on this store — the first thing on the supplier's home.
 *
 * <p><b>Above New orders, deliberately.</b> An order arriving here has already
 * been agreed to by this store, so it needs work but no decision. A request is
 * the opposite: somebody is waiting on an answer that only this store can give,
 * and until it comes nothing else can happen. Putting orders first would bury
 * the one item on the screen with a counterparty blocked on it.
 *
 * <p>Horizontal and capped at ten by the server. The list screen is where a
 * supplier works through everything; this is the prompt, not the queue.
 *
 * <p>Renders nothing at all when there are no requests. An empty state here
 * would push New orders down the screen to say "nothing to do", which is the
 * opposite of what a home screen is for.
 */
export function RequestCarousel() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const query = useQuery({
    queryKey: [...storeIntentsKey(storeId), 'carousel'],
    queryFn: () => fetchStoreIntentCarousel(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
    // A request can arrive at any moment and somebody is waiting on it.
    refetchInterval: 30_000,
  });

  const requests = query.data ?? [];
  const unanswered = requests.filter((request) => request.status === 'OPEN');

  if (query.isPending) {
    return (
      <View style={styles.section}>
        <MandiSectionHeader title="Requests" />
        <MandiSkeletonList count={1} />
      </View>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <MandiSectionHeader
        title="Requests"
        count={unanswered.length}
        subtitle={
          unanswered.length > 0
            ? 'Restaurants waiting on your acceptance'
            : 'Accepted — waiting for them to order'
        }
        actionLabel="See all"
        onAction={() => router.push('/supplier/requests')}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {requests.map((request) => (
          <RequestTile
            key={request.id}
            request={request}
            onPress={() => router.push(`/supplier/requests/${request.id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function RequestTile({ request, onPress }: { request: Intent; onPress: () => void }) {
  const needsAnswer = request.status === 'OPEN';

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.tile}>
      <MandiCard style={styles.tileCard}>
        <View style={styles.tileHead}>
          <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
            {request.items.length} item{request.items.length === 1 ? '' : 's'}
          </MandiText>
          <MandiStatusChip
            {...supplierIntentStatus(request.status, request.fulfilment)}
            size="sm"
          />
        </View>

        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {request.reference}
        </MandiText>

        {/* What they actually want, in their words rather than a count. A
            supplier decides whether to open this by whether they stock it. */}
        <MandiText variant="caption" color={Colors.textPrimary} numberOfLines={2}>
          {request.items
            .map((item) => item.productName ?? item.skuName)
            .filter(Boolean)
            .join(', ')}
        </MandiText>

        {needsAnswer && (
          request.responseDeadline != null ? (
            // The time left is the reason to open this rather than scroll past
            // it, so it replaces the word "Accept" rather than sitting beside it.
            <MandiCountdown
              deadlineAt={request.responseDeadline}
              slaSeconds={request.responseWindowSeconds ?? undefined}
              action="to accept"
              size="sm"
              style={styles.cta}
            />
          ) : (
            <View style={styles.cta}>
              <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
              <MandiText variant="caption" color={Colors.primary}>Accept</MandiText>
            </View>
          )
        )}
      </MandiCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.sm },
  rail: { gap: Spacing.md, paddingRight: Spacing.md },
  tile: { width: 240 },
  tileCard: { gap: Spacing.xs, borderRadius: Radius.md },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.xs },
});
