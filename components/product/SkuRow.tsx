import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StorefrontSku } from '@/models/discovery';
import { ProductThumb } from './ProductThumb';
import { MandiButton, MandiText } from '@/components/common';
import { formatMoney, formatQuantity } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * One buyable pack, in a list.
 *
 * <p><b>The SKU leads, the supplier follows.</b> What a kitchen is choosing
 * between is the pack — this brand, this size, this price — and the supplier is
 * how it arrives. Leading with the supplier, as the old offer card did, sorted
 * the decision by the less decisive fact.
 *
 * <p><b>Add is a sibling of the tappable area, not inside it.</b> A row that is
 * one big button containing another button is invalid on web and gives a screen
 * reader a control inside a control — the same mistake the bottom sheet's scrim
 * made (D-085). So the picture and the text open the comparison, and Add sits
 * beside them.
 *
 * <p>The price is the supplier's listed pack price, shown as given. Nothing here
 * multiplies, adds GST or computes a total: guardrail 3, and the authoritative
 * figure is the one validation returns at checkout.
 *
 * <p>A rating is shown only when one exists. Most stores have none — the ratings
 * table barely has rows yet — and "0.0 ★" would read as a bad supplier rather
 * than an unrated one (doc 07 §4: never fabricate a metric).
 */
export function SkuRow({
  sku,
  onPress,
  onAdd,
  adding,
  /** Hides the supplier line, for a list that is already one supplier's shelf. */
  hideSupplier,
}: {
  sku: StorefrontSku;
  onPress?: () => void;
  onAdd?: () => void;
  adding?: boolean;
  hideSupplier?: boolean;
}) {
  const unavailable = sku.availability !== 'AVAILABLE';

  const body = (
    <>
      <ProductThumb uri={sku.imageUrl} size={64} radius={Radius.md} />

      <View style={styles.body}>
        <MandiText variant="bodyEmphasis" numberOfLines={2}>{sku.skuName}</MandiText>

        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {[
            sku.brandName,
            `${formatQuantity(sku.packSize)} ${sku.packUnit.toLowerCase()}`,
          ].filter(Boolean).join(' · ')}
        </MandiText>

        {!hideSupplier && (
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {sku.supplierName}
            {sku.distanceKm != null && ` · ${formatQuantity(sku.distanceKm)} km`}
          </MandiText>
        )}

        {/* Rating and opening hours are facts about the store, not the pack. On a
            single supplier's shelf the screen already says both, once, at the top. */}
        {!hideSupplier && (
          <View style={styles.signals}>
            {sku.averageRating != null && (
              <View style={styles.rating}>
                <Ionicons name="star" size={11} color={Colors.warning} />
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {formatQuantity(sku.averageRating)}
                  {sku.ratingCount > 0 ? ` (${sku.ratingCount})` : ''}
                </MandiText>
              </View>
            )}
            {/* A shut shop can still be browsed, and says when it opens rather than
                disappearing — a supplier is not gone at 9pm, they are closed. */}
            {!sku.openNow && (
              <MandiText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
                {sku.opensAt ? `Opens ${sku.opensAt}` : 'Closed now'}
              </MandiText>
            )}
          </View>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${sku.skuName} from ${sku.supplierName}, ${formatMoney(sku.sellingPrice)}. Compare suppliers`}
          style={styles.main}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.main}>{body}</View>
      )}

      <View style={styles.trailing}>
        <MandiText variant="price">{formatMoney(sku.sellingPrice)}</MandiText>
        {onAdd && (
          <MandiButton
            label={unavailable ? 'Out of stock' : 'Add'}
            variant="secondary"
            size="sm"
            disabled={unavailable}
            loading={adding}
            onPress={onAdd}
            fullWidth={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  main: { flex: 1, flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  body: { flex: 1, gap: 2 },
  signals: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trailing: { alignItems: 'flex-end', gap: Spacing.xs },
});
