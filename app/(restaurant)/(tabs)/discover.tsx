import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCategories, searchSuppliers } from '@/services/catalog';
import {
  MandiCard,
  MandiEmptyState,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
  OutletSelector,
} from '@/components/common';
import { Colors, Spacing } from '@/theme';

/** REST-SEARCH-01 entry. Doc 05 §6 — categories and suppliers, search is a push. */
export default function DiscoverScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
  });

  const suppliers = useQuery({
    queryKey: ['outlet', outletId, 'suppliers'],
    queryFn: () => searchSuppliers(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });

  return (
    <MandiScreen header={<Header />}>
      <MandiSearchBar
        value=""
        onChangeText={() => {}}
        readOnly
        onPress={() => router.push('/(restaurant)/search')}
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
                onPress={() => router.push(`/(restaurant)/category/${category.id}`)}
              >
                <MandiText variant="captionEmphasis" numberOfLines={2}>{category.name}</MandiText>
              </MandiCard>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <MandiSectionHeader title="Suppliers near you" />
        {suppliers.isPending ? (
          <MandiSkeletonList count={2} />
        ) : (suppliers.data ?? []).length === 0 ? (
          <MandiEmptyState
            icon="storefront-outline"
            title="No suppliers serving this outlet yet"
            description="We'll show them here as they start delivering to your area."
          />
        ) : (
          (suppliers.data ?? []).map((supplier) => (
            <MandiCard key={supplier.supplierStoreId}>
              <MandiText variant="bodyEmphasis">{supplier.supplierName}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {[supplier.storeName, supplier.city].filter(Boolean).join(' · ')}
                {supplier.productCount != null && ` · ${supplier.productCount} products`}
              </MandiText>
              {!supplier.serviceable && (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  Not currently delivering to this outlet
                </MandiText>
              )}
            </MandiCard>
          ))
        )}
      </View>
    </MandiScreen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <MandiText variant="title">Discover</MandiText>
      <OutletSelector />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  section: { gap: Spacing.listGap },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gridCard: { width: '31%', minHeight: 64, justifyContent: 'center' },
});
