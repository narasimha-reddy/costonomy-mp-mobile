import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecommendedOffer } from '@/models/discovery';
import { MandiBadge, MandiCard, MandiQuantityStepper, MandiText } from '@/components/common';
import { ProductThumb } from '@/components/product/ProductThumb';
import { placeLabel } from '@/utils/placeName';
import { formatMoney, formatQuantity } from '@/utils/money';
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
  lineTotal,
  busy,
}: {
  offer: RecommendedOffer;
  /** Drawn with an accent edge; the reason is the order, not a label. */
  recommended?: boolean;
  /** Packs currently in the cart from this supplier. Zero means none. */
  quantity: number;
  onQuantity: (next: number) => void;
  /** The server's total for this line, present only once something is in it. */
  lineTotal?: string | null;
  busy?: boolean;
}) {
  const unavailable = offer.availability !== 'AVAILABLE';
  const branch = placeLabel(offer.storeName, offer.supplierName) ?? offer.storeName;

  return (
    <MandiCard outlined={recommended} accentColor={recommended ? Colors.primary : undefined}>
      {/* What you are buying. */}
      <View style={styles.sku}>
        <ProductThumb uri={offer.imageUrl} size={56} radius={Radius.md} />

        <View style={styles.names}>
          <MandiText variant="bodyEmphasis" numberOfLines={2}>{offer.skuName}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {[
              offer.brandName,
              `${formatQuantity(offer.packSize)} ${offer.packUnit.toLowerCase()}`,
              offer.pricePerBaseUnit != null
                ? `${formatMoney(offer.pricePerBaseUnit)}/${offer.packUnit.toLowerCase()}`
                : null,
            ].filter(Boolean).join(' · ')}
          </MandiText>
        </View>

        <MandiText variant="price">{formatMoney(offer.unitPrice)}</MandiText>
      </View>

      {/* Who you are buying it from. */}
      <View style={styles.supplier}>
        <View style={styles.identity}>
          <MandiText variant="captionEmphasis" numberOfLines={1}>{branch}</MandiText>
          {branch !== offer.supplierName && (
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {offer.supplierName}
            </MandiText>
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
          // Said rather than left blank: an empty space where a score goes reads
          // as a bad score, not as nobody having rated them yet (doc 07 §4).
          <MandiText variant="caption" color={Colors.textTertiary}>Not yet rated</MandiText>
        )}
      </View>

      {/* How far and how soon, together — they answer one question. */}
      {(offer.distanceKm != null || offer.etaMinutes != null) && (
        <View style={styles.logistics}>
          {offer.distanceKm != null && (
            <Fact icon="navigate-outline" text={`${formatQuantity(offer.distanceKm)} km away`} />
          )}
          {offer.etaMinutes != null && (
            <Fact icon="time-outline" text={`~${offer.etaMinutes} min`} />
          )}
        </View>
      )}

      {unavailable ? (
        <MandiBadge
          label="Out of stock"
          color={Colors.danger}
          backgroundColor={Colors.dangerLight}
        />
      ) : offer.availableQuantity != null && !offer.coversFullQuantity ? (
        <MandiBadge
          label={`Only ${formatQuantity(offer.availableQuantity)} available`}
          icon="alert-circle-outline"
          color={Colors.warning}
          backgroundColor={Colors.warningLight}
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
    </MandiCard>
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

const styles = StyleSheet.create({
  sku: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  names: { flex: 1, gap: 2 },
  supplier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
  },
  identity: { flex: 1, gap: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  logistics: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  line: { alignItems: 'flex-end' },
});
