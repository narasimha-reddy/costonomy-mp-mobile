import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useCart } from '@/hooks/useCart';
import { fetchProduct, fetchRecommendations } from '@/services/catalog';
import { addCartItem, removeCartItem, updateCartItem } from '@/services/procurement';
import type { ProcurementItem } from '@/models/procurement';
import { OfferCard } from '@/components/supplier/OfferCard';
import {
  MandiButton,
  MandiEmptyState,
  MandiErrorState,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
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
  const { id, requirementItemId } = useLocalSearchParams<{
    id: string;
    /** Set when this purchase is sourcing a requirement. */
    requirementItemId?: string;
  }>();
  const productId = Number(id);
  const servingRequirement = Number(requirementItemId);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { cart } = useCart();

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

  /**
   * Cart lines by SKU.
   *
   * <p>A line records the SKU it was bought as rather than the offer, so that is
   * what joins a card to what is already in the basket — and it is the right key
   * anyway: the same SKU re-priced is still the same thing you are buying.
   */
  const inCart = useMemo(() => {
    const map = new Map<number, ProcurementItem>();
    cart?.supplierGroups.forEach((group) =>
      group.items.forEach((item) => map.set(item.supplierSkuId, item)));
    return map;
  }, [cart]);

  /**
   * What the stepper shows while the server catches up.
   *
   * <p>The cart is the truth, but it is a round trip away, and a stepper that
   * waits for one counts wrong when tapped twice: the second tap reads a quantity
   * the first has not yet changed. Three taps landed as two. So a tapped value is
   * held here, shown immediately, and released once the cart has come back
   * agreeing with it.
   */
  const [desired, setDesired] = useState<Record<number, number>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  const change = useMutation({
    mutationFn: async ({ offerId, skuId, packs }: {
      offerId: number;
      skuId: number;
      packs: number;
    }) => {
      const line = inCart.get(skuId);
      if (line == null) {
        return addCartItem(accessToken as string, outletId as number, {
          supplierOfferId: offerId,
          // Packs. The server prices `sellingPrice × quantity`, and
          // `sellingPrice` is the price of one pack.
          quantity: String(packs),
          // Links the line to the need it serves, so the accepted quantity
          // credits back to the requirement and a shortfall stays sourceable
          // (guardrail 14). Absent when someone is just shopping.
          requirementItemId: Number.isFinite(servingRequirement)
            ? servingRequirement : undefined,
        });
      }
      // Zero is not a quantity; it is the absence of the line.
      return packs <= 0
        ? removeCartItem(accessToken as string, line.id)
        : updateCartItem(accessToken as string, line.id, String(packs));
    },
    onSuccess: async (_data, variables) => {
      // Awaited, then released: dropping the local value before the cart has
      // refetched would flash the old quantity for a frame.
      await queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'cart'] });
      setDesired((current) => {
        const next = { ...current };
        delete next[variables.skuId];
        return next;
      });
    },
    onError: (error, variables) => {
      // Put the stepper back where the cart says it is, rather than leaving it
      // showing a quantity the server refused.
      setDesired((current) => {
        const next = { ...current };
        delete next[variables.skuId];
        return next;
      });
      // The server's own words. §23A.8: a refusal explains itself, and a generic
      // "something went wrong" is what makes a user try the same thing again.
      toast.show(
        error instanceof ApiError ? error.message : 'Could not update your cart.',
        'error',
      );
    },
  });

  /**
   * One write per burst of taps.
   *
   * <p>Tapping "+" four times is one decision, and four requests for it would
   * race each other to set the last value. The quantity is absolute rather than
   * an increment, so the final tap is the only one worth sending.
   */
  const queueChange = useCallback((offerId: number, skuId: number, packs: number) => {
    setDesired((current) => ({ ...current, [skuId]: packs }));
    clearTimeout(timers.current[skuId]);
    timers.current[skuId] = setTimeout(
      () => change.mutate({ offerId, skuId, packs }),
      400,
    );
  }, [change]);

  const offers = recommendations.data?.offers ?? [];

  const cartCount = cart?.supplierGroups.reduce((n, g) => n + g.items.length, 0) ?? 0;

  return (
    <MandiScreen
      header={<Header title={product.data?.name} subtitle={product.data?.categoryName} />}
      footer={
        <CartBar
          total={cart?.totalAmount}
          count={cartCount}
          onPress={() => router.push('/restaurant/cart')}
        />
      }
    >
      <View style={styles.intro}>
        <MandiText variant="sectionTitle" color={Colors.textSecondary} accessibilityRole="header">
          COMPARE SUPPLIERS{offers.length ? `  ${offers.length}` : ''}
        </MandiText>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
          <MandiText variant="caption" color={Colors.textTertiary} style={styles.flex}>
            Prices exclude delivery, quoted once a courier is assigned.
          </MandiText>
        </View>
      </View>

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
        offers.map((offer, index) => {
          const line = inCart.get(offer.supplierSkuId);
          return (
            <OfferCard
              key={offer.offerId}
              offer={offer}
              // The server ranks; the first is the recommendation. The client
              // must never re-sort — doing so would quietly substitute its own
              // ranking for the one doc 07 specifies and tests.
              recommended={index === 0}
              quantity={desired[offer.supplierSkuId] ?? (line ? Number(line.quantity) : 0)}
              lineTotal={line?.lineTotal}
              busy={change.isPending && change.variables?.offerId === offer.offerId}
              onQuantity={(packs) =>
                queueChange(offer.offerId, offer.supplierSkuId, packs)}
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
function CartBar({
  total,
  count,
  onPress,
}: {
  total?: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <View style={styles.cartBar}>
      <View style={styles.cartTotals}>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {count === 0 ? 'Cart is empty' : `${count} item${count === 1 ? '' : 's'} in cart`}
        </MandiText>
        {count > 0 && total != null && (
          <MandiText variant="price">{formatMoney(total)}</MandiText>
        )}
      </View>
      <MandiButton
        label="Go to cart"
        variant={count > 0 ? 'primary' : 'secondary'}
        onPress={onPress}
        fullWidth={false}
      />
    </View>
  );
}

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
  intro: { gap: Spacing.xs },
  note: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  flex: { flex: 1 },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cartTotals: { flex: 1, gap: 1 },
});
