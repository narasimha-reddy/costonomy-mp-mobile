import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { fetchAgeing } from '@/services/credit';
import type { AgeingBucket, AgeingBucketKey } from '@/models/credit';
import { StoreSelector } from '@/components/supplier/StoreSelector';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiOfflineBanner,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { AGEING_COPY, ageingSegments, restaurantLabel } from '@/lib/credit/receivables';
import { ageingKey } from '@/lib/queryKeys';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/** One swatch per bucket; the cards beside it say the same in words, so colour is never alone. */
const BUCKET_COLOUR: Record<AgeingBucketKey, string> = {
  CURRENT: Colors.credit,
  D1_7: Colors.warning,
  D8_30: Colors.danger,
  D30_PLUS: Colors.textPrimary,
};

const MIN_TAP = 48;

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Ageing: what is owed, by how late it is.
 *
 * <p>Every amount, count and the bucket boundaries (days past the due date, in
 * India time) are the server's. The only arithmetic here is the width of each bar
 * segment, which is drawing and never shown.
 */
export default function AgeingScreen() {
  const { accessToken } = useSession();
  const { storeId } = useStore();
  const { offline } = useNetworkStatus();

  const query = useQuery({
    queryKey: ageingKey(storeId),
    queryFn: () => fetchAgeing(accessToken as string, storeId as number),
    enabled: storeId != null && accessToken != null,
  });
  const ageing = query.data;

  return (
    <MandiScreen
      header={<MandiHeader title="Ageing" subtitle="What is owed, by how late" back right={<StoreSelector />} />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      moreBelow="More below"
    >
      <MandiOfflineBanner visible={offline} />
      {query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error || ageing == null ? (
        <MandiErrorState message="Couldn't load the ageing." onRetry={() => query.refetch()} />
      ) : !(ageing.total > 0) ? (
        <MandiEmptyState
          icon="checkmark-done-outline"
          title="Nothing to collect right now"
          description="When restaurants owe you on credit, it shows here by how late it is."
        />
      ) : (
        <>
          <MandiCard testID="ageing-total">
            <MandiText variant="caption" color={Colors.textSecondary}>To receive</MandiText>
            <MandiText variant="title" numberOfLines={1} adjustsFontSizeToFit>{formatMoney(ageing.total)}</MandiText>
            <View
              style={styles.bar}
              testID="ageing-bar"
              accessible
              accessibilityRole="image"
              accessibilityLabel={ageing.buckets
                .map((b) => `${AGEING_COPY[b.bucket].line} ${formatMoney(b.amount)}`)
                .join(', ')}
            >
              {ageingSegments(ageing).map((s) => (
                <View
                  key={s.bucket}
                  testID={`ageing-segment-${s.bucket}`}
                  style={{ width: `${s.percent}%`, backgroundColor: BUCKET_COLOUR[s.bucket] }}
                />
              ))}
            </View>
          </MandiCard>

          {ageing.buckets.map((b) => <BucketCard key={b.bucket} bucket={b} />)}
        </>
      )}
    </MandiScreen>
  );
}

function BucketCard({ bucket }: { bucket: AgeingBucket }) {
  const router = useRouter();
  const copy = AGEING_COPY[bucket.bucket];
  return (
    <MandiCard testID={`ageing-card-${bucket.bucket}`}>
      <View style={styles.head}>
        <View style={[styles.swatch, { backgroundColor: BUCKET_COLOUR[bucket.bucket] }]} />
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis">{copy.title}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary}>{copy.line}</MandiText>
        </View>
        <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.amount}>
          {formatMoney(bucket.amount)}
        </MandiText>
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>
        {`${counted(bucket.invoiceCount, 'invoice', 'invoices')} · ${counted(bucket.restaurantCount, 'restaurant', 'restaurants')}`}
      </MandiText>

      {bucket.topRestaurants.map((r) => {
        const name = restaurantLabel(r);
        return (
          <Pressable
            key={r.agreementId}
            testID={`ageing-top-${bucket.bucket}-${r.agreementId}`}
            onPress={() => router.push(`/supplier/credit/${r.agreementId}`)}
            accessibilityRole="button"
            accessibilityLabel={`${name.primary}${name.secondary ? `, ${name.secondary}` : ''}, ${formatMoney(r.amount)}, ${counted(r.invoiceCount, 'invoice', 'invoices')}`}
            style={({ pressed }) => [styles.top, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <MandiText variant="body" numberOfLines={2}>{name.primary}</MandiText>
              {name.secondary != null && (
                <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>{name.secondary}</MandiText>
              )}
            </View>
            <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.amount}>{formatMoney(r.amount)}</MandiText>
            <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.textTertiary} />
          </Pressable>
        );
      })}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, flexShrink: 1 },
  bar: {
    flexDirection: 'row',
    height: 12,
    marginTop: Spacing.sm,
    borderRadius: Radius.full,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSunken,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  swatch: { width: 12, height: 12, borderRadius: Radius.full },
  amount: { flexShrink: 1, maxWidth: '55%', textAlign: 'right' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MIN_TAP,
    paddingTop: Spacing.xs,
  },
  pressed: { opacity: 0.85 },
});
