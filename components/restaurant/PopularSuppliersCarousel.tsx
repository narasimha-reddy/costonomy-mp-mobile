import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchPopularSuppliers } from '@/services/catalog';
import { MandiSkeletonList } from '@/components/common';
import { FilterPills } from '@/components/common/FilterPills';
import { MandiText } from '@/components/common/MandiText';
import { RecommendedTile } from '@/components/home/RecommendedTile';
import type { PopularSupplier } from '@/models/discovery';
import { Colors, Spacing } from '@/theme';

const TITLE = 'RECOMMENDED FOR YOU';

/** Chips over the data already on hand: nothing here is a new request. */
const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'direct', label: 'Order directly' },
];

function applyChip(suppliers: PopularSupplier[], chip: string): PopularSupplier[] {
  if (chip === 'open') return suppliers.filter((s) => s.openNow);
  if (chip === 'direct') return suppliers.filter((s) => s.directOrdersEnabled);
  return suppliers;
}

/**
 * Suppliers worth a look, as a three-column grid under "RECOMMENDED FOR YOU".
 *
 * <p><b>A three-column grid</b> (restyle v1), under a chips row that filters the
 * suppliers already fetched. "See all" and the per-tile credit line went with the
 * rail; the suppliers screen still has both.
 *
 * <p>Renders nothing when there are none. An empty state here would push
 * requests and orders down the screen to say "no suppliers", which is a
 * statement about the platform rather than about this kitchen.
 */
export function PopularSuppliersCarousel({ outletId }: { outletId: number | null }) {
  const router = useRouter();
  const { accessToken } = useSession();
  const [chip, setChip] = useState('all');

  const query = useQuery({
    queryKey: ['outlet', outletId, 'popular-suppliers'],
    queryFn: () => fetchPopularSuppliers(accessToken as string, outletId as number, 10),
    enabled: outletId != null && accessToken != null,
    // A supplier's catalogue does not change while somebody reads a home screen.
    staleTime: 5 * 60_000,
  });

  const suppliers = query.data ?? [];

  if (query.isPending) {
    return (
      <View style={styles.section}>
        <MandiText variant="label" color={Colors.textSecondary}>{TITLE}</MandiText>
        <MandiSkeletonList count={1} />
      </View>
    );
  }

  if (query.error != null || suppliers.length === 0) {
    return null;
  }

  const shown = applyChip(suppliers, chip);

  return (
    <View style={styles.section}>
      <FilterPills items={CHIPS} selected={chip} onSelect={setChip} />
      <MandiText variant="label" color={Colors.textSecondary} accessibilityRole="header">
        {TITLE}
      </MandiText>
      <View style={styles.grid}>
        {shown.map((supplier) => (
          <RecommendedTile
            key={supplier.supplierStoreId}
            supplier={supplier}
            onPress={() => router.push(`/restaurant/supplier/${supplier.supplierStoreId}`)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  // Wrapped rows of three 31% cells: the gap takes the remaining ~7%.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
});
