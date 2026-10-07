import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiText } from '@/components/common';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

/**
 * A credit position — limit, reserved, utilized, available, due, overdue.
 * §23A.24, doc 05 §19.
 *
 * <p><b>Every figure is rendered, none is derived.</b> `available` arrives from
 * the server already computed; subtracting here would give a restaurant a number
 * to plan an order around that funding might then refuse.
 *
 * <p><b>`overdue` is a subset of `due`, not an addition to it.</b> It is shown
 * nested under due for that reason — placed beside it as a sibling, the two read
 * as separate debts and invite adding them.
 *
 * <p>{@code compact} drops the due block and the explanatory hints, for the list
 * card. Due is not omitted to save room: on a card it sits directly under
 * Utilized and reads as a second, separate debt, when for a live agreement with
 * nothing overdue it is the same money said twice. The detail screen has space
 * to show due and overdue together, where the relationship between them is
 * visible rather than implied.
 */
export function CreditPosition({
  approvedLimit,
  reserved,
  utilized,
  available,
  due,
  overdue,
  compact = false,
  barOnly = false,
  pastDueNote = null,
}: {
  approvedLimit: string;
  reserved: string;
  utilized: string;
  available: string;
  due: string;
  overdue: string;
  compact?: boolean;
  /** Only the thin utilisation bar: the host screen already says the figures in words. */
  barOnly?: boolean;
  /** Replaces "nothing overdue" when invoices are past due but inside grace (nothing overdue yet). */
  pastDueNote?: string | null;
}) {
  const isOverdue = Number(overdue) > 0;

  /**
   * How much of the limit is spoken for.
   *
   * <p>The only derived figure here, and what it derives is a width — every
   * rupee on this panel is the server's, `available` above all (§23A.24). The
   * bar repeats what the numbers already say rather than replacing them, so a
   * reader who cannot judge a length loses nothing (§23A.48).
   */
  const limit = Number(approvedLimit);
  const committed = Number(reserved) + Number(utilized);
  const fraction = limit > 0 ? Math.min(1, Math.max(0, committed / limit)) : 0;

  if (barOnly) {
    return limit > 0 ? (
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel="Credit used"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
        testID="credit-utilisation-bar"
      >
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      </View>
    ) : null;
  }

  return (
    <View style={[styles.panel, compact && styles.panelCompact]}>
      <View style={styles.headline}>
        <MandiText variant="caption" color={Colors.textSecondary}>Available to spend</MandiText>
        <MandiText variant={compact ? 'priceLarge' : 'display'}>{formatMoney(available)}</MandiText>
        <MandiText variant="caption" color={Colors.textTertiary}>
          of {formatMoney(approvedLimit)} approved
        </MandiText>
      </View>

      {limit > 0 && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
      )}

      <View style={styles.grid}>
        <Cell
          label="Reserved"
          value={reserved}
          hint={compact ? undefined : 'Held for orders in flight'}
        />
        <Cell
          label="Utilized"
          value={utilized}
          hint={compact ? undefined : 'Drawn and not yet repaid'}
        />
      </View>

      {compact ? null : (
      <View style={styles.dueBlock}>
        <View style={styles.row}>
          <MandiText variant="body" color={Colors.textSecondary}>Due</MandiText>
          <MandiText variant="bodyEmphasis">{formatMoney(due)}</MandiText>
        </View>
        {!isOverdue && pastDueNote != null ? (
          <View style={styles.noteRow} testID="credit-past-due-note" accessible accessibilityLabel={pastDueNote}>
            <Ionicons name="warning" size={IconSize.sm} color={Colors.warning} />
            <MandiText variant="caption" color={Colors.warning} style={styles.noteText}>{pastDueNote}</MandiText>
          </View>
        ) : (
        <View style={styles.row}>
          <MandiText variant="caption" color={isOverdue ? Colors.danger : Colors.textTertiary}>
            {isOverdue ? 'of which overdue' : 'nothing overdue'}
          </MandiText>
          {isOverdue && (
            <MandiText variant="captionEmphasis" color={Colors.danger}>
              {formatMoney(overdue)}
            </MandiText>
          )}
        </View>
        )}
      </View>
      )}
    </View>
  );
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.cell}>
      <MandiText variant="caption" color={Colors.textSecondary}>{label}</MandiText>
      <MandiText variant="bodyEmphasis">{formatMoney(value)}</MandiText>
      {hint ? (
        <MandiText variant="caption" color={Colors.textTertiary}>{hint}</MandiText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  noteText: { flex: 1 },
  track: {
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: Radius.full, backgroundColor: Colors.credit },
  panel: {
    gap: Spacing.md,
    padding: Spacing.cardPadding,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  // No padding on a card that already has some, but still a band of its own:
  // butted against the heading, "Available to spend" reads as a third line of
  // the address rather than the start of the money.
  panelCompact: { gap: Spacing.sm, padding: 0, marginTop: Spacing.sm },
  headline: { gap: Spacing.xs },
  grid: { flexDirection: 'row', gap: Spacing.md },
  cell: { flex: 1, gap: Spacing.xs },
  dueBlock: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
