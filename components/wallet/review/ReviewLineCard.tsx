import React, { memo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  MONEY_DECIMALS, MONEY_INT_DIGITS, QTY_DECIMALS, QTY_INT_DIGITS,
  lineHint, lineStatus, paiseToRupees, previewItemPrice, previewLineTotal, priceDeviation,
  type FormLine,
} from '@/lib/wallet/billReview';
import type { NumberField } from '@/lib/wallet/billReviewReducer';
import { formatMoney } from '@/utils/money';
import { ReviewColors, ReviewLayout, Spacing, TextStyles } from '@/theme';
import { Chip, FieldLabel, HelperText, NumberInput, SelectField } from './fields';
import { useReviewForm } from './formContext';

const rupees = (paise: number | null) => (paise == null ? '—' : formatMoney(paiseToRupees(paise)));

/** "₹360.00/KG", or a note when the SKU carries no price. */
export function skuPriceText(sku: FormLine['sku']): string {
  if (sku == null) return '';
  if (sku.unitPrice == null) return 'No price on this SKU';
  return `${formatMoney(sku.unitPrice)}${sku.unit ? `/${sku.unit}` : ''}`;
}

const TINT = {
  resolved: { bg: ReviewColors.resolvedCard, border: ReviewColors.resolvedBorder },
  attention: { bg: ReviewColors.attentionCard, border: ReviewColors.attentionBorder },
  new: { bg: ReviewColors.newCard, border: ReviewColors.newBorder },
} as const;

const CHIP = {
  resolved: { label: 'Resolved', tone: 'resolved' },
  attention: { label: 'Needs attention', tone: 'attention' },
  new: { label: 'New', tone: 'new' },
} as const;

export interface LineCardProps {
  line: FormLine;
  /** 1-based position on screen. */
  position: number;
  errors: Partial<Record<string, string>>;
  onNumber: (key: string, field: NumberField, value: string) => void;
  onPickSku: (key: string) => void;
  onCreateSku: (key: string) => void;
  onDelete: (key: string) => void;
  onToggleIgnore: (key: string) => void;
}

/**
 * One item of the bill, as the cost app's line card: what the bill called it, the SKU it is resolved
 * to (and that SKU's price), quantity, amount and tax, the line total, and the unit price with its
 * deviation warning and Ignore.
 *
 * <p>The line is addressed by its client `key`; test ids use its position on screen. The header reads
 * "FROM INVOICE" over the bill's own name (full width, wrapping), then the number, the status chip and
 * Remove on a row of their own, so a long name never squeezes the chip.
 *
 * <p>Memoised: typing in another card, or in the header fields, does not render this one.
 */
