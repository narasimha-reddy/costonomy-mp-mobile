import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductThumb } from '@/components/product/ProductThumb';
import {
  MandiButton,
  MandiIconButton,
  MandiQuantityStepper,
  MandiText,
} from '@/components/common';
import type { Intent } from '@/models/intent';
import { formatMoney } from '@/utils/money';
import { skuSecondaryLine, skuTitle } from '@/utils/skuLabel';
import { Colors, Elevation, FontSize, IconSize, Radius, Spacing } from '@/theme';

/**
 * One supplier's request in the cart, as a heading and a body.
 *
 * <p><b>Two exports rather than one component.</b> The heading pins to the top
 * of the scroll view while its own lines scroll under it, and a sticky child has
 * to be a direct child of the scroll view — so the cart lays the two out as
 * siblings and tells the screen which indices stick. Wrapping them in a shared
 * parent would make the pair a single child and the stickiness would apply to
 * the whole supplier, which is the same as not applying at all.
 *
 * <p><b>Why any of this.</b> Three suppliers with six lines each is a single
 * scroll of about a thousand points where the only thing separating one
 * supplier's request from the next is a card edge that left the screen a while
 * ago. Collapsing gives the list back its shape, and the pinned heading means
 * the prices on screen always have somebody's name attached to them.
 */

/**
 * Something about this request the restaurant must see before sending it.
 *
 * <p>Returned rather than rendered so the cart can refuse to collapse a section
 * that has one. A repriced line hidden behind a chevron is the app concealing a
 * commercial fact, which §23A.16 exists to prevent — the collapse is a
 * convenience and must never be the reason somebody did not see a price change.
 */
export function sectionWarning(draft: Intent): string | null {
  if (draft.items.some((item) => item.priceChanged)) {
    return 'A price has changed';
  }
  if (!draft.pricedComplete) {
    return 'Some items have no price';
  }
  const minOrder = draft.minOrderValue != null ? parseFloat(draft.minOrderValue) : 0;
  const currentTotal = draft.agreedTotal != null ? parseFloat(draft.agreedTotal) : 0;
  if (minOrder > 0 && currentTotal < minOrder) {
    const diff = (minOrder - currentTotal).toFixed(0);
    return `Min order ₹${minOrder.toFixed(0)} (Add ₹${diff} more)`;
  }
  return null;
}

