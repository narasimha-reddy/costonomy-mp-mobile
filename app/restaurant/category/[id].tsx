import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchCategories, fetchProducts } from '@/services/catalog';
import { ProductCard } from '@/components/product/ProductCard';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
} from '@/components/common';
import { track } from '@/analytics';

const SCREEN = 'REST-SEARCH-02';

/** Products in one category. Doc 05 §6's category filter, as its own screen. */
export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = Number(id);
  const router = useRouter();
  const { accessToken } = useSession();

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchCategories(accessToken as string),
    enabled: accessToken != null,
    staleTime: 60 * 60 * 1000,
  });

  const products = useQuery({
    queryKey: ['products', { categoryId }],
    queryFn: () => fetchProducts(accessToken as string, { categoryId }),
    enabled: Number.isFinite(categoryId) && accessToken != null,
  });

  const category = (categories.data ?? []).find((item) => item.id === categoryId);

  return (
    <MandiScreen
      header={<MandiHeader title={category?.name ?? 'Category'} back />}
      onRefresh={() => products.refetch()}
      refreshing={products.isRefetching}
    >
      {products.isPending ? (
        <MandiSkeletonList count={5} />
      ) : products.error ? (
        <MandiErrorState message="Couldn't load this category." onRetry={() => products.refetch()} />
      ) : (products.data ?? []).length === 0 ? (
        <MandiEmptyState
          icon="basket-outline"
          title="Nothing here yet"
          description="No supplier delivering to this outlet is stocking this category."
        />
      ) : (
        (products.data ?? []).map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onPress={() => {
              track('open_product', { screen: SCREEN, entityId: product.id });
              router.push(`/restaurant/product/${product.id}`);
            }}
          />
        ))
      )}
    </MandiScreen>
  );
}