function LineCard({ line, position, errors, onNumber, onPickSku, onCreateSku, onDelete, onToggleIgnore }: LineCardProps) {
  const form = useReviewForm();
  const amountRef = useRef<TextInput>(null);
  const taxRef = useRef<TextInput>(null);
  const k = line.key;
  const id = `line-${position}`;
  const row = `line:${k}:row`;
  const numbers = `line:${k}:numbers`;
  const status = lineStatus(line);
  const tint = TINT[status];
  const chip = CHIP[status];
  const total = previewLineTotal(line);
  const unitPrice = previewItemPrice(line);
  const deviation = priceDeviation(line);
  const flagged = deviation != null && !line.ignoredDeviation;
  const unit = (line.sku?.unit ?? line.unit ?? '').toUpperCase();
  const fromText = line.fromInvoice?.name?.trim() || null;
  const hint = lineHint(line);
  const name = fromText ?? line.sku?.name ?? `item ${position}`;

  return (
    <View
      style={[styles.card, { backgroundColor: tint.bg, borderColor: tint.border }]}
      testID={id}
      ref={(node) => form.register(row, node)}
      onLayout={form.anchor(row, 'lines')}
    >
      <View style={styles.head}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={`Item ${position}, ${fromText ? `from the bill: ${fromText}` : 'added by you'}, ${chip.label}`}
        >
          <Text style={styles.fromLabel} numberOfLines={1}>{fromText ? 'FROM INVOICE' : 'ADDED BY YOU'}</Text>
          {fromText ? <Text style={styles.fromName} testID={`${id}-name`}>{fromText}</Text> : null}
        </View>
        <View style={styles.headRow}>
          <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.badgeText}>{position}</Text>
          </View>
          <View style={styles.chipBox}>
            <Chip label={chip.label} tone={chip.tone} hidden testID={`${id}-status`} />
          </View>
          <Pressable
            onPress={() => onDelete(k)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name}`}
            style={styles.trash}
            testID={`${id}-delete`}
          >
            <Ionicons name="trash-outline" size={18} color={ReviewColors.secondary} />
          </Pressable>
        </View>
      </View>

      <View onLayout={form.anchor(`line:${k}:sku`, row)}>
        <SelectField
          ref={(node) => form.register(`line:${k}:sku`, node)}
          label={`SKU for item ${position}`}
          hideLabel
          noHelper
          value={line.sku?.name ?? ''}
          placeholder="Choose the SKU"
          onPress={() => onPickSku(k)}
          error={errors.sku}
          chip={line.sku && line.sku.id == null ? <Chip label="New" tone="new" /> : null}
          testID={`${id}-sku`}
        />
        <View style={styles.skuFoot}>
          <View style={styles.flex}>
            <HelperText error={errors.sku} hint={line.sku ? skuPriceText(line.sku) : null} testID={`${id}-sku-error`} />
          </View>
          <Pressable
            onPress={() => onCreateSku(k)}
            accessibilityRole="button"
            accessibilityLabel={`Create a new SKU for ${name}`}
            style={styles.create}
            testID={`${id}-create-sku`}
          >
            <Ionicons name="add" size={16} color={ReviewColors.orange} />
            <Text style={styles.createText}>Create SKU</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.numbers} onLayout={form.anchor(numbers, row)}>
        <View style={styles.qty} onLayout={form.anchor(`line:${k}:quantity`, numbers)}>
          <FieldLabel label={unit ? `QTY (${unit})` : 'QTY'} />
          <NumberInput
            label={`Quantity${unit ? ` in ${unit}` : ''}, item ${position}`}
            value={line.quantity}
            onChangeText={(v) => onNumber(k, 'quantity', v)}
            decimals={QTY_DECIMALS}
            maxInt={QTY_INT_DIGITS}
            placeholder="0"
            invalid={!!errors.quantity}
            fieldKey={`line:${k}:quantity`}
            onNext={() => amountRef.current?.focus()}
            testID={`${id}-quantity`}
          />
          <HelperText error={errors.quantity} />
        </View>
        <View style={styles.amount} onLayout={form.anchor(`line:${k}:amount`, numbers)}>
          <FieldLabel label="AMOUNT" />
          <NumberInput
            ref={amountRef}
            label={`Amount in rupees before tax, item ${position}`}
            value={line.amount}
            onChangeText={(v) => onNumber(k, 'amount', v)}
            decimals={MONEY_DECIMALS}
            maxInt={MONEY_INT_DIGITS}
            placeholder="0.00"
            invalid={!!errors.amount}
            fieldKey={`line:${k}:amount`}
            onNext={() => taxRef.current?.focus()}
            testID={`${id}-amount`}
          />
          <HelperText error={errors.amount} />
        </View>
        <View style={styles.tax} onLayout={form.anchor(`line:${k}:tax`, numbers)}>
          <FieldLabel label="TAX" />
          <NumberInput
            ref={taxRef}
            label={`Tax in rupees, item ${position}`}
            value={line.tax}
            onChangeText={(v) => onNumber(k, 'tax', v)}
            decimals={MONEY_DECIMALS}
            maxInt={MONEY_INT_DIGITS}
            placeholder="0.00"
            invalid={!!errors.tax}
            fieldKey={`line:${k}:tax`}
            testID={`${id}-tax`}
          />
          <HelperText error={errors.tax} />
        </View>
      </View>

      {(hint || errors.row || errors.unit) ? (
        <Text style={styles.hint} accessibilityRole="alert" testID={`${id}-hint`}>
          {errors.row ?? errors.unit ?? hint}
        </Text>
      ) : null}

      <View style={styles.band} accessible accessibilityLabel={`Total ${rupees(total)}${deviation == null ? `, item price ${rupees(unitPrice)}` : ''}`}>
        <View style={styles.pair}>
          <Text style={styles.bandLabel}>TOTAL</Text>
          <Text style={styles.total} testID={`${id}-total`}>{rupees(total)}</Text>
        </View>
        {deviation == null ? (
          <View style={styles.pair}>
            <Text style={styles.bandLabel}>ITEM PRICE</Text>
            <Text style={styles.itemPrice} testID={`${id}-price`}>{rupees(unitPrice)}</Text>
          </View>
        ) : null}
      </View>

      {deviation != null ? (
        <View
          style={[styles.deviation, flagged ? styles.deviationOn : styles.deviationOff]}
          testID={`${id}-deviation`}
          ref={(node) => form.register(`line:${k}:price`, node)}
          onLayout={form.anchor(`line:${k}:price`, row)}
        >
          <View style={styles.deviationText} accessible accessibilityLabel={`Item price ${rupees(unitPrice)}, ${deviation === 'above' ? 'more than 50% above' : 'more than 50% below'} the SKU price ${formatMoney(line.sku?.unitPrice)}${line.ignoredDeviation ? ', ignored' : ''}`}>
            <Text style={styles.bandLabel}>ITEM PRICE</Text>
            <Text style={[styles.devValue, !flagged && styles.devValueOff]}>{rupees(unitPrice)}</Text>
            <Text style={styles.devNote}>· deviates from {formatMoney(line.sku?.unitPrice)}</Text>
          </View>
          <Pressable
            onPress={() => onToggleIgnore(k)}
            accessibilityRole="button"
            accessibilityLabel={line.ignoredDeviation ? 'Ignored. Tap to flag the price again' : 'Ignore this price difference'}
            accessibilityState={{ selected: line.ignoredDeviation }}
            style={[styles.ignore, line.ignoredDeviation ? styles.ignored : styles.ignoreOn]}
            testID={`${id}-ignore`}
          >
            {line.ignoredDeviation ? <Ionicons name="checkmark" size={14} color={ReviewColors.ignoredText} /> : null}
            <Text style={[styles.ignoreText, { color: line.ignoredDeviation ? ReviewColors.ignoredText : ReviewColors.ignoreText }]}>
              {line.ignoredDeviation ? 'Ignored' : 'Ignore'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {errors.price ? <HelperText error={errors.price} testID={`${id}-price-error`} /> : null}
    </View>
  );
}

export const ReviewLineCard = memo(LineCard);

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: ReviewLayout.cardRadius,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  head: { gap: Spacing.xs },
  // Wraps at large text sizes (Remove then sits on its own line, still at the right) instead of
  // pushing Remove out of the card.
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, marginVertical: -Spacing.xs },
  chipBox: { justifyContent: 'center', flexShrink: 1 },
  badge: {
    width: ReviewLayout.badge,
    height: ReviewLayout.badge,
    borderRadius: ReviewLayout.badge / 2,
    backgroundColor: ReviewColors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...TextStyles.label, color: ReviewColors.badgeText },
  fromLabel: { ...TextStyles.label, color: ReviewColors.secondary, letterSpacing: 0.4 },
  fromName: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
  // 44 dp to tap; the row's negative margin keeps it from making the header taller than the glyph needs.
  trash: { width: ReviewLayout.tap, height: ReviewLayout.tap, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', marginRight: -Spacing.sm },
  flex: { flex: 1 },
  skuFoot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  // 44 dp to tap, drawn as a 20 dp line of text beside the SKU's price.
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: ReviewLayout.tap,
    paddingHorizontal: Spacing.sm,
    marginRight: -Spacing.sm,
    marginVertical: -12,
  },
  createText: { ...TextStyles.captionEmphasis, color: ReviewColors.orangeText },
  numbers: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  qty: { flexGrow: 1, flexBasis: 72, minWidth: 72 },
  amount: { flexGrow: 1.6, flexBasis: 96, minWidth: 96 },
  tax: { flexGrow: 1.2, flexBasis: 80, minWidth: 80 },
  hint: { ...TextStyles.caption, color: ReviewColors.attentionText, marginTop: -Spacing.xs },
  band: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.sm,
    backgroundColor: ReviewColors.band,
    borderRadius: ReviewLayout.fieldRadius,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  pair: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  bandLabel: { ...TextStyles.label, color: ReviewColors.secondaryOnBand, letterSpacing: 0.4 },
  total: { ...TextStyles.priceSmall, fontFamily: TextStyles.price.fontFamily, color: ReviewColors.text },
  itemPrice: { ...TextStyles.numeric, color: ReviewColors.text },
  deviation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: ReviewLayout.fieldRadius,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    minHeight: ReviewLayout.tap + Spacing.xs,
  },
  deviationOn: { backgroundColor: ReviewColors.deviationBg, borderColor: ReviewColors.deviationBorder },
  deviationOff: { backgroundColor: ReviewColors.band, borderColor: ReviewColors.divider },
  deviationText: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: Spacing.sm, paddingVertical: Spacing.sm },
  devValue: { ...TextStyles.price, fontSize: 16, color: ReviewColors.deviationValue },
  devValueOff: { color: ReviewColors.text },
  devNote: { ...TextStyles.caption, color: ReviewColors.deviationNote },
  ignore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: ReviewLayout.tap,
    minWidth: ReviewLayout.tap + 20,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: ReviewLayout.fieldRadius - 2,
    borderWidth: 1,
  },
  ignoreOn: { backgroundColor: ReviewColors.ignoreBg, borderColor: ReviewColors.ignoreBorder },
  ignored: { backgroundColor: ReviewColors.ignoredBg, borderColor: ReviewColors.ignoredBorder },
  ignoreText: { ...TextStyles.captionEmphasis },
});
