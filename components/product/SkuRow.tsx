import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StorefrontSku } from '@/models/discovery';
import { ProductThumb } from './ProductThumb';
import { MandiQuantityStepper, MandiButton, MandiText } from '@/components/common';
import { formatGstRate, formatMoney, formatQuantity, type Money } from '@/utils/money';
import { skuSecondaryLine } from '@/utils/skuLabel';
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
  packs,
  onChangePacks,
  lineTotal,
  /** Hides the supplier line, for a list that is already one supplier's shelf. */
  hideSupplier,
  onSelectBrandSku,
}: {
  sku: StorefrontSku;
  onPress?: () => void;
  onAdd?: () => void;
  adding?: boolean;
  /**
   * How many packs are in the basket, when the row should carry a stepper
   * instead of an Add.
   *
   * <p>A shelf is where somebody buys four of something. "Add" puts one in and
   * gives no way to say four without opening the item — so where a quantity is
   * passed, the row counts instead.
   */
  packs?: number;
  onChangePacks?: (packs: number) => void;
  /**
   * What this line comes to, when there is a line.
   *
   * <p>From the basket, never multiplied here: price times quantity is
   * arithmetic on money and belongs to the server (guardrail 3). With nothing
   * in the cart there is no line, so the row falls back to what one costs.
   */
  lineTotal?: Money | null;
  hideSupplier?: boolean;
  onSelectBrandSku?: (supplierSkuId: number) => void;
}) {
  const unavailable = sku.availability !== 'AVAILABLE';
  const hasBrandOptions = sku.brandOptions != null && sku.brandOptions.length > 1;

  const body = (
    <>
      <ProductThumb uri={sku.imageUrl} size={48} radius={Radius.sm} />

      <View style={styles.body}>
        <MandiText variant="bodyEmphasis" numberOfLines={2}>{sku.skuName}</MandiText>

        {/* The same pack line as the request and order screens, from the same
            helper — "12 PACK (500 ML) · Mother Dairy". It used to be brand then
            a bare pack size, which read as a different kind of record for the
            same goods depending which screen you found them on.

            No price in it: the row already states one, top right, and the same
            figure twice reads as two figures. */}
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>
          {skuSecondaryLine({
            supplierSkuId: sku.supplierSkuId,
            productName: sku.canonicalProductName,
            skuName: sku.skuName,
            brandName: sku.brandName,
            packSize: sku.packSize,
            packUnit: sku.packUnit,
            measureValue: sku.measureValue,
            measureUnit: sku.measureUnit,
            imageUrl: sku.imageUrl,
            status: sku.availability,
          })}
        </MandiText>

        {/* What one pack costs, in the pack line's own register. It was set in
            the price face, which made a per-unit figure shout louder than the
            total beside the counter — the opposite of which number is being
            decided on.

            <b>Excluding GST, and saying so.</b> The rate is stated as something
            still to be added rather than already in — which is what the figure
            is, and what makes it reconcile with the total above the counter:
            that one includes the tax this one is about to attract. */}
        <View style={styles.unitPrice}>
          <MandiText variant="caption" color={Colors.textPrimary}>
            {formatMoney(sku.sellingPrice)}
          </MandiText>
          {sku.gstRate != null && Number(sku.gstRate) > 0 && (
            <MandiText variant="caption" color={Colors.textTertiary}>
              + {formatGstRate(sku.gstRate)} GST
            </MandiText>
          )}
        </View>


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
    <View style={styles.container}>
      <View style={styles.row}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            // The row opens the pack now, not the comparison. A label describing
            // the old destination is worse than none: a screen reader user hears
            // where they are going and lands somewhere else.
            accessibilityLabel={
              `${sku.skuName} from ${sku.supplierName}, ${formatMoney(sku.sellingPrice)}. `
              + 'About this pack'
            }
            style={styles.main}
          >
            {body}
          </Pressable>
        ) : (
          <View style={styles.main}>{body}</View>
        )}

        <View style={styles.trailing}>
          {/* What this line comes to, over the control that sets it. Only once
              there is a line: a total of nothing is not a fact about this pack,
              and the unit price beside the name already says what one costs. */}
          {onChangePacks != null && lineTotal != null && (packs ?? 0) > 0 && (
            <MandiText variant="priceSmall">{formatMoney(lineTotal)}</MandiText>
          )}

          {onChangePacks != null ? (
            <>
              <MandiQuantityStepper
                value={packs ?? 0}
                disabled={unavailable}
                onChange={onChangePacks}
              />
              {/* The SKU's own unit, which is what the quantity is counted in
                  everywhere else — a request line for this reads "2 KG".
                  
                  In the flow and right-aligned with the control, not floated
                  under it: absolutely positioned it escaped the row's height and
                  struck the divider below, and a caption sitting on a rule reads
                  as belonging to the next row. */}
              {sku.packUnit != null && (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {sku.packUnit.toLowerCase()}
                </MandiText>
              )}
            </>
          ) : onAdd ? (
            <MandiButton
              label={unavailable ? 'Out of stock' : 'Add'}
              variant="secondary"
              size="sm"
              disabled={unavailable}
              loading={adding}
              onPress={onAdd}
              fullWidth={false}
            />
          ) : null}
        </View>
      </View>

      {/* When an item is fulfilled by multiple brands, display all options
          under the item with lowest priced one first. */}
      {hasBrandOptions && (
        <View style={styles.brandOptionsContainer}>
          <View style={styles.brandOptionsHeader}>
            <Ionicons name="pricetags-outline" size={11} color={Colors.primary} />
            <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
              Brand options (lowest first):
            </MandiText>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.brandOptionsRail}
          >
            {sku.brandOptions?.map((opt, idx) => {
              const isCurrent = opt.supplierSkuId === sku.supplierSkuId;
              const isLowest = idx === 0;
              const priceDisplay = opt.unitPriceInclusiveGst != null
                ? formatMoney(opt.unitPriceInclusiveGst)
                : formatMoney(opt.sellingPrice);

              return (
                <Pressable
                  key={opt.supplierSkuId}
                  onPress={() => onSelectBrandSku?.(opt.supplierSkuId) ?? onPress?.()}
                  style={({ pressed }) => [
                    styles.brandChip,
                    isCurrent && styles.brandChipCurrent,
                    pressed && styles.pressed,
                  ]}
                >
                  <MandiText
                    variant="captionEmphasis"
                    color={isCurrent ? Colors.primary : Colors.textPrimary}
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
                  <MandiText
                    variant="caption"
                    color={isCurrent ? Colors.primaryDark : Colors.textSecondary}
                  >
                    {priceDisplay}
                  </MandiText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  main: { flex: 1, flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  body: { flex: 1, gap: 2 },
  unitPrice: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  signals: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trailing: { alignItems: 'flex-end', gap: 2 },
  brandOptionsContainer: {
    marginTop: 2,
    marginBottom: Spacing.xs,
    paddingLeft: 48 + Spacing.md,
    gap: 4,
  },
  brandOptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandOptionsRail: {
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  brandChipCurrent: {
    borderColor: Colors.primary,
    backgroundColor: '#E8F5E9',
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
    fontSize: 8,
    fontWeight: '700',
    color: '#2E7D32',
  },
  pressed: {
    opacity: 0.7,
  },
});
