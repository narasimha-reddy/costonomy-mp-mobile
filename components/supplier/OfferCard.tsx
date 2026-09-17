import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecommendedOffer } from '@/models/discovery';
import {
  MandiBadge,
  MandiButton,
  MandiCard,
  MandiQuantityStepper,
  MandiText,
} from '@/components/common';
import { ProductThumb } from '@/components/product/ProductThumb';
import { formatMoney, formatQuantity } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * One supplier's pack, as compared on REST-SUP-01. Doc 05 §8.
 *
 * <p><b>The pack leads, the supplier follows.</b> What is being chosen between is
 * this pack — this brand, this size, this price — and the supplier is how it
 * arrives. The card opens with the picture, the name and the pack, and carries
 * the seller beneath with the three facts that separate two of them: how well
 * rated, how far, how soon.
 *
 * <p><b>Quantity is counted in packs, and lives here rather than on the product.</b>
 * The product screen used to own one quantity for every supplier, in the
 * product's base unit — so asking for 25 kg of rice from a supplier who sells
 * 25 kg sacks ordered twenty-five sacks. A pack is a thing you can count; a kilo
 * is not, when what is on the shelf is a sack.
 *
 * <p><b>Nothing here multiplies.</b> The pack price and the per-unit price both
 * arrive from the server (guardrail 3); the line total appears in the cart, where
 * the server computed it. A card doing its own arithmetic is how a screen comes
 * to disagree with the order it produces.
 *
 * <p>The ranking is the order of the list. There are no reason chips: three
 * badges under every card explained the sort at the cost of the thing being
 * sorted, and the recommended one keeps an accent edge instead.
 */
export function OfferCard({
  offer,
  recommended,
  quantity,
  onQuantity,
  onAdd,
  adding,
}: {
  offer: RecommendedOffer;
  recommended?: boolean;
  quantity: number;
  onQuantity: (next: number) => void;
  onAdd: () => void;
  adding?: boolean;
}) {
  const unavailable = offer.availability !== 'AVAILABLE';

  return (
    <MandiCard outlined={recommended} accentColor={recommended ? Colors.primary : undefined}>
      <View style={styles.identity}>
        <ProductThumb uri={offer.imageUrl} size={56} radius={Radius.md} />

        <View style={styles.names}>
          <MandiText variant="bodyEmphasis" numberOfLines={2}>{offer.skuName}</MandiText>
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {[offer.brandName, `${formatQuantity(offer.packSize)} ${offer.packUnit.toLowerCase()}`]
              .filter(Boolean)
              .join(' · ')}
          </MandiText>
        </View>

        <View style={styles.pricing}>
          <MandiText variant="price">{formatMoney(offer.unitPrice)}</MandiText>
          {offer.pricePerBaseUnit != null && (
            <MandiText variant="caption" color={Colors.textSecondary}>
              {formatMoney(offer.pricePerBaseUnit)}/{offer.packUnit.toLowerCase()}
            </MandiText>
          )}
        </View>
      </View>

      <View style={styles.supplier}>
        <MandiText
          variant="caption"
          color={Colors.textSecondary}
          numberOfLines={1}
          style={styles.flex}
        >
          {offer.supplierName}
        </MandiText>

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
      <View style={styles.logistics}>
        {offer.distanceKm != null && (
          <Fact icon="navigate-outline" text={`${formatQuantity(offer.distanceKm)} km away`} />
        )}
        {offer.etaMinutes != null && (
          <Fact icon="time-outline" text={`~${offer.etaMinutes} min`} />
        )}
      </View>

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
          min={1}
          unit={quantity === 1 ? 'pack' : 'packs'}
        />
        <MandiButton
          label={unavailable ? 'Unavailable' : 'Add'}
          onPress={onAdd}
          disabled={unavailable}
          loading={adding}
          variant={recommended ? 'primary' : 'secondary'}
          style={styles.add}
        />
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  names: { flex: 1, gap: 2 },
  pricing: { alignItems: 'flex-end' },
  supplier: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flexShrink: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  logistics: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  add: { flex: 1 },
});
