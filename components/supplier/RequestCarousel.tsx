import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchStoreIntentCarousel } from '@/services/intent';
import { storeIntentsKey } from '@/lib/queryKeys';
import { RequestCardBody } from '@/components/request/RequestCardBody';
import {
  MandiCard,
  MandiSectionHeader,
  MandiSkeletonList,
} from '@/components/common';
import type { Intent } from '@/models/intent';
import { supplierIntentStatus } from '@/models/status';
import { Spacing } from '@/theme';

/**
 * Requests waiting on this store — the first thing on the supplier's home.
 *
 * <p><b>Above New orders, deliberately.</b> An order arriving there has already
 * been agreed to by this store, so it needs work but no decision. A request is
 * the opposite: somebody is waiting on an answer only this store can give, and
 * until it comes nothing else can happen. Putting orders first would bury the
 * one item on the screen with a counterparty blocked on it.
 *
 * <p><b>A list, not a rail.</b> It began as horizontal tiles, which meant a
 * second smaller layout for the same information and a request you had to swipe
 * to find. Full-width cards, matching New orders below, let both sections be
 * read the same way — and a request with a clock on it should not be the thing
 * that scrolls sideways out of view.
 *
 * <p>Renders nothing when there are none. An empty state here would push New
 * orders down the screen to say "nothing to do", which is the opposite of what
 * a home screen is for.
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
      {requests.map((request) => (
        <SupplierRequestCard
          key={request.id}
          request={request}
          onPress={() => router.push(`/supplier/requests/${request.id}`)}
        />
      ))}
    </View>
  );
}

/** The same card the requests list uses, so home and list read alike. */
function SupplierRequestCard({ request, onPress }: { request: Intent; onPress: () => void }) {
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
          // Only the supplier's own clock: once answered, the time running is
          // the restaurant's to order, which this store cannot act on.
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
  section: { gap: Spacing.sm },
});
