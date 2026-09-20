import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecommendedOffer } from '@/models/discovery';
import { useQuery } from '@tanstack/react-query';
import {
  MandiBadge,
  MandiCard,
  MandiQuantityStepper,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchSkuDetail } from '@/services/catalog';
import { ProductThumb } from '@/components/product/ProductThumb';
import { placeLabel } from '@/utils/placeName';
import { formatGstRate, formatMoney, formatQuantity } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * One supplier's pack, as compared on REST-SUP-01. Doc 05 §8.
 *
 * <p>Two bands, because the card answers two questions and they were being read
 * as one. Above: <b>what you are buying</b> — the picture, the SKU, its brand and
 * pack and what a unit of it costs, then the pack price. Below, on its own tinted
 * panel: <b>who you are buying it from</b> — the store under its business, its
 * rating, how far it is and how soon it can be there.
 *
 * <p><b>The stepper is the only control, and it starts at zero.</b> A separate Add
 * meant choosing a number and then confirming it, which is two decisions for one
 * intention; here the first tap puts one pack in the cart and every later tap
 * changes it, down to zero, which takes it out. The line total appears beside it
 * once there is one.
 *
 * <p><b>That total comes from the cart, not from this card.</b> Nothing here
 * multiplies a price by a quantity — guardrail 3 — so the figure shown is the one
 * the server computed for the line that actually exists, and the screen cannot
 * come to disagree with the order it produces.
 */
