import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCategories, fetchPopularSuppliers } from '@/services/catalog';
import { SupplierTile } from '@/components/restaurant/SupplierTile';
import { useOutletCredit } from '@/hooks/useOutletCredit';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Every supplier who can serve this kitchen, by aisle.
 *
 * <p>Where the home rail's "See all" goes. The rail answers "who should I look
 * at"; this answers "who has dairy", which is the question a kitchen arrives
 * with when the rail did not happen to show the one they needed.
 *
 * <p><b>The aisle is sent to the server, not applied here.</b> Each supplier's
 * `categories` is capped at six for display, so filtering that list would drop
 * a supplier who stocks the aisle but lists six others more deeply — a browse
 * page that quietly omits suppliers is worse than no browse page.
 *
 * <p><b>Tabs come from the platform's categories, not from the suppliers.</b>
 * Deriving them from whoever happened to be returned would make the tab strip
 * change as the list below it changed, and an aisle would vanish the moment its
 * only supplier shut.
 */
export default function SuppliersScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { creditFor } = useOutletCredit();
  const [category, setCategory] = useState<number | null>(null);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    // A taxonomy does not move while somebody browses it.
    staleTime: 30 * 60_000,
  });

  const suppliers = useQuery({
    queryKey: ['outlet', outletId, 'suppliers', category],
    queryFn: () => fetchPopularSuppliers(accessToken as string, outletId as number, 50, category),
    enabled: outletId != null && accessToken != null,
    staleTime: 5 * 60_000,
  });

  const rows = suppliers.data ?? [];
  const tabs = [{ id: null as number | null, name: 'All' }, ...(categories.data ?? [])
    .map((entry) => ({ id: entry.id, name: entry.name }))];
  const tabName = tabs.find((tab) => tab.id === category)?.name ?? 'All';

  return (
    <MandiScreen
      header={<MandiHeader title="Suppliers" back />}
      onRefresh={() => suppliers.refetch()}
      refreshing={suppliers.isRefetching}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabRail}
        contentContainerStyle={styles.tabs}
      >
        {tabs.map((tab) => {
          const active = category === tab.id;
          return (
            <Pressable
              key={tab.id ?? 'all'}
              onPress={() => setCategory(tab.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <MandiText
                variant="caption"
                color={active ? Colors.surface : Colors.textSecondary}
              >
                {tab.name}
              </MandiText>
            </Pressable>
          );
        })}
      </ScrollView>

      {suppliers.isPending ? (
        <MandiSkeletonList count={4} />
      ) : suppliers.error ? (
        <MandiErrorState
          message="Couldn't load suppliers."
          onRetry={() => suppliers.refetch()}
        />
      ) : rows.length === 0 ? (
        <MandiEmptyState
          icon="storefront-outline"
          title={category == null ? 'No suppliers yet' : `Nobody stocks ${tabName} here`}
          description={
            category == null
              ? 'Suppliers who can serve this outlet will appear here.'
              : 'Try another aisle, or search for the item itself.'
          }
          actionLabel={category == null ? undefined : 'Show all suppliers'}
          onAction={category == null ? undefined : () => setCategory(null)}
        />
      ) : (
        <View style={styles.list}>
          <MandiSectionHeader
            title={category == null ? 'All Suppliers' : tabName}
            count={rows.length}
            subtitle="Nearest first"
          />
          {rows.map((supplier) => (
            <SupplierTile
              key={supplier.supplierStoreId}
              supplier={supplier}
              credit={creditFor(supplier.supplierStoreId)}
              wide
              onPress={() => router.push(`/restaurant/supplier/${supplier.supplierStoreId}`)}
            />
          ))}
        </View>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  // flexGrow 0, or the rail claims the column and the pills draw as ovals.
  tabRail: { flexGrow: 0, flexShrink: 0 },
  tabs: { gap: Spacing.sm, paddingVertical: Spacing.xs, alignItems: 'center' },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  list: { gap: Spacing.sm },
});
