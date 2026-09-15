import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Product } from '@/models/catalog';
import { categoryFace } from '@/models/categories';
import { MandiText } from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

/**
 * A product in a list. §23A.11.
 *
 * <p>The price is labelled **"from"** and is never the price that will be
 * charged. Doc 05 §6: "do not show stale price as authoritative checkout price".
 * This is the lowest catalog price at search time; the binding figure comes back
 * from validation at checkout.
 *
 * <p>A product nobody stocks says so. An absent price is a real signal (doc 07
 * §4) — "₹0" would be a lie and a blank space would look like a loading bug.
 */
export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const offers = product.offerCount ?? 0;
  const stocked = offers > 0 && product.lowestPrice != null;
  const face = categoryFace(product.categoryName);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        stocked
          ? `${product.name}, from ${formatMoney(product.lowestPrice, true)}, ${offers} suppliers`
          : `${product.name}, not stocked`
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.thumb, { backgroundColor: face.background }]}>
        <Ionicons name={face.icon} size={26} color={face.tint} />
      </View>

      <View style={styles.body}>
        <MandiText variant="bodyEmphasis" numberOfLines={2}>{product.name}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {[product.categoryName, product.baseUnit && `per ${product.baseUnit}`]
            .filter(Boolean)
            .join(' · ')}
        </MandiText>
        {stocked ? (
          <View style={styles.supplierRow}>
            <Ionicons name="storefront-outline" size={13} color={Colors.textTertiary} />
            <MandiText variant="caption" color={Colors.textTertiary}>
              {offers} supplier{offers === 1 ? '' : 's'}
            </MandiText>
          </View>
        ) : (
          <MandiText variant="caption" color={Colors.textTertiary}>
            No supplier stocking this
          </MandiText>
        )}
      </View>

      {stocked && (
        <View style={styles.price}>
          <MandiText variant="caption" color={Colors.textSecondary}>from</MandiText>
          <MandiText variant="price">{formatMoney(product.lowestPrice, true)}</MandiText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    ...Elevation.card,
  },
  pressed: { opacity: 0.75 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: Spacing.xs },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  price: { alignItems: 'flex-end' },
});
