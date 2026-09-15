import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Product } from '@/models/catalog';
import { MandiCard, MandiText } from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * A product in a list. §23A.11.
 *
 * <p>The price is labelled **"from"** and never presented as the price that will
 * be charged. Doc 05 §6 is explicit: "do not show stale price as authoritative
 * checkout price". This figure is the lowest catalog price at the time of the
 * search; the binding one comes back from validation at checkout.
 *
 * <p>A product with no offers says so rather than showing a blank or a zero — an
 * absent price is a real signal (doc 07 §4) and "₹0" is a lie.
 */
export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const offers = product.offerCount ?? 0;

  return (
    <MandiCard onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.text}>
          <MandiText variant="bodyEmphasis" numberOfLines={2}>{product.name}</MandiText>
          {product.categoryName && (
            <MandiText variant="caption" color={Colors.textSecondary}>
              {product.categoryName}
            </MandiText>
          )}
        </View>
        <View style={styles.price}>
          {offers === 0 || product.lowestPrice == null ? (
            <MandiText variant="caption" color={Colors.textTertiary}>Not stocked</MandiText>
          ) : (
            <>
              <MandiText variant="caption" color={Colors.textSecondary}>from</MandiText>
              <MandiText variant="price">{formatMoney(product.lowestPrice, true)}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {offers} supplier{offers === 1 ? '' : 's'}
              </MandiText>
            </>
          )}
        </View>
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  text: { flex: 1, gap: Spacing.xs },
  price: { alignItems: 'flex-end' },
});
