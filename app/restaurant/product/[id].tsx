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
  MandiScreen,
  MandiSectionHeader,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * REST-PROD-01 and REST-SUP-01 in one screen. Doc 05 §7–§8.
 *
 * <p>Product and comparison are the same decision — "what do I need, and who
 * should I buy it from" — and splitting them would mean two round trips and a
 * back-and-forth to change quantity.
 *
 * <p><b>Quantity belongs to the pack, not to the product.</b> One quantity for
 * every supplier, counted in the product's base unit, was wrong the moment two
 * suppliers packed it differently: asking for 25 kg of rice from a supplier
 * selling 25 kg sacks ordered twenty-five sacks, because the cart counts packs
 * and the stepper counted kilos. Each card now counts its own packs, which is the
 * only unit that means the same thing on both sides.
 *
 * <p>The feed is therefore asked to rank a single pack. `coversFullQuantity` then
 * answers "is there at least one", and the quantity a restaurant actually wants
 * is chosen per supplier, after seeing what a pack is.
 */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  // Packs, per offer. Absent means one — nobody has touched that card's stepper.
  const [packs, setPacks] = useState<Record<number, number>>({});
  const packsFor = (offerId: number) => packs[offerId] ?? 1;

  const product = useQuery({
    // The outlet is in the key because it changes the answer: "3 suppliers" is
    // three who deliver *here*, and a cached count from another outlet is wrong.
    queryKey: ['product', productId, outletId],
    queryFn: () => fetchProduct(accessToken as string, productId, outletId ?? undefined),
    enabled: Number.isFinite(productId) && accessToken != null,
  });

  const recommendations = useQuery({
    queryKey: ['product', productId, 'recommendations', outletId],
    queryFn: () =>
      fetchRecommendations(accessToken as string, productId, outletId as number, '1'),
    enabled: Number.isFinite(productId) && outletId != null && accessToken != null,
  });

  const add = useMutation({
    mutationFn: (offerId: number) =>
      addCartItem(accessToken as string, outletId as number, {
        supplierOfferId: offerId,
        // Packs. The server prices `sellingPrice × quantity`, and `sellingPrice`
        // is the price of one pack.
        quantity: String(packsFor(offerId)),
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
        </MandiCard>
      )}

      <View style={styles.section}>
        <MandiSectionHeader
          title="Compare suppliers"
          count={offers.length}
          subtitle={
            offers.length
              // Said once for the whole list rather than on every card. It is a
              // fact about how delivery is priced, not about any one supplier.
              ? 'Prices exclude delivery, which is quoted once a courier is assigned.'
              : undefined
          }
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
              quantity={packsFor(offer.offerId)}
              onQuantity={(next) =>
                setPacks((current) => ({ ...current, [offer.offerId]: next }))}
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
});
