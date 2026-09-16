import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SupplierSearchResult } from '@/models/discovery';
import { MandiText } from '@/components/common';
import { placeLabel } from '@/utils/placeName';
import { formatQuantity } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * One supplier, in a list.
 *
 * <p>Every supplier here already delivers to this outlet — that is what puts them
 * in the list — so the row answers the next questions instead: how far, how well
 * rated, how much do they stock, and are they open now.
 *
 * <p>There is no logo. Suppliers have not uploaded any, and a generated initial
 * on a coloured circle is decoration standing where a fact should be; the
 * storefront glyph says "supplier" without pretending to identify one.
 */
export function SupplierRow({
  supplier,
  onPress,
}: {
  supplier: SupplierSearchResult;
  onPress: () => void;
}) {
  // The store under its business, same rule as the two headers: "Metro Fresh
  // Supplies Koramangala" under "Metro Fresh Supplies" is the business twice.
  const branch = placeLabel(supplier.storeName, supplier.supplierName);
  const rating = supplier.averageRating;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${supplier.supplierName}, ${branch ?? ''}`}
      style={styles.row}
    >
      <View style={styles.badge}>
        <Ionicons name="storefront-outline" size={22} color={Colors.textSecondary} />
      </View>

      <View style={styles.body}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{supplier.supplierName}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {[branch !== supplier.supplierName ? branch : null, supplier.city]
            .filter(Boolean).join(' · ')}
        </MandiText>

        <View style={styles.facts}>
          {supplier.distanceKm != null && (
            <MandiText variant="caption" color={Colors.textSecondary}>
              {formatQuantity(supplier.distanceKm)} km
            </MandiText>
          )}
          {rating != null && (
            <View style={styles.rating}>
              <Ionicons name="star" size={11} color={Colors.warning} />
              <MandiText variant="caption" color={Colors.textSecondary}>
                {formatQuantity(rating)}
                {supplier.ratingCount > 0 ? ` (${supplier.ratingCount})` : ''}
              </MandiText>
            </View>
          )}
          {supplier.productCount != null && supplier.productCount > 0 && (
            <MandiText variant="caption" color={Colors.textTertiary}>
              {supplier.productCount} items
            </MandiText>
          )}
        </View>

        {!supplier.openNow && (
          <MandiText variant="caption" color={Colors.textTertiary}>
            {supplier.opensAt ? `Closed · opens ${supplier.opensAt}` : 'Closed right now'}
          </MandiText>
        )}
      </View>

      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSunken,
  },
  body: { flex: 1, gap: 2 },
  facts: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