export function OfferCard({
  offer,
  recommended,
  quantity,
  onQuantity,
  onOpenSupplier,
  onOpenSku,
  onOpenPack,
  lineTotal,
  busy,
}: {
  offer: RecommendedOffer;
  /** Drawn with an accent edge; the reason is the order, not a label. */
  recommended?: boolean;
  /** Packs currently in the cart from this supplier. Zero means none. */
  quantity: number;
  onQuantity: (next: number) => void;
  /**
   * Open this supplier's shelf.
   *
   * <p>Only the seller panel is the target, never the whole card: the card's
   * one control is the stepper, and a tappable card wrapping it would put a
   * button inside a button and take somebody to another screen when they meant
   * to add a pack.
   */
  onOpenSupplier?: () => void;
  /** Open this pack's own page — what it is, not just what it costs. D-096. */
  onOpenSku?: () => void;
  /** Open one of this supplier's other packs. */
  onOpenPack?: (supplierSkuId: number) => void;
  /** The server's total for this line, present only once something is in it. */
  lineTotal?: string | null;
  busy?: boolean;
}) {
  const [showingPacks, setShowingPacks] = useState(false);
  const unavailable = offer.availability !== 'AVAILABLE';
  /**
   * The branch is named in full, and where it is goes beside the business.
   *
   * <p>The title used to be the locality alone — "Koramangala" — which is the
   * part that tells two branches of one supplier apart but is not what the
   * store is called. A store named for something other than its area ("Main
   * Warehouse") lost its name entirely.
   *
   * <p>`placeLabel` still earns its keep here: it is how the locality is
   * recovered from a name of the form "<business> <place>". When there is no
   * prefix to strip there is no separate locality to show, and the second line
   * is the business on its own.
   */
  const locality = placeLabel(offer.storeName, offer.supplierName);
  const place = locality === offer.storeName ? null : locality;
  // On a one-unit pack the price per unit *is* the pack price, and printing both
  // says the same number twice. It earns its place on a 25 kg sack.
  const perUnit = Number(offer.packSize) === 1 ? null : offer.pricePerBaseUnit;

  return (
    <MandiCard outlined={recommended} accentColor={recommended ? Colors.primary : undefined}>
      {/* What you are buying. */}
      <Pressable
        onPress={onOpenSku}
        disabled={onOpenSku == null}
        accessibilityRole={onOpenSku == null ? undefined : 'button'}
        accessibilityLabel={onOpenSku == null ? undefined : `About ${offer.skuName}`}
        style={({ pressed }) => [styles.sku, pressed && styles.skuPressed]}
      >
        <ProductThumb uri={offer.imageUrl} size={56} radius={Radius.md} />

        <View style={styles.names}>
          <MandiText variant="bodyEmphasis" numberOfLines={2}>{offer.skuName}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {[
              offer.brandName,
              `${formatQuantity(offer.packSize)} ${offer.packUnit.toLowerCase()}`,
              perUnit != null ? `${formatMoney(perUnit)}/${offer.packUnit.toLowerCase()}` : null,
            ].filter(Boolean).join(' · ')}
          </MandiText>
        </View>

        {/* What you pay for one pack, tax and all. The rate is named beneath it
            rather than left to be inferred — a price that quietly includes tax is
            indistinguishable from one that quietly excludes it. */}
        <View style={styles.pricing}>
          <MandiText variant="price">{formatMoney(offer.unitPriceInclusiveGst)}</MandiText>
          <MandiText variant="caption" color={Colors.textTertiary}>
            Inc. {formatGstRate(offer.gstRate)} GST
          </MandiText>
        </View>
      </Pressable>

      {/* Who you are buying it from — name, standing, and reach, in one panel.
          Distance and ETA sit inside it because they are facts about the seller;
          floating below they read as a third thing the card is telling you. */}
      <Pressable
        onPress={onOpenSupplier}
        disabled={onOpenSupplier == null}
        accessibilityRole={onOpenSupplier == null ? undefined : 'button'}
        accessibilityLabel={
          onOpenSupplier == null ? undefined : `See everything ${offer.storeName} sells`
        }
        style={({ pressed }) => [styles.supplier, pressed && styles.supplierPressed]}
      >
        <View style={styles.supplierTop}>
          <View style={styles.identity}>
            <View style={styles.branchRow}>
              <MandiText variant="captionEmphasis" numberOfLines={1} style={styles.flexShrink}>
                {offer.storeName}
              </MandiText>
              {/* The chevron is what says this panel goes somewhere. Without it
                  the only way to find out is to tap and see. */}
              {onOpenSupplier != null && (
                <Ionicons name="chevron-forward" size={12} color={Colors.textTertiary} />
              )}
            </View>
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {[offer.supplierName, place].filter(Boolean).join(' · ')}
            </MandiText>
          </View>
        </View>

        {/* Rating, distance and wait on one line: all three are facts about
            this seller rather than about the pack, and the rating floating
            opposite the name read as part of the title. */}
        <View style={styles.logistics}>
          {/* Reach on the left, standing on the right.
              <p>The rating is pushed to the edge by the left group taking the
              slack rather than by `space-between`, which would strand it in the
              middle of the row on a card that has neither a distance nor an
              ETA to show. */}
          <View style={styles.reach}>
            {offer.distanceKm != null && (
              <Fact icon="navigate-outline" text={`${formatQuantity(offer.distanceKm)} km away`} />
            )}
            {offer.etaMinutes != null && (
              <Fact icon="time-outline" text={`${offer.etaMinutes} min`} />
            )}
          </View>

          {offer.averageRating != null ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={12} color={Colors.warning} />
              <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
                {formatQuantity(offer.averageRating)}
              </MandiText>
              {offer.ratingCount > 0 && (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  ({offer.ratingCount})
                </MandiText>
              )}
            </View>
          ) : (
            // Said rather than left blank: an empty space where a score goes
            // reads as a bad score, not as nobody having rated them yet.
            <MandiText variant="caption" color={Colors.textTertiary}>Not yet rated</MandiText>
          )}
        </View>
      </Pressable>

      {unavailable ? (
        <MandiBadge
          label="Out of stock"
          color={Colors.danger}
          backgroundColor={Colors.dangerLight}
          style={styles.notice}
        />
      ) : offer.availableQuantity != null && !offer.coversFullQuantity ? (
        <MandiBadge
          label={`Only ${formatQuantity(offer.availableQuantity)} available`}
          icon="alert-circle-outline"
          color={Colors.warning}
          backgroundColor={Colors.warningLight}
          style={styles.notice}
        />
      ) : null}

      <View style={styles.actions}>
        <MandiQuantityStepper
          value={quantity}
          onChange={onQuantity}
          min={0}
          disabled={unavailable || busy}
          unit={quantity === 1 ? 'pack' : 'packs'}
          itemLabel={`${offer.skuName} from ${offer.supplierName}`}
        />
        {quantity > 0 && lineTotal != null && (
          <View style={styles.line}>
            <MandiText variant="caption" color={Colors.textSecondary}>In cart</MandiText>
            <MandiText variant="bodyEmphasis">{formatMoney(lineTotal)}</MandiText>
          </View>
        )}
      </View>

      {/* What else this supplier has of the same thing. D-096.
          <p>In the footer rather than under the pack, because it is about the
          rest of their range rather than about the thing this card is offering
          — up there it read as a note on the price. Opening it shows them here,
          under the card they belong to, instead of taking the reader to another
          screen to find out what the number meant. */}
      {offer.otherPackCount > 0 && (
        <Pressable
          onPress={() => setShowingPacks((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showingPacks }}
          accessibilityLabel={
            `${offer.otherPackCount} other pack size${offer.otherPackCount === 1 ? '' : 's'} `
            + `from this supplier. ${showingPacks ? 'Hide' : 'Show'}`
          }
          style={({ pressed }) => [styles.otherPacks, pressed && styles.skuPressed]}
        >
          <Ionicons name="layers-outline" size={14} color={Colors.primary} />
          <MandiText variant="caption" color={Colors.primary} style={styles.flex}>
            {offer.otherPackCount === 1
              ? '1 other pack size'
              : `${offer.otherPackCount} other pack sizes`}
          </MandiText>
          <Ionicons
            name={showingPacks ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.primary}
          />
        </Pressable>
      )}

      {showingPacks && (
        <OtherPacks supplierSkuId={offer.supplierSkuId} onOpenSku={onOpenPack} />
      )}
    </MandiCard>
  );
}

