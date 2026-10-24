import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiButton } from '@/components/common';
import {
  MONEY_DECIMALS, MONEY_INT_DIGITS, paiseToRupees, type FooterStatus, type PreviewTotals,
} from '@/lib/wallet/billReview';
import { formatMoney } from '@/utils/money';
import { ReviewColors, ReviewLayout, Spacing, TextStyles, Elevation } from '@/theme';
import { HelperText, NumberInput } from './fields';
import { useReviewForm } from './formContext';

const rupees = (paise: number) => formatMoney(paiseToRupees(paise));

/** The server's saved figures, shown instead of the preview while nothing has been changed. */
export interface ServerTotals {
  subtotal: string | null;
  tax: string | null;
  total: string | null;
}

/** One editable money figure of the summary (Tax, Delivery charges): ₹ input, hint, and Reset when changed. */
function MoneyRow({
  label, value, placeholder, onChange, changed, onReset, resetLabel, hint, error, anchorKey, testID,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  changed: boolean;
  onReset: () => void;
  resetLabel: string;
  hint: string;
  error?: string | null;
  anchorKey: 'taxOverride' | 'delivery';
  testID: string;
}) {
  const form = useReviewForm();
  return (
    <View onLayout={form.anchor(anchorKey, 'summary')}>
      <View style={styles.inputRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.input}>
          <Text style={styles.currency} accessibilityElementsHidden importantForAccessibility="no">₹</Text>
          <NumberInput
            label={`${label} in rupees`}
            value={value}
            onChangeText={onChange}
            decimals={MONEY_DECIMALS}
            maxInt={MONEY_INT_DIGITS}
            placeholder={placeholder}
            invalid={!!error}
            fieldKey={anchorKey}
            containerStyle={styles.flex}
            testID={testID}
          />
        </View>
      </View>
      <View style={styles.help}>
        <View style={styles.flex}>
          <HelperText error={error} hint={hint} testID={`${testID}-hint`} />
        </View>
        {changed ? (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel={resetLabel}
            style={styles.reset}
            testID={`${testID}-reset`}
          >
            <Ionicons name="refresh" size={14} color={ReviewColors.orange} />
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Invoice summary, as the server adds it up: Subtotal (the items), Tax (the bill's own tax when one is
 * given, else the items' taxes), Delivery charges, and Total. Tax and Delivery start from the bill and
 * can be changed; Reset (shown only once they differ) puts the bill's figure back. While the owner edits,
 * the figures are a preview worked out on the phone; a saved review that has not been changed shows the
 * server's own figures.
 */
export function ReviewSummary({
  preview, server, delivery, deliveryChanged, deliveryError, onDelivery, onResetDelivery,
  taxOverride, taxChanged, taxFromBill, taxError, onTaxOverride, onResetTax,
}: {
  preview: PreviewTotals;
  server: ServerTotals | null;
  delivery: string;
  deliveryChanged: boolean;
  deliveryError?: string | null;
  onDelivery: (value: string) => void;
  onResetDelivery: () => void;
  taxOverride: string;
  taxChanged: boolean;
  /** The tax figure came from the bill (the draft had one, or the owner typed one). */
  taxFromBill: boolean;
  taxError?: string | null;
  onTaxOverride: (value: string) => void;
  onResetTax: () => void;
}) {
  const form = useReviewForm();
  const subtotal = server?.subtotal != null ? formatMoney(server.subtotal) : rupees(preview.subtotal);
  const total = server?.total != null ? formatMoney(server.total) : rupees(preview.total);
  return (
    <View style={styles.card} testID="review-summary" onLayout={form.anchor('summary', null)}>
      <Text style={styles.title} accessibilityRole="header">Invoice summary</Text>
      <View style={styles.row} accessible accessibilityLabel={`Subtotal ${subtotal}`}>
        <Text style={styles.label}>Subtotal</Text>
        <Text style={styles.value} testID="summary-subtotal">{subtotal}</Text>
      </View>
      <MoneyRow
        label="Tax"
        value={taxOverride}
        placeholder={paiseToRupees(preview.lineTax)}
        onChange={onTaxOverride}
        changed={taxChanged}
        onReset={onResetTax}
        resetLabel="Reset tax to the bill’s figure"
        hint={taxFromBill ? 'Tax on the bill. Edit if it is different.' : 'Added up from the items. Edit if the bill’s tax is different.'}
        error={taxError}
        anchorKey="taxOverride"
        testID="summary-tax"
      />
      <MoneyRow
        label="Delivery charges"
        value={delivery}
        placeholder="0.00"
        onChange={onDelivery}
        changed={deliveryChanged}
        onReset={onResetDelivery}
        resetLabel="Reset delivery charges to the bill’s figure"
        hint="Delivery charge on the bill. Edit if it is different."
        error={deliveryError}
        anchorKey="delivery"
        testID="summary-delivery"
      />
      <View style={styles.divider} />
      <View style={styles.totalRow} accessible accessibilityLabel={`Total ${total}`}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue} testID="summary-total">{total}</Text>
      </View>
      <Text style={styles.note} testID="summary-note">
        {server ? 'As saved. Totals are worked out by Costonomy.' : 'Preview as you type. Costonomy works out the saved totals.'}
      </Text>
    </View>
  );
}

const TONE = {
  ready: { color: ReviewColors.ready, icon: 'checkmark-circle' as const },
  attention: { color: ReviewColors.attentionText, icon: 'alert-circle' as const },
  error: { color: ReviewColors.error, icon: 'alert-circle' as const },
};

/**
 * The bar pinned under the form, one row: the total over a single status line on the left (the most
 * important thing: a failed save, the items that need attention, what else Save waits for, or "All items
 * ready"; tapping it goes there), and Save review on the right. A failed save turns the button into
 * Try again; the edits stay. The status wraps at large text sizes instead of being cut.
 */
export function ReviewFooter({
  total, status, onStatus, ready, saving, retry, onSave, hidden,
}: {
  total: string;
  status: FooterStatus;
  onStatus: () => void;
  ready: boolean;
  saving: boolean;
  /** The last save failed in a way another try could fix. */
  retry: boolean;
  onSave: () => void;
  /** While the keyboard is up the bar steps aside. */
  hidden?: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (hidden) return null;
  const tone = TONE[status.tone];
  const statusText = (
    <View style={styles.statusLine}>
      <Ionicons name={tone.icon} size={14} color={tone.color} style={styles.statusIcon} />
      <Text style={[styles.statusText, { color: tone.color }, status.target != null && styles.link]} testID="footer-status">
        {status.text}
      </Text>
    </View>
  );
  return (
    <View style={[styles.footer, { paddingBottom: Spacing.sm + insets.bottom }]} testID="review-footer">
      <View style={styles.left}>
        <Text style={styles.footerTotal} testID="footer-total">{total}</Text>
        {status.target != null ? (
          <Pressable
            onPress={onStatus}
            accessibilityRole="button"
            accessibilityLabel={status.text}
            accessibilityHint="Goes to it"
            accessibilityLiveRegion={status.tone === 'error' ? undefined : 'polite'}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            testID="footer-status-link"
          >
            {statusText}
          </Pressable>
        ) : (
          <View accessibilityLiveRegion="polite">{statusText}</View>
        )}
      </View>
      <MandiButton
        label={saving ? 'Saving…' : retry ? 'Try again' : 'Save review'}
        size="md"
        fullWidth={false}
        onPress={onSave}
        disabled={!ready || saving}
        accessibilityHint={!ready ? status.text : undefined}
        style={styles.save}
        testID="save-review"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: ReviewColors.card,
    borderWidth: 1,
    borderColor: ReviewColors.cardBorder,
    borderRadius: ReviewLayout.cardRadius,
    padding: ReviewLayout.cardPad,
    gap: Spacing.sm,
  },
  title: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, gap: Spacing.md },
  label: { ...TextStyles.body, color: ReviewColors.secondary, flexShrink: 1 },
  value: { ...TextStyles.numeric, color: ReviewColors.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, flexWrap: 'wrap' },
  // 148 dp beside its label on a phone; at large text sizes it goes under the label and may narrow.
  input: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexBasis: 148, flexShrink: 1, maxWidth: '100%' },
  currency: { ...TextStyles.body, color: ReviewColors.secondary },
  help: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  reset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: ReviewLayout.tap,
    paddingHorizontal: Spacing.sm,
    marginTop: -Spacing.md,
    marginBottom: -Spacing.sm,
    marginRight: -Spacing.sm,
  },
  resetText: { ...TextStyles.captionEmphasis, color: ReviewColors.orangeText },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: ReviewColors.divider },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  totalLabel: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
  totalValue: { ...TextStyles.price, color: ReviewColors.text },
  note: { ...TextStyles.label, letterSpacing: 0, color: ReviewColors.tertiary },
  // One row (about 64 dp) on a phone; at large text sizes Save wraps under the status rather than
  // squeezing the total into a sliver.
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.md,
    rowGap: Spacing.sm,
    paddingHorizontal: ReviewLayout.gutter,
    paddingTop: Spacing.sm,
    minHeight: 64,
    backgroundColor: ReviewColors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ReviewColors.divider,
    ...Elevation.floating,
  },
  left: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: 2 },
  footerTotal: { ...TextStyles.price, fontSize: 18, lineHeight: 24, color: ReviewColors.text },
  statusLine: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  statusIcon: { marginTop: 3 },
  statusText: { ...TextStyles.captionEmphasis, flexShrink: 1 },
  link: { textDecorationLine: 'underline' },
  save: { minWidth: 132, minHeight: ReviewLayout.tap, flexGrow: 1, maxWidth: '100%' },
});
