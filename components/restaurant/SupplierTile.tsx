import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import type { PopularSupplier } from '@/models/discovery';
import type { CreditAgreement } from '@/models/credit';
import { formatMoney, formatQuantity } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/** How many aisles a tile names before the rest become a count. */
const CATEGORIES_SHOWN = 3;

/**
 * One supplier, as a card.
 *
 * <p>Shared by the home rail and the browse page, which show the same supplier
 * a tap apart — two copies would have drifted on which facts a tile leads with,
 * and a kitchen would see the same store described two ways depending on where
 * they found it.
 *
 * <p><b>It leads with what they sell.</b> A name and a distance do not answer
 * the only question here — is this one worth opening — and "Dairy · Vegetables
 * · Staples" does. The categories come from the live catalogue rather than
 * anything the supplier wrote about themselves.
 */
export function SupplierTile({
  supplier,
  credit,
  onPress,
  /** Fixed width in a rail; full width in a list. */
  wide,
}: {
  supplier: PopularSupplier;
  /**
   * What this supplier has extended this outlet, if anything.
   *
   * <p>Passed in rather than fetched: a tile is one row of a list, and a list
   * whose rows each fetch their own credit is a page of requests landing in
   * whatever order they finish.
   */
  credit?: CreditAgreement | null;
  onPress: () => void;
  wide?: boolean;
}) {
  const shown = supplier.categories.slice(0, CATEGORIES_SHOWN);
  const hidden = supplier.categories.length - shown.length;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${supplier.storeName}, ${supplier.skuCount} items`}
      style={({ pressed }) => [
        styles.tile,
        wide ? styles.wide : styles.railWidth,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.tileHead}>
        <View style={styles.flex}>
          <MandiText variant="bodyEmphasis" numberOfLines={1}>
            {supplier.storeName}
          </MandiText>
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {supplier.supplierName}
          </MandiText>
        </View>
        {/* Closed is worth saying up front — a kitchen can still fill a cart,
            but it changes whether they expect an answer tonight. */}
        {!supplier.openNow && (
          <View style={styles.closedPill}>
            <MandiText variant="caption" color={Colors.textSecondary}>Closed</MandiText>
          </View>
        )}
      </View>

      <View style={styles.facts}>
        {supplier.distanceKm != null && (
          <Fact icon="navigate-outline" text={`${formatQuantity(supplier.distanceKm)} km`} />
        )}
        <Fact icon="pricetag-outline" text={`${supplier.skuCount} items`} />
        {supplier.ratingCount > 0 && supplier.averageRating != null && (
          <Fact icon="star" text={`${formatQuantity(supplier.averageRating)}`} />
        )}
      </View>

      {/* Whether this supplier gives this kitchen terms.
          <p>The fact that decides whether they can buy here at all on a tight
          week, so it gets its own line rather than a fourth grey icon. Violet
          because that is what credit is everywhere else in the app, and the
          card glyph carries the meaning for anyone who cannot see the colour
          (§23A.48).
          <p>The figure is `available`, which is the server's: what is left to
          spend nets off orders already in flight. */}
      {/* Order without asking first. D-094.
          <p>Above credit because it changes which supplier a kitchen opens when
          they are in a hurry, which is the decision this tile exists to serve.
          The bolt carries the meaning for anyone who cannot see the colour
          (§23A.48). */}
      {supplier.directOrdersEnabled && (
        <View style={[styles.creditRow, styles.directRow]}>
          <Ionicons name="flash" size={IconSize.xs} color={Colors.success} />
          <MandiText variant="caption" color={Colors.success} numberOfLines={1}>
            Order directly
          </MandiText>
        </View>
      )}

      <CreditLine credit={credit} />

      {shown.length > 0 && (
        <View style={styles.categories}>
          {shown.map((category) => (
            <View key={category.categoryId} style={styles.chip}>
              <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                {category.name}
              </MandiText>
            </View>
          ))}
          {/* The number hidden, not the total: the reader can already see three. */}
          {hidden > 0 && (
            <View style={styles.chip}>
              <MandiText variant="caption" color={Colors.textTertiary}>+{hidden}</MandiText>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

/**
 * One line about credit, or nothing at all.
 *
 * <p>A supplier who has extended nothing gets no line — an empty "no credit"
 * label on every tile would be noise on the common case, and the offer to ask
 * belongs on the supplier's own page where there is room to say what asking
 * involves.
 */
function CreditLine({ credit }: { credit?: CreditAgreement | null }) {
  if (credit == null) {
    return null;
  }

  // `canFund` is the server's word for "an order can draw on this now". Read
  // rather than inferred from the status, per §23A.24.
  if (credit.canFund) {
    return (
      <View style={[styles.creditRow, styles.creditActive]}>
        <Ionicons name="card" size={IconSize.xs} color={Colors.credit} />
        <MandiText variant="caption" color={Colors.credit} numberOfLines={1}>
          {formatMoney(credit.available)} credit available
        </MandiText>
      </View>
    );
  }

  // Asked and waiting, or approved on terms not yet accepted. Worth saying:
  // it stops a kitchen asking twice, and says whose move it is.
  if (credit.status === 'REQUESTED' || credit.status === 'APPROVED') {
    return (
      <View style={[styles.creditRow, styles.creditPending]}>
        <Ionicons name="time-outline" size={IconSize.xs} color={Colors.warning} />
        <MandiText variant="caption" color={Colors.warning} numberOfLines={1}>
          {credit.status === 'REQUESTED' ? 'Credit requested' : 'Credit needs your acceptance'}
        </MandiText>
      </View>
    );
  }

  return null;
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={12} color={Colors.textTertiary} />
      <MandiText variant="caption" color={Colors.textTertiary}>{text}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tile: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  railWidth: { width: 236 },
  wide: { alignSelf: 'stretch' },
  pressed: { opacity: 0.7 },
  tileHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  closedPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  creditActive: { backgroundColor: Colors.creditLight },
  directRow: { backgroundColor: Colors.successLight },
  creditPending: { backgroundColor: Colors.warningLight },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
});