/**
 * This supplier's other packs of the same product, in a rail. D-096.
 *
 * <p>Fetched when opened, not with the comparison: a list ranking six suppliers
 * has no business carrying six suppliers' whole ranges, and most readers never
 * open one of these.
 *
 * <p>Read-only on purpose. A pack has a page with its description, its
 * measurements and what other kitchens made of it, and choosing between a 200 g
 * tub and a 5 kg block is a decision worth that page rather than a stepper on a
 * rail.
 */
function OtherPacks({ supplierSkuId, onOpenSku }: {
  supplierSkuId: number;
  onOpenSku?: (supplierSkuId: number) => void;
}) {
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: ['sku', supplierSkuId, outletId],
    queryFn: () => fetchSkuDetail(accessToken as string, supplierSkuId, outletId ?? undefined),
    enabled: accessToken != null,
  });

  if (query.isPending) {
    return <MandiSkeletonList count={1} />;
  }

  const packs = query.data?.otherPacks ?? [];
  if (packs.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.packRail}
    >
      {packs.map((pack) => {
        const out = pack.availability !== 'AVAILABLE';
        return (
          <Pressable
            key={pack.supplierSkuId}
            onPress={() => onOpenSku?.(pack.supplierSkuId)}
            disabled={onOpenSku == null}
            accessibilityRole="button"
            accessibilityLabel={
              `${pack.skuName}, ${formatQuantity(pack.packSize)} ${pack.packUnit}`
              + (out ? ', out of stock' : '')
            }
            style={({ pressed }) => [
              styles.pack,
              out && styles.packOut,
              pressed && styles.skuPressed,
            ]}
          >
            {/* No picture. Every pack of one product looks the same, so the
                thumbnail was the largest thing on the card and the least
                informative — and where a supplier has not photographed their
                pack it was a basket glyph taking half the tile. What tells
                these apart is the brand, the size and the price. */}
            <View style={styles.packHead}>
              <MandiText variant="captionEmphasis" numberOfLines={2} style={styles.flex}>
                {pack.skuName}
              </MandiText>
              <Ionicons name="chevron-forward" size={12} color={Colors.textTertiary} />
            </View>

            <MandiText variant="caption" color={Colors.textSecondary}>
              {formatQuantity(pack.packSize)} {pack.packUnit}
            </MandiText>

            <View style={styles.packFoot}>
              {pack.sellingPrice != null && (
                <MandiText variant="price">{formatMoney(pack.sellingPrice)}</MandiText>
              )}
              {out && (
                <MandiText variant="caption" color={Colors.warning}>Out of stock</MandiText>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={13} color={Colors.textTertiary} />
      <MandiText variant="caption" color={Colors.textSecondary}>{text}</MandiText>
    </View>
  );
}

/**
 * The card's own vertical rhythm.
 *
 * <p>`MandiCard` sets padding and no gap, so spacing between the bands is this
 * component's to state. Stated once here rather than as margins on each block:
 * the three bands are one rhythm, and a margin per block is how it drifts.
 */
const GAP = Spacing.md;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  supplierPressed: { opacity: 0.7 },
  skuPressed: { opacity: 0.7 },
  otherPacks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  packRail: { gap: Spacing.sm, paddingTop: Spacing.sm },
  pack: {
    width: 140,
    gap: 2,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  packHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  // The price sits at the foot with air above it, so two tiles read as two
  // prices to compare rather than two paragraphs.
  packFoot: { marginTop: Spacing.xs },
  packOut: { opacity: 0.55 },
  sku: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  names: { flex: 1, gap: 2 },
  pricing: { alignItems: 'flex-end', gap: 1 },

  supplier: {
    gap: Spacing.sm,
    marginTop: GAP,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
  },
  supplierTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  identity: { flex: 1, gap: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  logistics: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  // Takes the slack so the rating lands on the right edge, and wraps rather
  // than truncating — two short facts on a narrow phone become two lines, not
  // one fact nobody gets to read.
  reach: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: Spacing.xs,
    columnGap: Spacing.lg,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },

  notice: { marginTop: GAP, alignSelf: 'flex-start' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: GAP,
  },
  line: { alignItems: 'flex-end', gap: 1 },
});
