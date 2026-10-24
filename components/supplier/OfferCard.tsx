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
  quantityForSku,
  lineTotalForSku,
  onSelectSku,
}: {
  offer: RecommendedOffer;
  /** Drawn with an accent edge; the reason is the order, not a label. */
  recommended?: boolean;
  /** Packs currently in the cart from this supplier. Zero means none. */
  quantity: number;
  onQuantity: (next: number, selectedSkuId?: number, selectedOfferId?: number) => void;
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
  onOpenSku?: (supplierSkuId?: number) => void;
  /** Open one of this supplier's other packs. */
  onOpenPack?: (supplierSkuId: number) => void;
  /** The server's total for this line, present only once something is in it. */
  lineTotal?: string | null;
  busy?: boolean;
  quantityForSku?: (skuId: number) => number;
  lineTotalForSku?: (skuId: number) => string | null | undefined;
  onSelectSku?: (skuId: number, offerId: number) => void;
}) {
  const [showingPacks, setShowingPacks] = useState(false);
  const brandOptions = offer.brandOptions ?? [];
  const hasMultiBrand = brandOptions.length > 1;
  const [selectedSkuId, setSelectedSkuId] = useState<number>(offer.supplierSkuId);

  const activeOption = brandOptions.find((opt) => opt.supplierSkuId === selectedSkuId) ?? null;
  const activeSkuName = activeOption?.skuName ?? offer.skuName;
  const activeBrandName = activeOption?.brandName ?? offer.brandName;
  const activeGrade = activeOption?.grade ?? offer.grade;
  const activePackSize = activeOption?.packSize ?? offer.packSize;
  const activePackUnit = activeOption?.packUnit ?? offer.packUnit;
  const activeUnitPriceInclusiveGst = activeOption?.unitPriceInclusiveGst ?? offer.unitPriceInclusiveGst;
  const activeSellingPrice = activeOption?.sellingPrice ?? offer.unitPrice;
  const activeMrp = activeOption?.mrp ?? offer.mrp;
  const activeDiscountPercent = activeOption?.discountPercent ?? offer.discountPercent;
  const activeGstRate = activeOption?.gstRate ?? offer.gstRate;
  const activeImageUrl = activeOption?.imageUrl ?? offer.imageUrl;
  const activeAvailability = activeOption?.availability ?? offer.availability;
  const activeAvailableQuantity = activeOption?.availableQuantity ?? offer.availableQuantity;
  const activeSkuId = activeOption?.supplierSkuId ?? offer.supplierSkuId;
  const activeOfferId = activeOption?.offerId ?? offer.offerId;

  const currentQuantity = quantityForSku ? quantityForSku(activeSkuId) : quantity;
  const currentLineTotal = lineTotalForSku ? lineTotalForSku(activeSkuId) : lineTotal;

  const unavailable = activeAvailability !== 'AVAILABLE';
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
  const perUnit = Number(activePackSize) === 1 ? null : (activeOption ? null : offer.pricePerBaseUnit);

  return (
    <MandiCard outlined={recommended} accentColor={recommended ? Colors.primary : undefined}>
      {/* What you are buying. */}
      <Pressable
        onPress={() => onOpenSku?.(activeSkuId)}
        disabled={onOpenSku == null}
        accessibilityRole={onOpenSku == null ? undefined : 'button'}
        accessibilityLabel={onOpenSku == null ? undefined : `About ${activeSkuName}`}
        style={({ pressed }) => [styles.sku, pressed && styles.skuPressed]}
      >
        <ProductThumb uri={activeImageUrl} size={56} radius={Radius.md} />

        <View style={styles.names}>
          <View style={styles.titleRow}>
            <MandiText variant="bodyEmphasis" numberOfLines={2} style={styles.flexShrink}>{activeSkuName}</MandiText>
            {activeGrade ? (
              <View style={styles.gradeBadge}>
                <MandiText variant="caption" style={styles.gradeBadgeText}>{activeGrade}</MandiText>
              </View>
            ) : null}
          </View>
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {[
              activeBrandName,
              `${formatQuantity(activePackSize)} ${activePackUnit.toLowerCase()}`,
              perUnit != null ? `${formatMoney(perUnit)}/${activePackUnit.toLowerCase()}` : null,
            ].filter(Boolean).join(' · ')}
          </MandiText>
        </View>

        {/* What you pay for one pack, tax and all. Strikethrough MRP and discount badge when available. */}
        <View style={styles.pricing}>
          {activeMrp != null && Number(activeMrp) > Number(activeUnitPriceInclusiveGst) && (
            <MandiText variant="caption" style={styles.mrpStrikethrough}>
              {formatMoney(activeMrp)}
            </MandiText>
          )}
          <MandiText variant="price">{formatMoney(activeUnitPriceInclusiveGst)}</MandiText>
          {activeDiscountPercent != null && activeDiscountPercent > 0 && (
            <View style={styles.discountBadge}>
              <MandiText variant="caption" style={styles.discountBadgeText}>
                {activeDiscountPercent}% OFF
              </MandiText>
            </View>
          )}
          <MandiText variant="caption" color={Colors.textTertiary}>
            Inc. {formatGstRate(activeGstRate)} GST
          </MandiText>
        </View>
      </Pressable>

      {/* Brand Options: When an item is fulfilled by multiple brands, display all options
          with lowest priced one first (doc / user requirement). */}
      {hasMultiBrand && (
        <View style={styles.brandOptionsSection}>
          <View style={styles.brandOptionsHeader}>
            <Ionicons name="pricetags-outline" size={12} color={Colors.primary} />
            <MandiText variant="captionEmphasis" color={Colors.textPrimary}>
              Brand Options
            </MandiText>
            <MandiText variant="caption" color={Colors.textTertiary}>
              (Lowest price first)
            </MandiText>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.brandOptionsRail}
          >
            {brandOptions.map((opt, idx) => {
              const isSelected = opt.supplierSkuId === activeSkuId;
              const isLowest = idx === 0;
              const priceDisplay = opt.unitPriceInclusiveGst != null
                ? formatMoney(opt.unitPriceInclusiveGst)
                : formatMoney(opt.sellingPrice);

              return (
                <Pressable
                  key={opt.supplierSkuId}
                  onPress={() => {
                    setSelectedSkuId(opt.supplierSkuId);
                    onSelectSku?.(opt.supplierSkuId, opt.offerId ?? offer.offerId);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${opt.brandName || opt.skuName}, ${priceDisplay}${isLowest ? ', lowest price' : ''}`}
                  style={({ pressed }) => [
                    styles.brandChip,
                    isSelected && styles.brandChipSelected,
                    pressed && styles.skuPressed,
                  ]}
                >
                  <View style={styles.brandChipTop}>
                    <MandiText
                      variant="captionEmphasis"
                      color={isSelected ? Colors.primary : Colors.textPrimary}
                      numberOfLines={1}
                    >
                      {opt.brandName || opt.skuName}
                    </MandiText>
                    {isLowest && (
                      <View style={styles.lowestBadge}>
                        <MandiText variant="caption" style={styles.lowestBadgeText}>
                          Lowest
                        </MandiText>
                      </View>
                    )}
                    {opt.grade ? (
                      <View style={styles.gradeBadge}>
                        <MandiText variant="caption" style={styles.gradeBadgeText}>
                          {opt.grade}
                        </MandiText>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.brandChipBottom}>
                    <MandiText
                      variant="caption"
                      color={isSelected ? Colors.primary : Colors.textSecondary}
                    >
                      {formatQuantity(opt.packSize)} {opt.packUnit.toLowerCase()}
                    </MandiText>
                    <View style={styles.brandChipPricing}>
                      {opt.mrp != null && Number(opt.mrp) > Number(opt.sellingPrice) && (
                        <MandiText variant="caption" style={styles.chipMrpStrikethrough}>
                          {formatMoney(opt.mrp)}
                        </MandiText>
                      )}
                      <MandiText
                        variant="captionEmphasis"
                        color={isSelected ? Colors.primaryDark : Colors.textPrimary}
                      >
                        {priceDisplay}
                      </MandiText>
                      {opt.discountPercent != null && opt.discountPercent > 0 && (
                        <View style={styles.chipDiscountBadge}>
                          <MandiText variant="caption" style={styles.chipDiscountText}>
                            {opt.discountPercent}% OFF
                          </MandiText>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

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
      ) : activeAvailableQuantity != null && !offer.coversFullQuantity ? (
        <MandiBadge
          label={`Only ${formatQuantity(activeAvailableQuantity)} available`}
          icon="alert-circle-outline"
          color={Colors.warning}
          backgroundColor={Colors.warningLight}
          style={styles.notice}
        />
      ) : null}

      <View style={styles.actions}>
        <MandiQuantityStepper
          value={currentQuantity}
          onChange={(next) => onQuantity(next, activeSkuId, activeOfferId)}
          min={0}
          disabled={unavailable || busy}
          unit={currentQuantity === 1 ? 'pack' : 'packs'}
          itemLabel={`${activeSkuName} from ${offer.supplierName}`}
        />
        {currentQuantity > 0 && currentLineTotal != null && (
          <View style={styles.line}>
            <MandiText variant="caption" color={Colors.textSecondary}>In cart</MandiText>
            <MandiText variant="bodyEmphasis">{formatMoney(currentLineTotal)}</MandiText>
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
  brandOptionsSection: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  brandOptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  brandOptionsRail: {
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  brandChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 2,
    minWidth: 100,
  },
  brandChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#E8F5E9',
  },
  brandChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  brandChipBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  lowestBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#4CAF50',
  },
  lowestBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2E7D32',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: GAP,
  },
  line: { alignItems: 'flex-end', gap: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  gradeBadge: {
    backgroundColor: '#EDE7F6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1C4E9',
  },
  gradeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#5E35B1',
  },
  mrpStrikethrough: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
    fontSize: 11,
  },
  discountBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFE0B2',
  },
  discountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E65100',
  },
  brandChipPricing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chipMrpStrikethrough: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
    fontSize: 9,
  },
  chipDiscountBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderRadius: 2,
  },
  chipDiscountText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#E65100',
  },
});
