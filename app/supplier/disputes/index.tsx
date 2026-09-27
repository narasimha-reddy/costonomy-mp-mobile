import React from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchStoreDisputes } from '@/services/trust';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
} from '@/components/common';
import { DisputeListItem } from '@/components/dispute/DisputeListItem';

/**
 * SUP-DISPUTES-01. Disputes on the store's orders, and refunds waiting for an
 * answer (API D-104). A refund request has a 48-hour clock, so it shows here as
 * "Needs your answer" until someone decides it.
 */
export default function SupplierDisputesScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { storeId } = useStore();

  const query = useQuery({
    queryKey: ['store', storeId, 'disputes'],
    queryFn: () => fetchStoreDisputes(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });

  return (
    <MandiScreen
      header={<MandiHeader title="Disputes" back right={<StoreSelector />} />}
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
          description="When a restaurant raises a problem with a delivery, it appears here."
        />
      ) : (
        (query.data ?? []).map((dispute) => (
          <DisputeListItem
            key={dispute.id}
            dispute={dispute}
            viewer="supplier"
            onPress={() => router.push(`/supplier/disputes/${dispute.id}`)}
          />
        ))
      )}
    </MandiScreen>
  );
}
