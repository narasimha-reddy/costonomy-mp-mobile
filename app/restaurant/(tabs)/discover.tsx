import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCategories, fetchProducts } from '@/services/catalog';
import { CategoryTabs } from '@/components/product/CategoryTabs';
import { ProductCard } from '@/components/product/ProductCard';
import type { Category } from '@/models/catalog';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
} from '@/components/common';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { track } from '@/analytics';
import { Spacing } from '@/theme';

const SCREEN = 'REST-SEARCH-01';

/** The server clamps `size` to this. */
const CATALOG_PAGE = 100;

/**
 * The platform catalog, browsed by category. Doc 05 §6.
 *
 * <p>The same shelf as the supplier's own catalog seen from the other side, and
 * deliberately the same shape: `CategoryTabs` across the top, a field under them
 * that narrows what the tab is showing. A supplier lists SKUs against canonical
 * products; a restaurant browses the canonical products and chooses the SKU
 * afterwards, which is the one difference.
 *
 * <p>It replaces a grid of category tiles that cost a tap to learn each category
 * was empty. Tabs carry their counts, so an empty category is visible before it
 * is opened — and a category nobody stocks is not shown at all.
 *
 * <p><b>The field here filters; it does not search.</b> The whole catalog is
 * thirty-odd products and arrives in one request, so narrowing it is instant and
 * local. Search proper — which reaches SKUs and suppliers, and asks the server —
 * is its own screen, reached from Home.
 */
export default function DiscoverScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [term, setTerm] = useState('');

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
  });

  // One request for the catalog, then every tab and keystroke is local. The
  // catalog is platform-owned and small — thirty-odd products — so a request per
  // tab would be slower and would make the per-tab counts impossible.
  //
  // CATALOG_PAGE is the server's own cap (`listProducts` clamps size to 100).
  // Past that this silently shows the first hundred, and the response carries no
  // total to notice with: when the catalog outgrows one page, this screen needs
  // real paging rather than a bigger number.
  const products = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => fetchProducts(accessToken as string, { size: CATALOG_PAGE }),
    enabled: accessToken != null,
    staleTime: 5 * 60 * 1000,
  });

  const all = useMemo(() => products.data ?? [], [products.data]);

  /** The tab narrows first; the field narrows what is left. */
  const inCategory = useMemo(
    () => all.filter((product) => categoryId == null || product.categoryId === categoryId),
    [all, categoryId],
  );

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return inCategory;
    return inCategory.filter((product) =>
      `${product.name} ${product.categoryName ?? ''} ${product.aliases.join(' ')}`
        .toLowerCase()
        .includes(needle));
  }, [inCategory, term]);

  /** Counts on the tabs, so an empty category is visible before it is opened. */
  const counts = useMemo(() => {
    const map = new Map<number | null, number>();
    map.set(null, all.length);
    all.forEach((product) => {
      if (product.categoryId == null) return;
      map.set(product.categoryId, (map.get(product.categoryId) ?? 0) + 1);
    });
    return map;
  }, [all]);

  /** Categories the catalog actually has something in — an empty tab helps nobody. */
  const stocked = useMemo(
    () => (categories.data ?? []).filter((c: Category) => (counts.get(c.id) ?? 0) > 0),
    [categories.data, counts],
  );

  function open(productId: number) {
    track('open_product', { screen: SCREEN, outletId, entityId: productId });
    router.push(`/restaurant/product/${productId}`);
  }

  return (
    <MandiScreen
      header={(
        <View style={styles.header}>
          <RestaurantHeader screen={SCREEN} subtitle="Discover" />
          <CategoryTabs
            categories={stocked}
            selected={categoryId}
            onSelect={setCategoryId}
            counts={counts}
          />
        </View>
      )}
      onRefresh={() => products.refetch()}
      refreshing={products.isRefetching}
    >
      <MandiSearchBar
        value={term}
        onChangeText={setTerm}
        placeholder="Filter this list"
      />

      {products.isPending ? (
        <MandiSkeletonList count={6} />
      ) : products.error ? (
        <MandiErrorState message="Couldn't load the catalog." onRetry={() => products.refetch()} />
      ) : visible.length === 0 ? (
        <MandiEmptyState
          icon="basket-outline"
          title={term.trim() ? `Nothing matching "${term.trim()}"` : 'Nothing in this category'}
          description={
            term.trim()
              ? 'Try a shorter word, or the name your supplier uses.'
              : 'Products appear here once the platform lists them.'
          }
        />
      ) : (
        visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            variant="row"
            onPress={() => open(product.id)}
          />
        ))
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.sm, paddingBottom: Spacing.sm },
});
