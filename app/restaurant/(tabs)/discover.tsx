import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchCategories } from '@/services/catalog';
import {
  MandiCard,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { Spacing } from '@/theme';

/** REST-SEARCH-01 entry. Doc 05 §6 — categories and suppliers, search is a push. */
export default function DiscoverScreen() {
  const router = useRouter();
  const { accessToken } = useSession();

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <MandiScreen header={<RestaurantHeader screen="REST-SEARCH-01" subtitle="Discover" />}>
      <MandiSearchBar
        value=""
        onChangeText={() => {}}
        readOnly
        onPress={() => router.push('/restaurant/search')}
        placeholder="Search paneer, rice, oil…"
      />

      <View style={styles.section}>
        <MandiSectionHeader title="Categories" />
        {categories.isPending ? (
          <MandiSkeletonList count={3} />
        ) : (
          <View style={styles.grid}>
            {(categories.data ?? []).map((category) => (
              <MandiCard
                key={category.id}
                compact
                style={styles.gridCard}
                onPress={() => router.push(`/restaurant/category/${category.id}`)}
              >
                <MandiText variant="captionEmphasis" numberOfLines={2}>{category.name}</MandiText>
              </MandiCard>
            ))}
          </View>
        )}
      </View>

    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gridCard: { width: '31%', minHeight: 64, justifyContent: 'center' },
});
