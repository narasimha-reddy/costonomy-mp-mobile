import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common/MandiText';
import type { PopularSupplier } from '@/models/discovery';
import { formatQuantity } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/** Columns in the Recommended grid. Three at every width, 360dp included. */
export const RECOMMENDED_COLUMNS = 3;
/** Share of the row each cell takes: a third, less room for the two gaps. */
export const RECOMMENDED_CELL_WIDTH = '31%';

const NAME_MIN_SCALE = 0.8;

/**
 * One supplier in the Recommended grid: an initial disc, the store name on up
 * to two lines (ellipsis after that), and the distance when known.
 *
 * <p>No fixed height: at 1.3x text the name takes its two lines and the cell
 * grows with it, rather than clipping.
 */
export function RecommendedTile({
  supplier,
  onPress,
}: {
  supplier: PopularSupplier;
  onPress: () => void;
}) {
  const initial = supplier.storeName.trim().charAt(0).toUpperCase();
  return (
    <Pressable
      testID="recommended-cell"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${supplier.storeName}, ${supplier.skuCount} items`}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
    >
      <View style={styles.disc}>
        <MandiText variant="bodyEmphasis" color={Colors.primaryDark}>{initial}</MandiText>
      </View>
      <MandiText
        variant="captionEmphasis"
        numberOfLines={2}
        ellipsizeMode="tail"
        // At 360dp a cell is ~100dp: let a long name shrink a little before it is cut, rather than lose its tail.
        adjustsFontSizeToFit
        minimumFontScale={NAME_MIN_SCALE}
        style={styles.name}
      >
        {supplier.storeName}
      </MandiText>
      {supplier.distanceKm != null && (
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {`${formatQuantity(supplier.distanceKm)} km`}
        </MandiText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: RECOMMENDED_CELL_WIDTH,
    minHeight: 48,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pressed: { opacity: 0.7 },
  disc: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  name: { textAlign: 'center', alignSelf: 'stretch' },
});
