import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchCategories, fetchProducts } from '@/services/catalog';
import { ProductCard } from '@/components/product/ProductCard';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
} from '@/components/common';
import { track } from '@/analytics';

const SCREEN = 'REST-SEARCH-02';

/** The server clamps `size` to this. Same cap Discover asks for. */
const CATALOG_PAGE = 100;

/**
 * Products in one category. Doc 05 §6's category filter, as its own screen.
 *
 * <p><b>Laid out as Discover, because it is Discover with one tab fixed.</b> The
 * two screens list the same canonical products from the same query and are
 * reached one from the other, so a full-width card here and a row there made
 * them look like two different catalogs. Rows also fit far more of the category
 * on a screen, which is the point of opening a category.
 *
 * <p><b>The field filters; it does not search.</b> Exactly as on Discover — this
 * narrows the category already in hand, locally and per keystroke. Search proper
 * reaches SKUs and suppliers and asks the server; it is its own screen.
 *
 * <p>Which is why the query asks for `CATALOG_PAGE` rather than the server's
 * default twenty: a field that filters what was fetched must be given the whole
 * category, or it quietly reports "nothing matching" about products it was never
 * shown. Past a hundred in one category this needs real paging — the response
 * carries no total, so there is nothing here to notice the truncation with.
 */
export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = Number(id);
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const [term, setTerm] = useState('');

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
  });

  const products = useQuery({
    queryKey: ['products', { categoryId, outletId, size: CATALOG_PAGE }],
    queryFn: () =>
      fetchProducts(accessToken as string, { categoryId, outletId, size: CATALOG_PAGE }),
    enabled: Number.isFinite(categoryId) && accessToken != null,
  });

  const category = (categories.data ?? []).find((item) => item.id === categoryId);

  const all = useMemo(() => products.data ?? [], [products.data]);

  // The same fields Discover matches on, so a word that finds a product there
  // finds it here. Aliases matter most: a kitchen types "dhaniya", not
  // "coriander".
  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((product) =>
      `${product.name} ${product.categoryName ?? ''} ${product.aliases.join(' ')}`
        .toLowerCase()
        .includes(needle));
  }, [all, term]);

  return (
    <MandiScreen
      header={<MandiHeader title={category?.name ?? 'Category'} back />}
      onRefresh={() => products.refetch()}
      refreshing={products.isRefetching}
    >
      {/* Named, not "Filter this list". Discover's field sits under tabs that
          already say which category is in hand; here the category is the whole
          screen, and naming it is what tells a reader the field narrows Dairy
          rather than the catalog. Falls back while the category name loads. */}
      <MandiSearchBar
        value={term}
        onChangeText={setTerm}
        placeholder={category ? `Search in ${category.name}` : 'Search products'}
      />

      {products.isPending ? (
        <MandiSkeletonList count={6} />
      ) : products.error ? (
        <MandiErrorState message="Couldn't load this category." onRetry={() => products.refetch()} />
      ) : visible.length === 0 ? (
        <MandiEmptyState
          icon="basket-outline"
          title={term.trim() ? `Nothing matching "${term.trim()}"` : 'Nothing here yet'}
          description={
            term.trim()
              ? 'Try a shorter word, or the name your supplier uses.'
              : 'No supplier delivering to this outlet is stocking this category.'
          }
        />
      ) : (
        // One child, not thirty: `MandiScreen` puts `sectionGap` between its
        // direct children, which is right between sections and wrong between the
        // rows of a list.
        <View style={styles.list}>
          {visible.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              variant="row"
              onPress={() => {
                track('open_product', { screen: SCREEN, outletId, entityId: product.id });
                router.push(`/restaurant/product/${product.id}`);
              }}
            />
          ))}
        </View>
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  // No gap: each row carries its own padding and a hairline beneath it, and the
  // hairline is what separates them.
  list: {},
});
