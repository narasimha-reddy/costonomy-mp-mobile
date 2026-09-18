import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchStoreIntents } from '@/services/intent';
import { storeIntentsKey } from '@/lib/queryKeys';
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
import type { Intent, IntentStatus as IntentStatusCode } from '@/models/intent';
import { supplierIntentStatus } from '@/models/status';
import { formatMoney } from '@/utils/money';
import { skuTitle } from '@/utils/skuLabel';
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
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <MandiCard>
        <View style={styles.row}>
          <View style={styles.flex}>
            <MandiText variant="bodyEmphasis">
              {request.items.length} item{request.items.length === 1 ? '' : 's'}
            </MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {request.reference}
            </MandiText>
          </View>
          <MandiStatusChip {...supplierIntentStatus(request.status, request.fulfilment)} />
        </View>

        <MandiText
          variant="caption"
          color={Colors.textSecondary}
          numberOfLines={2}
          style={styles.items}
        >
          {request.items.map((item) => skuTitle(item.sku)).filter(Boolean).join(', ')}
        </MandiText>

        {/* What this store said it would supply. Only meaningful once answered,
            and it is the figure the restaurant is deciding against. */}
        {request.acceptance != null && (
          <MandiText variant="caption" color={Colors.textTertiary}>
            You accepted {formatMoney(request.acceptance.offeredTotal)}
          </MandiText>
        )}
      </MandiCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { gap: Spacing.sm, paddingVertical: Spacing.xs },
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