export function SupplierSectionHeader({
  draft,
  sequence,
  expanded,
  warning,
  onToggle,
}: {
  draft: Intent;
  sequence: number;
  expanded: boolean;
  warning: string | null;
  onToggle: () => void;
}) {
  const count = draft.items.length;
  const items = `${count} item${count === 1 ? '' : 's'}`;
  const total = draft.agreedTotal != null ? formatMoney(draft.agreedTotal) : null;
  // A section with something to say stays open, so there is nothing to toggle.
  // It loses the chevron and the button role with it — an affordance that does
  // not respond is worse than none, and it would be the one on the request the
  // restaurant most needs to read.
  const lockedOpen = warning != null;

  const content = (
    <>
      {/* Numbered because one action sends several, and "the second one was
          held" needs something to point at. */}
      <View style={styles.sequence}>
        <MandiText variant="caption" color={Colors.textInverse}>{sequence}</MandiText>
      </View>

      <View style={styles.headerText}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>
          {draft.storeName ?? 'Supplier'}
        </MandiText>
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {draft.supplierName != null && draft.supplierName !== draft.storeName
            ? `${draft.supplierName} · ${items}`
            : items}
        </MandiText>
        {warning != null && (
          <View style={styles.warningRow}>
            <Ionicons name="alert-circle" size={IconSize.xs} color={Colors.warning} />
            <MandiText variant="caption" color={Colors.warning} numberOfLines={1}>
              {warning}
            </MandiText>
          </View>
        )}
      </View>

      {!lockedOpen && (
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={IconSize.md}
          color={Colors.textTertiary}
        />
      )}
    </>
  );

  // Always the top of a surface that continues below it: what collapses now is
  // the item list, not the supplier, so there is no standalone heading shape.
  const shape = [styles.header, styles.headerExpanded];

  if (lockedOpen) {
    return <View style={shape}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={[
        draft.storeName ?? 'Supplier',
        items,
        total,
        expanded ? 'Hide items' : 'Show items',
      ].filter(Boolean).join(', ')}
      style={({ pressed }) => [...shape, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function SupplierSectionBody({
  draft,
  expanded,
  sending,
  ordering,
  onChangeQuantity,
  onRemove,
  onSend,
  onOrderDirectly,
  onOpenSku,
}: {
  draft: Intent;
  expanded: boolean;
  /** This request is in flight. Others may be sendable while it is. */
  sending: boolean;
  /** An order is being prepared from this draft. */
  ordering: boolean;
  onChangeQuantity: (itemId: number, quantity: string) => void;
  onRemove: (itemId: number) => void;
  onSend: () => void;
  onOrderDirectly: () => void;
  /** Open the pack's own page. D-096. */
  onOpenSku: (supplierSkuId: number) => void;
}) {
  return (
    <View style={styles.body}>
      {/* What collapses is the item list, not the supplier.
          <p>The totals and the two buttons are what a kitchen is deciding
          between — send this one, or order it — and a collapsed section that
          hid them made the decision invisible until you opened the supplier
          up. Reversed: the money and the actions always show, and the lines
          behind them are what you open to check. */}
      {expanded && draft.items.map((item, index) => (
        <View key={item.id} style={[styles.item, index > 0 && styles.itemDivided]}>
          {/* The picture and the name open the pack; the stepper below stays
              the row's control. A whole-row target would take somebody to
              another screen when they meant to change a quantity. */}
          <Pressable
            onPress={() => onOpenSku(item.supplierSkuId)}
            accessibilityRole="button"
            accessibilityLabel={`About ${skuTitle(item.sku)}`}
            hitSlop={4}
          >
            <ProductThumb uri={item.sku?.imageUrl} size={44} />
          </Pressable>
          <View style={styles.itemText}>
            <Pressable
              onPress={() => onOpenSku(item.supplierSkuId)}
              accessibilityRole="button"
              accessibilityLabel={`About ${skuTitle(item.sku)}`}
              style={({ pressed }) => pressed ? styles.pressed : undefined}
            >
              <MandiText variant="body" numberOfLines={1}>
                {skuTitle(item.sku)}
              </MandiText>
              <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>
                {skuSecondaryLine(item.sku, item.agreedUnitPriceInclusiveGst)}
              </MandiText>
            </Pressable>

            <MandiQuantityStepper
              value={Number(item.requestedQuantity)}
              onChange={(quantity) => onChangeQuantity(item.id, String(quantity))}
              min={0}
              unit={item.unit}
              itemLabel={skuTitle(item.sku)}
            />
          </View>
          <View style={styles.lineAmount}>
            {item.agreedLineTotal != null ? (
              <>
                <MandiText variant="bodyEmphasis">
                  {formatMoney(item.agreedLineTotal)}
                </MandiText>
                {/* Flagged here as well as at send: somebody scanning the basket
                    should see which line moved without having to ask. */}
                {item.priceChanged && item.previousUnitPrice != null && (
                  <MandiText variant="caption" color={Colors.warning}>
                    was {formatMoney(item.previousUnitPrice)}
                  </MandiText>
                )}
              </>
            ) : (
              // No live offer behind this line. Said plainly rather than shown as
              // zero, which would read as free.
              <MandiText variant="caption" color={Colors.warning}>
                No price
              </MandiText>
            )}
          </View>

          {/* Quiet, and smaller than the default.
              <p>It was `lg` in `textPrimary` — the same weight as the product
              name it sits beside, which made the loudest thing on every line
              the one destructive action on the card. It still claims a 44pt
              target, so it is no harder to hit for being lighter. */}
          <MandiIconButton
            icon="close"
            size="md"
            color={Colors.textTertiary}
            accessibilityLabel={`Remove ${skuTitle(item.sku)}`}
            onPress={() => onRemove(item.id)}
          />
        </View>
      ))}

      {draft.agreedTotal != null && (() => {
        const minOrderNum = draft.minOrderValue != null ? parseFloat(draft.minOrderValue) : 0;
        const currentTotalNum = parseFloat(draft.agreedTotal);
        const isBelowMov = minOrderNum > 0 && currentTotalNum < minOrderNum;
        const freeThresholdNum = draft.freeDeliveryThreshold != null ? parseFloat(draft.freeDeliveryThreshold) : 0;

        return (
          <View style={[styles.totals, !expanded && styles.totalsFirst]}>
            <Row label="Items" value={formatMoney(draft.agreedValue ?? '0')} />
            <Row label="GST" value={formatMoney(draft.agreedGst ?? '0')} />
            <Row label="Total" value={formatMoney(draft.agreedTotal)} emphasis />
            {!draft.pricedComplete && (
              <MandiText variant="caption" color={Colors.warning}>
                One or more items have no current price, so this is less than the whole.
              </MandiText>
            )}

            {minOrderNum > 0 && (
              <View style={styles.thresholdBadge}>
                <Ionicons
                  name={!isBelowMov ? 'checkmark-circle' : 'alert-circle'}
                  size={IconSize.xs}
                  color={!isBelowMov ? Colors.success : Colors.warning}
                />
                <MandiText
                  variant="caption"
                  color={!isBelowMov ? Colors.success : Colors.warning}
                >
                  {!isBelowMov
                    ? `Min order ₹${minOrderNum.toFixed(0)} met`
                    : `Min order ₹${minOrderNum.toFixed(0)} (Add ₹${(minOrderNum - currentTotalNum).toFixed(2)} more)`}
                </MandiText>
              </View>
            )}

            {freeThresholdNum > 0 && (
              <View style={styles.thresholdBadge}>
                <Ionicons
                  name={currentTotalNum >= freeThresholdNum ? 'sparkles' : 'bicycle'}
                  size={IconSize.xs}
                  color={currentTotalNum >= freeThresholdNum ? Colors.success : Colors.info}
                />
                <MandiText
                  variant="caption"
                  color={currentTotalNum >= freeThresholdNum ? Colors.success : Colors.info}
                >
                  {currentTotalNum >= freeThresholdNum
                    ? '🎉 FREE delivery unlocked!'
                    : `Add ₹${(freeThresholdNum - currentTotalNum).toFixed(2)} more for FREE delivery`}
                </MandiText>
              </View>
            )}
          </View>
        );
      })()}

      {/* Sending one supplier without the others.
          <p>A basket of three is three conversations, and they are not always
          ready at the same time — the vegetables are decided and the dry goods
          are not. Secondary, because the bar below sends the lot and two primary
          buttons on one screen do not say which is the ordinary one.

          <p><b>And ordering outright, where the supplier allows it.</b> D-094:
          a store that keeps stock has already answered the question a request
          asks, so the round trip buys nothing. Both are offered rather than one
          replacing the other — a kitchen may still want the supplier to confirm
          before money moves, and that choice is theirs. */}
      {(() => {
        const minOrderNum = draft.minOrderValue != null ? parseFloat(draft.minOrderValue) : 0;
        const currentTotalNum = draft.agreedTotal != null ? parseFloat(draft.agreedTotal) : 0;
        const isBelowMov = minOrderNum > 0 && currentTotalNum < minOrderNum;

        return (
          <>
            <View style={styles.actions}>
              <MandiButton
                label="Send Request"
                variant="secondary"
                size="md"
                loading={sending}
                onPress={onSend}
                style={styles.action}
              />
              <MandiButton
                label="Create Order"
                size="md"
                loading={ordering}
                disabled={!draft.directOrdersEnabled || isBelowMov}
                onPress={onOrderDirectly}
                style={styles.action}
              />
            </View>

            <MandiText
              variant="caption"
              color={isBelowMov ? Colors.warning : Colors.textTertiary}
              style={styles.directNote}
            >
              {isBelowMov
                ? `Store minimum order value is ₹${minOrderNum.toFixed(0)}. Please add more items to place an order.`
                : draft.directOrdersEnabled
                ? 'This supplier keeps stock, so you can order without asking first.'
                : "You can't order directly from this supplier. Send a request to check stock, then place the order once they confirm."}
            </MandiText>
          </>
        );
      })()}
    </View>
  );
}

function Row({ label, value, emphasis }: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.totalsRow}>
      <MandiText variant={emphasis ? 'bodyEmphasis' : 'body'} color={Colors.textSecondary}>
        {label}
      </MandiText>
      <MandiText variant={emphasis ? 'price' : 'body'}>{value}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    // Opaque, because a pinned heading sits over the rows passing beneath it.
    backgroundColor: Colors.surface,
    ...Elevation.card,
  },
  /**
   * The gap between suppliers hangs below each section, never above it.
   *
   * <p>A `marginTop` would still be part of the heading once it pins, so the
   * rows scrolling past would show through a strip above it.
   */

  headerExpanded: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  pressed: { backgroundColor: Colors.surfaceSunken },
  headerText: { flex: 1, gap: 1 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  sequence: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    marginBottom: Spacing.listGap,
    ...Elevation.card,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  itemDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  itemText: { flex: 1, gap: Spacing.xs },
  lineAmount: { alignItems: 'flex-end', gap: 2, minWidth: 76 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  action: { flex: 1 },
  // A step below caption: this is the quietest line in the section, under the
  // two loudest things in it.
  directNote: { marginTop: Spacing.sm, fontSize: FontSize.sm - 1 },
  totals: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  // Collapsed, the totals are the first thing under the heading, which already
  // has a rule under it. A second one immediately below draws a double line.
  totalsFirst: { paddingTop: Spacing.md, borderTopWidth: 0 },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  thresholdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
});
