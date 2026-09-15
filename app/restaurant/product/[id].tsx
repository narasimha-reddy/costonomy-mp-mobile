import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchProduct, fetchRecommendations } from '@/services/catalog';
import { addCartItem } from '@/services/procurement';
import { OfferCard } from '@/components/supplier/OfferCard';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiQuantityStepper,
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatQuantity } from '@/utils/money';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * REST-PROD-01 and REST-SUP-01 in one screen. Doc 05 §7–§8.
 *
 * <p>Product and comparison are the same decision — "what do I need, and who
 * should I buy it from" — and splitting them would mean two round trips and a
 * back-and-forth to change quantity.
 *
 * <p><b>Quantity drives the ranking.</b> The recommendation feed is asked for a
 * specific quantity, so the offers it returns already account for who can
 * actually cover it — `coversFullQuantity` is meaningless without one.
 */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const [quantity, setQuantity] = useState(1);

  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(accessToken as string, productId),
    enabled: Number.isFinite(productId) && accessToken != null,
  });

  const recommendations = useQuery({
    queryKey: ['product', productId, 'recommendations', outletId, quantity],
    queryFn: () =>
      fetchRecommendations(accessToken as string, productId, outletId as number, String(quantity)),
    enabled: Number.isFinite(productId) && outletId != null && accessToken != null,
  });

  const add = useMutation({
    mutationFn: (offerId: number) =>
      addCartItem(accessToken as string, outletId as number, {
        supplierOfferId: offerId,
        quantity: String(quantity),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'cart'] });
      toast.show('Added to cart', 'success');
    },
    onError: (error) => {
      // The server's own words. §23A.8: a refusal explains itself, and a generic
      // "something went wrong" is what makes a user try the same thing again.
      toast.show(
        error instanceof ApiError ? error.message : 'Could not add that. Try again.',
        'error',
      );
    },
  });

  const offers = recommendations.data?.offers ?? [];

  return (
    <MandiScreen header={<Header title={product.data?.name} />}>
      {product.isPending ? (
        <MandiSkeletonList count={1} />
      ) : product.error ? (
        <MandiErrorState message="Couldn't load this product." onRetry={() => product.refetch()} />
      ) : (
        <MandiCard>
          <MandiText variant="subtitle">{product.data?.name}</MandiText>
          {product.data?.categoryName && (
            <MandiText variant="caption" color={Colors.textSecondary}>
              {product.data.categoryName}
            </MandiText>
          )}
          {product.data?.description && (
            <MandiText variant="body" color={Colors.textSecondary}>
              {product.data.description}
            </MandiText>
          )}
          <View style={styles.quantityRow}>
            <MandiText variant="bodyEmphasis">
              Quantity ({product.data?.baseUnit ?? 'unit'})
            </MandiText>
            <MandiQuantityStepper
              value={quantity}
              onChange={setQuantity}
              min={1}
              unit={product.data?.baseUnit}
            />
          </View>
          {product.data?.basePackSize != null && (
            <MandiText variant="caption" color={Colors.textTertiary}>
              Standard pack {formatQuantity(product.data.basePackSize)} {product.data.baseUnit}
            </MandiText>
          )}
        </MandiCard>
      )}

      <View style={styles.section}>
        <MandiSectionHeader
          title="Compare suppliers"
          subtitle={offers.length ? `${offers.length} stocking this` : undefined}
        />

        {recommendations.isPending ? (
          <MandiSkeletonList count={3} />
        ) : recommendations.error ? (
          <MandiErrorState
            message="Couldn't load supplier offers."
            onRetry={() => recommendations.refetch()}
          />
        ) : offers.length === 0 ? (
          // §23A.15: an unmet need is explained, never silently empty.
          <MandiEmptyState
            icon="storefront-outline"
            title="No supplier has this right now"
            description={
              recommendations.data?.unservedReason ??
              'Nobody delivering to this outlet is stocking it at the moment.'
            }
            actionLabel="Search something else"
            onAction={() => router.push('/restaurant/search')}
          />
        ) : (
          offers.map((offer, index) => (
            <OfferCard
              key={offer.offerId}
              offer={offer}
              // The server ranks; the first is the recommendation. The client
              // must never re-sort — doing so would quietly substitute its own
              // ranking for the one doc 07 specifies and tests.
              recommended={index === 0}
              adding={add.isPending && add.variables === offer.offerId}
              onAdd={() => add.mutate(offer.offerId)}
            />
          ))
        )}
      </View>

      <MandiButton
        label="Go to cart"
        variant="secondary"
        onPress={() => router.push('/restaurant/cart')}
      />
    </MandiScreen>
  );
}

function Header({ title }: { title?: string }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}
      >
        <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
      </Pressable>
      <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.headerTitle}>
        {title ?? 'Product'}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
  },
  back: { width: TouchTarget.min, height: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  section: { gap: Spacing.listGap },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});
