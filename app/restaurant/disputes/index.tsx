import React from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchOutletDisputes } from '@/services/trust';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
} from '@/components/common';
import { DisputeListItem } from '@/components/dispute/DisputeListItem';

/**
 * REST-DISPUTES-01. The outlet's disputes, and the refunds asked for on them
 * (API D-104).
 *
 * <p>Newest first. A dispute is raised from its order; this is where it is
 * followed afterwards — which, when money was asked for, is where the restaurant
 * learns whether it came back.
 */
export default function RestaurantDisputesScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();

  const query = useQuery({
    queryKey: ['outlet', outlet?.id, 'disputes'],
    queryFn: () => fetchOutletDisputes(accessToken as string, outlet?.id as number),
    enabled: outlet != null && accessToken != null,
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Disputes" subtitle={outlet?.name} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load disputes." onRetry={() => query.refetch()} />
      ) : (query.data ?? []).length === 0 ? (
        <MandiEmptyState
          icon="chatbubbles-outline"
          title="No disputes"
          description="If something is wrong with a delivery, raise a dispute from the order."
        />
      ) : (
        (query.data ?? []).map((dispute) => (
          <DisputeListItem
            key={dispute.id}
            dispute={dispute}
            viewer="restaurant"
            onPress={() => router.push(`/restaurant/disputes/${dispute.id}`)}
          />
        ))
      )}
    </MandiScreen>
  );
}
