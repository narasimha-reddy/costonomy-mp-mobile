import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StorefrontSku } from '@/models/discovery';
import { ProductThumb } from './ProductThumb';
import { MandiText } from '@/components/common';
import { formatGstRate, formatMoney, formatQuantity, type Money } from '@/utils/money';
import { skuSecondaryLine } from '@/utils/skuLabel';
import { Colors, ControlHeight, Radius, Spacing, hitSlopFor } from '@/theme';

/** The picture, right of the text. The Add control overlaps its bottom edge by {@link ADD_OVERLAP}. */
const THUMB = 88;
const ADD_OVERLAP = 12;

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
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <MandiText variant="bodyEmphasis" numberOfLines={2} style={styles.flexShrink}>{sku.skuName}</MandiText>
          {sku.grade ? (
            <View style={styles.gradeBadge}>
              <MandiText variant="caption" style={styles.gradeBadgeText}>{sku.grade}</MandiText>
            </View>
          ) : null}
        </View>

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

        {/* What one pack costs, in the pack line's own register. Strikethrough MRP and discount badge when available. */}
        <View style={styles.unitPrice}>
          {sku.mrp != null && Number(sku.mrp) > Number(sku.sellingPrice) && (
            <MandiText variant="caption" style={styles.mrpStrikethrough}>
              {formatMoney(sku.mrp)}
            </MandiText>
          )}
          <MandiText variant="caption" color={Colors.textPrimary}>
            {formatMoney(sku.sellingPrice)}
          </MandiText>
          {sku.discountPercent != null && sku.discountPercent > 0 && (
            <View style={styles.discountBadge}>
              <MandiText variant="caption" style={styles.discountBadgeText}>
                {sku.discountPercent}% OFF
              </MandiText>
            </View>
          )}
          {sku.gstRate != null && Number(sku.gstRate) > 0 && (
            <MandiText variant="caption" color={Colors.textTertiary}>
              + {formatGstRate(sku.gstRate)} GST
            </MandiText>
          )}
        </View>


        {/* What this line comes to, once there is a line. Only then: a total of
            nothing is not a fact about this pack, and the unit price above
            already says what one costs. */}
        {onChangePacks != null && lineTotal != null && (packs ?? 0) > 0 && (
          <MandiText variant="priceSmall">{formatMoney(lineTotal)}</MandiText>
        )}

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
            {sku.averageRating != null && sku.ratingCount > 0 && (
              <View style={styles.rating}>
                <Ionicons name="star" size={11} color={Colors.warning} />
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {formatQuantity(sku.averageRating)}
                  {` (${sku.ratingCount})`}
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

        {/* The picture and its control. Add is a sibling of the picture's own
            press target, not inside it, and hangs over the picture's bottom edge. */}
        <View style={styles.media}>
          {onPress ? (
            <Pressable onPress={onPress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ProductThumb uri={sku.imageUrl} size={THUMB} radius={Radius.md} />
            </Pressable>
          ) : (
            <ProductThumb uri={sku.imageUrl} size={THUMB} radius={Radius.md} />
          )}

          <View style={styles.control}>
            {onChangePacks != null ? (
              (packs ?? 0) > 0 ? (
                <PackStepper
                  packs={packs ?? 0}
                  name={sku.skuName}
                  unit={sku.packUnit}
                  disabled={unavailable}
                  onChange={onChangePacks}
                />
              ) : (
                <AddButton
                  name={sku.skuName}
                  unavailable={unavailable}
                  onPress={() => onChangePacks(1)}
                />
              )
            ) : onAdd ? (
              <AddButton name={sku.skuName} unavailable={unavailable} loading={adding} onPress={onAdd} />
            ) : null}
          </View>
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
                  {opt.grade ? (
                    <View style={styles.gradeBadge}>
                      <MandiText variant="caption" style={styles.gradeBadgeText}>
                        {opt.grade}
                      </MandiText>
                    </View>
                  ) : null}
                  <View style={styles.chipPricing}>
                    {opt.mrp != null && Number(opt.mrp) > Number(opt.sellingPrice) && (
                      <MandiText variant="caption" style={styles.chipMrpStrikethrough}>
                        {formatMoney(opt.mrp)}
                      </MandiText>
                    )}
                    <MandiText
                      variant="caption"
                      color={isCurrent ? Colors.primaryDark : Colors.textSecondary}
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
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** The orange outline Add. "Out of stock" when it cannot be added, and then it does nothing. */
function AddButton({ name, unavailable, loading, onPress }: {
  name: string;
  unavailable: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const inert = unavailable || loading === true;
  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={`Add ${name}`}
      accessibilityState={{ disabled: inert, busy: loading === true }}
      hitSlop={{ top: 2, bottom: 2 }}
      style={[styles.add, unavailable && styles.addOff]}
    >
      <MandiText variant="bodyEmphasis" color={unavailable ? Colors.textDisabled : Colors.primaryDark} numberOfLines={1}>
        {loading ? '...' : unavailable ? 'Out of stock' : 'ADD'}
      </MandiText>
    </Pressable>
  );
}

/** The filled stepper that replaces Add once there is a pack in the basket. */
function PackStepper({ packs, name, unit, disabled, onChange }: {
  packs: number;
  name: string;
  unit: string | null;
  disabled: boolean;
  onChange: (packs: number) => void;
}) {
  const suffix = ` ${name}`;
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(packs - 1)}
        accessibilityRole="button"
        accessibilityLabel={`Decrease quantity${suffix}`}
        hitSlop={hitSlopFor(ControlHeight.sm)}
        style={styles.stepperHit}
      >
        <Ionicons name="remove" size={18} color={Colors.textInverse} />
      </Pressable>
      <MandiText
        variant="bodyEmphasis"
        color={Colors.textInverse}
        center
        accessibilityLabel={`${packs}${unit ? ` ${unit.toLowerCase()}` : ''}${suffix}`}
        style={styles.stepperValue}
      >
        {packs}
      </MandiText>
      <Pressable
        onPress={disabled ? undefined : () => onChange(packs + 1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Increase quantity${suffix}`}
        accessibilityState={{ disabled }}
        hitSlop={hitSlopFor(ControlHeight.sm)}
        style={styles.stepperHit}
      >
        <Ionicons name="add" size={18} color={Colors.textInverse} />
      </Pressable>
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
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    // The Add control hangs below the picture; this is the room it hangs into.
    paddingBottom: Spacing.sm + ADD_OVERLAP,
  },
  main: { flex: 1, flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  body: { flex: 1, gap: 2 },
  flexShrink: { flexShrink: 1 },
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
    fontSize: 10,
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
    fontSize: 9,
    fontWeight: '700',
    color: '#E65100',
  },
  unitPrice: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  signals: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  media: { width: THUMB, height: THUMB },
  control: {
    position: 'absolute',
    bottom: -ADD_OVERLAP,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  add: {
    minWidth: 76,
    minHeight: ControlHeight.sm + 4,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  addOff: { borderColor: Colors.border },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ControlHeight.sm + 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  stepperHit: { width: 32, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 24 },
  brandOptionsContainer: {
    marginTop: 2,
    marginBottom: Spacing.xs,
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
  chipPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  chipMrpStrikethrough: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
    fontSize: 8,
  },
  chipDiscountBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderRadius: 2,
  },
  chipDiscountText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#E65100',
  },
  pressed: {
    opacity: 0.7,
  },
});
