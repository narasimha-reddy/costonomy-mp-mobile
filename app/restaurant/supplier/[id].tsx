import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useAddToCart } from '@/hooks/useAddToCart';
import { useDebounced } from '@/hooks/useDebounced';
import { fetchStoreCatalog } from '@/services/catalog';
import { SkuRow } from '@/components/product/SkuRow';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSearchBar,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { placeLabel } from '@/utils/placeName';
import { formatQuantity } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * One supplier's shelf, as a restaurant shops it.
 *
 * <p>Reached by tapping a supplier in search. It is the same row as everywhere
 * else — pack, price, picture, Add — with the supplier line suppressed, because
 * repeating the name on every row of a screen titled with that name is noise.
 *
 * <p><b>It shows the shelf even when the store cannot deliver here.</b> The
 * restaurant asked for this supplier by name; an empty screen would answer a
 * question they did not ask. Whether an order can actually be placed is settled at
 * checkout, by the server, which is the only place that can settle it.
 *
 * <p>Filtering is a search within the store rather than a category tree: a
 * supplier's shelf is a few dozen items, and a two-level taxonomy over that costs
 * more taps than it saves.
 */
export default function SupplierCatalogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const storeId = Number(id);
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const addToCart = useAddToCart();
  const [term, setTerm] = useState('');

  const settled = useDebounced(term, 250);

  const query = useQuery({
    queryKey: ['supplier-store', storeId, 'catalog', outletId, settled.trim()],
    queryFn: () =>
      fetchStoreCatalog(accessToken as string, storeId, outletId ?? undefined, settled.trim()),
    enabled: Number.isFinite(storeId) && accessToken != null,
  });

  const rows = query.data ?? [];

  // The store's identity comes off its own rows rather than a second request:
  // every row carries the supplier, and there is no catalog without one.
  const store = rows[0];
  const title = store
    ? placeLabel(store.storeName, store.supplierName) ?? store.supplierName
    : 'Supplier';

  return (
    <MandiScreen
      header={<MandiHeader title={store?.supplierName ?? 'Supplier'} subtitle={subtitle(store, title)} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
    >
      <MandiSearchBar
        value={term}
        onChangeText={setTerm}
        placeholder="Search this supplier"
        loading={query.isFetching}
      />

      {query.isPending ? (
        <MandiSkeletonList count={5} />
      ) : query.error ? (
        <MandiErrorState
          message="Couldn't load this supplier's catalog."
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <MandiEmptyState
          icon="basket-outline"
          title={settled.trim() ? `Nothing for "${settled.trim()}"` : 'Nothing listed yet'}
          description={
            settled.trim()
              ? 'This supplier may call it something else.'
              : 'This supplier has not listed anything for sale.'
          }
        />
      ) : (
        <View style={styles.section}>
          {store && !store.openNow && (
            <View style={styles.closed}>
              <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
              <MandiText variant="caption" color={Colors.textSecondary}>
                {store.opensAt
                  ? `Closed right now — opens ${store.opensAt}. You can still add to your cart.`
                  : 'Closed right now. You can still add to your cart.'}
              </MandiText>
            </View>
          )}
          <MandiSectionHeader title="Everything they sell" count={rows.length} />
          {rows.map((sku) => (
            <SkuRow
              key={sku.offerId}
              sku={sku}
              hideSupplier
              onAdd={() => addToCart.mutate(sku.offerId)}
              adding={addToCart.isPending && addToCart.variables === sku.offerId}
            />
          ))}
        </View>
      )}
    </MandiScreen>
  );
}

/** Branch and distance, when there is a branch or a distance to give. */
function subtitle(
  store: { storeName: string; supplierName: string; distanceKm: string | null } | undefined,
  branch: string,
): string | undefined {
  if (!store) return undefined;
  return [
    branch !== store.supplierName ? branch : null,
    store.distanceKm != null ? `${formatQuantity(store.distanceKm)} km away` : null,
  ].filter(Boolean).join(' · ') || undefined;
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  closed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceSunken,
    borderRadius: Spacing.sm,
  },
});
