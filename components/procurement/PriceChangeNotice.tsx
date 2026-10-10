import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PriceChange } from '@/models/procurement';
import { MandiButton, MandiText } from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * A price moved between adding to cart and checking out. §23A.16, guardrail 13.
 *
 * <p><b>Old and new are both shown, and the restaurant confirms explicitly.</b>
 * Silently re-reading the new price would mean a restaurant authorising an amount
 * it never saw — which is the entire reason validation is a two-step and not a
 * refresh.
 *
 * <p>Direction is stated in words as well as colour: §36 forbids relying on
 * colour alone, and "up" versus "down" is exactly the kind of thing a red/green
 * pair is usually left to carry by itself.
 */
export function PriceChangeNotice({
  changes,
  onAccept,
  accepting,
}: {
  changes: PriceChange[];
  onAccept: () => void;
  accepting?: boolean;
}) {
  if (changes.length === 0) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.headline}>
        <Ionicons name="pricetag-outline" size={18} color={Colors.warning} />
        <MandiText variant="bodyEmphasis">
          {changes.length === 1 ? 'A price changed' : `${changes.length} prices changed`}
        </MandiText>
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>
        Suppliers repriced since you added these. Check the new amounts before you order.
      </MandiText>

      {changes.map((change) => {
        const rose = Number(change.newUnitPrice) > Number(change.previousUnitPrice);
        return (
          <View key={change.procurementItemId} style={styles.change}>
            <View style={styles.changeText}>
              <MandiText variant="captionEmphasis">{change.productName}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {change.supplierName}
              </MandiText>
            </View>
            <View style={styles.amounts}>
              <MandiText variant="caption" color={Colors.textTertiary} style={styles.was}>
                {formatMoney(change.previousUnitPrice)}
              </MandiText>
              <MandiText
                variant="captionEmphasis"
                color={rose ? Colors.danger : Colors.success}
              >
                {rose ? '↑' : '↓'} {formatMoney(change.newUnitPrice)}
              </MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                {rose ? 'went up' : 'went down'}
              </MandiText>
            </View>
          </View>
        );
      })}

      <MandiButton
        label="Accept new prices"
        onPress={onAccept}
        loading={accepting}
        size="md"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.sm,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warningLight,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  headline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  change: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.warning,
  },
  changeText: { flex: 1, gap: Spacing.xs },
  amounts: { alignItems: 'flex-end' },
  was: { textDecorationLine: 'line-through' },
});
