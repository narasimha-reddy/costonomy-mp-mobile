import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRequestBasket } from '@/hooks/useRequestBasket';
import { useCartQuantity } from '@/hooks/useCartQuantity';
import { fetchProduct, fetchRecommendations } from '@/services/catalog';
import { OfferCard } from '@/components/supplier/OfferCard';
import {
  ComparisonChoicesBar, DEFAULT_COMPARISON, comparisonIsFiltered, describeComparisonFilters,
  type ComparisonChoices,
} from '@/components/restaurant/ComparisonChoices';
import { useDebounced } from '@/hooks/useDebounced';
import { CartBar } from '@/components/restaurant/CartBar';
import {
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
  MandiSectionHeader,
} from '@/components/common';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * REST-PROD-01 and REST-SUP-01 in one screen. Doc 05 §7–§8.
 *
 * <p>Product and comparison are the same decision — "what do I need, and who
 * should I buy it from" — so the product is the header rather than a card of its
 * own above the answer. A panel repeating the title under the title was a row of
 * screen spent saying nothing.
 *
 * <p><b>The cart is the state, and the steppers write to it.</b> Each card shows
 * how many packs of that supplier's are already in the cart, so there is nothing
 * to confirm and nothing to lose by navigating away — and the totals, per line
 * and for the whole cart, are the server's own figures rather than this screen's
 * arithmetic (guardrail 3).
 *
 * <p><b>Quantity belongs to the pack.</b> One quantity for every supplier, counted
 * in the product's base unit, was wrong the moment two suppliers packed it
 * differently: 25 kg of rice from a supplier selling 25 kg sacks ordered
 * twenty-five sacks. Packs are the only unit that means the same thing on both
 * sides of the wire.
 */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const router = useRouter();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { basket, drafts } = useRequestBasket();

  const product = useQuery({
    // The outlet is in the key because it changes the answer: "3 suppliers" is
    // three who deliver *here*, and a cached count from another outlet is wrong.
    queryKey: ['product', productId, outletId],
    queryFn: () => fetchProduct(accessToken as string, productId, outletId ?? undefined),
    enabled: Number.isFinite(productId) && accessToken != null,
  });

  // What the buyer needs and how they want the suppliers shown. Both go to the server; the list is never sorted or
  // filtered here (API D-183).
  const [choices, setChoices] = useState<ComparisonChoices>(DEFAULT_COMPARISON);
  const [need, setNeed] = useState('1');
  const settledNeed = useDebounced(need, 400);
  const quantityAsked = Number(settledNeed) > 0 ? settledNeed : '1';

  const recommendations = useQuery({
    queryKey: ['product', productId, 'recommendations', outletId, quantityAsked, choices],
    queryFn: () =>
      fetchRecommendations(accessToken as string, productId, outletId as number, quantityAsked, {
        sort: choices.sort,
        coversQuantity: choices.coversQuantity,
        openNow: choices.openNow,
        radiusKm: choices.radiusKm,
      }),
    enabled: Number.isFinite(productId) && outletId != null && accessToken != null,
  });

  // The same quantity handling as the pack and supplier screens (useCartQuantity): a burst of taps is one write of the
  // last value, writes for a line go in order, and a tap still waiting when the screen is left is sent, not dropped.
  // This screen had its own copy, which cleared the timer on leaving and lost the tap.
  const { packsFor, queueChange, inCart } = useCartQuantity(drafts);

  const offers = recommendations.data?.offers ?? [];

  const cartCount = drafts.reduce((n, draft) => n + draft.items.length, 0);

  return (
    <MandiScreen
      header={<Header title={product.data?.name} subtitle={product.data?.categoryName} />}
      footer={
        <CartBar
          count={cartCount}
          total={basket?.agreedTotal}
          supplierCount={drafts.length}
          onPress={() => router.push('/restaurant/cart')}
        />
      }
    >
      {/* The shared header, rather than a hand-rolled one. It was the last
          uppercase heading in the app, and it sat outside the treatment every
          other section got — same words, different shape, on a screen a kitchen
          reaches from those sections. */}
      <MandiSectionHeader
        title="Compare Suppliers"
        count={offers.length}
        subtitle="Prices exclude delivery, which is quoted when you order."
      />

      <ComparisonChoicesBar
        choices={choices}
        onChange={setChoices}
        need={need}
        onNeedChange={setNeed}
        unit={recommendations.data?.unit ?? null}
        supplierCount={offers.length + (recommendations.data?.hiddenByFilters ?? 0)}
      />
      {(recommendations.data?.hiddenByFilters ?? 0) > 0 && offers.length > 0 && (
        <MandiText variant="caption" color={Colors.textSecondary} style={styles.hidden}>
          {recommendations.data?.hiddenByFilters} more hidden by your filters
        </MandiText>
      )}

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
          title={comparisonIsFiltered(choices) ? 'No supplier matches' : 'No supplier has this right now'}
          description={
            comparisonIsFiltered(choices)
              ? `No supplier matches: ${describeComparisonFilters(choices).join(', ')}.`
              : recommendations.data?.unservedReason ??
                'Nobody delivering to this outlet is stocking it at the moment.'
          }
          actionLabel={comparisonIsFiltered(choices) ? 'Clear filters' : 'Search something else'}
          onAction={comparisonIsFiltered(choices)
            ? () => setChoices({ sort: choices.sort })
            : () => router.push('/restaurant/search')}
        />
      ) : (
        offers.map((offer, index) => {
          const line = inCart.get(offer.supplierSkuId);
          return (
            <OfferCard
              key={offer.offerId}
              offer={offer}
              // The server ranks; the first is the recommendation. The client
              // must never re-sort — doing so would quietly substitute its own
              // ranking for the one doc 07 specifies and tests.
              // Only when the list is in the server's own ranking: under another sort the first card is the cheapest
              // or nearest, not the recommendation.
              recommended={index === 0 && choices.sort === 'best_value'}
              quantity={packsFor(offer.supplierSkuId)}
              // `agreedLineTotal`, not `lineTotal`: the second is the
              // supplier's answer and is null on a draft, so the figure never
              // appeared. Both are the server's — nothing here multiplies.
              lineTotal={line?.agreedLineTotal}
              quantityForSku={packsFor}
              lineTotalForSku={(skuId) => inCart.get(skuId)?.agreedLineTotal}
              onQuantity={(packs, skuId) => queueChange(skuId ?? offer.supplierSkuId, packs)}
              // Comparing suppliers often ends in wanting to see one properly —
              // what else they carry, how far off they are, whether there is
              // credit. The seller panel is the way through.
              onOpenSupplier={() =>
                router.push(`/restaurant/supplier/${offer.supplierStoreId}`)}
              onOpenSku={(skuId) => router.push(`/restaurant/sku/${skuId ?? offer.supplierSkuId}`)}
              onOpenPack={(supplierSkuId) =>
                router.push(`/restaurant/sku/${supplierSkuId}`)}
            />
          );
        })
      )}
    </MandiScreen>
  );
}

/**
 * What the cart is worth, and the way to it.
 *
 * <p>The figure is the server's `totalAmount`, not a sum of what is on screen:
 * the cart holds lines from other products too, and adding up the visible ones
 * would quietly contradict the cart it links to.
 */
/**
 * What is waiting to be sent, and the way to it.
 *
 * <p><b>No total, deliberately.</b> This bar used to carry the cart's value, and
 * there is no equivalent here: a request holds no prices, so any figure would be
 * one the app invented. What it says instead is how many suppliers are about to
 * be asked, which is the thing that actually surprises people — three items can
 * be three separate conversations.
 */

function Header({ title, subtitle }: { title?: string; subtitle?: string | null }) {
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
      <View style={styles.headerTitle}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{title ?? 'Product'}</MandiText>
        {subtitle != null && (
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {subtitle}
          </MandiText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { paddingHorizontal: Spacing.screenHorizontal },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
  },
  back: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, gap: 1 },
  flex: { flex: 1 },
});
