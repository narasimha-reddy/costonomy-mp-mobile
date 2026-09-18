import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { useRequestBasket } from '@/hooks/useRequestBasket';
import { fetchProduct, fetchRecommendations } from '@/services/catalog';
import { addIntentItem, removeIntentItem, updateIntentItem } from '@/services/intent';
import type { IntentItem } from '@/models/intent';
import { draftsKey } from '@/lib/queryKeys';
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();
  const { drafts } = useRequestBasket();

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
   * Request lines by SKU.
   *
   * <p>The SKU is the join, and now it is also what the line stores: a request
   * carries no offer and no price, because what a thing costs is the supplier's
   * answer rather than something the basket can know.
   */
  const inCart = useMemo(() => {
    const map = new Map<number, IntentItem>();
    drafts.forEach((draft) =>
      draft.items.forEach((item) => map.set(item.supplierSkuId, item)));
    return map;
  }, [drafts]);

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
    mutationFn: async ({ skuId, packs }: {
      offerId: number;
      skuId: number;
      packs: number;
    }) => {
      const line = inCart.get(skuId);
      if (line == null) {
        // The SKU decides which supplier, and therefore which request this
        // lands on. Packs, because that is what is being asked for.
        return addIntentItem(accessToken as string, outletId as number, {
          supplierSkuId: skuId,
          quantity: String(packs),
        });
      }
      // Zero is not a quantity; it is the absence of the line.
      return packs <= 0
        ? removeIntentItem(accessToken as string, line.id)
        : updateIntentItem(accessToken as string, line.id, String(packs));
    },
    onSuccess: async (_data, variables) => {
      // Awaited, then released: dropping the local value before the cart has
      // refetched would flash the old quantity for a frame.
      await queryClient.invalidateQueries({ queryKey: draftsKey(outletId) });
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

  const cartCount = drafts.reduce((n, draft) => n + draft.items.length, 0);

  return (
    <MandiScreen
      header={<Header title={product.data?.name} subtitle={product.data?.categoryName} />}
      footer={
        <CartBar
          count={cartCount}
          supplierCount={drafts.length}
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
              quantity={desired[offer.supplierSkuId] ?? (line ? Number(line.requestedQuantity) : 0)}
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
/**
 * What is waiting to be sent, and the way to it.
 *
 * <p><b>No total, deliberately.</b> This bar used to carry the cart's value, and
 * there is no equivalent here: a request holds no prices, so any figure would be
 * one the app invented. What it says instead is how many suppliers are about to
 * be asked, which is the thing that actually surprises people — three items can
 * be three separate conversations.
 */
function CartBar({
  count,
  supplierCount,
  onPress,
}: {
  count: number;
  supplierCount: number;
  onPress: () => void;
}) {
  return (
    <View style={styles.cartBar}>
      <View style={styles.cartTotals}>
        <MandiText variant="caption" color={Colors.textSecondary}>
          {count === 0
            ? 'Nothing added yet'
            : `${count} item${count === 1 ? '' : 's'} · ${supplierCount} supplier${supplierCount === 1 ? '' : 's'}`}
        </MandiText>
        {count > 0 && (
          <MandiText variant="caption" color={Colors.textTertiary}>
            Prices come with their reply
          </MandiText>
        )}
      </View>
      <MandiButton
        label="Review requests"
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
