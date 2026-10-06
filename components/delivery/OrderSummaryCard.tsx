import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiChatAction, MandiText } from '@/components/common';
import { Colors, Elevation, IconSize, Radius, Spacing, TouchTarget } from '@/theme';

export interface SummaryLine {
  id: number | string;
  name: string;
  quantity: string;
}

/**
 * One card for the facts around the delivery: the order number with what is in it (folds open), where it is going,
 * and a way to ask the other party about it. The partner is reached from their own card, not from here.
 */
export function OrderSummaryCard({
  orderNumber, summary, lines, total, deliveringTo, chat,
}: {
  orderNumber: string;
  /** "3 items · ₹1,486.80". */
  summary: string;
  lines: SummaryLine[];
  total: string;
  deliveringTo: string | null;
  chat: {
    outletId: number | null | undefined;
    supplierStoreId: number | null | undefined;
    side: 'RESTAURANT' | 'SUPPLIER';
    orderId: number;
  };
}) {
  const [open, setOpen] = useState(false);
  const other = chat.side === 'RESTAURANT' ? 'the supplier' : 'the restaurant';
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`Order ${orderNumber}, ${summary}`}
        accessibilityState={{ expanded: open }}
        style={styles.row}
      >
        <MandiText variant="bodyEmphasis" style={styles.flex} numberOfLines={1}>{`Order ${orderNumber}`}</MandiText>
        <MandiText variant="body" color={Colors.textSecondary}>{summary}</MandiText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={IconSize.sm} color={Colors.textSecondary} />
      </Pressable>
      {open && (
        <View style={styles.lines}>
          {lines.map((line) => (
            <View key={line.id} style={styles.line}>
              <MandiText variant="body" style={styles.flex}>{line.name}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>{line.quantity}</MandiText>
            </View>
          ))}
          <View style={styles.line}>
            <MandiText variant="bodyEmphasis">Total</MandiText>
            <MandiText variant="bodyEmphasis">{total}</MandiText>
          </View>
        </View>
      )}
      {deliveringTo != null && deliveringTo !== '' && (
        <>
          <View style={styles.divider} />
          <View style={styles.plain}>
            <MandiText variant="body" color={Colors.textSecondary}>Delivering to</MandiText>
            <MandiText variant="body" style={styles.right}>{deliveringTo}</MandiText>
          </View>
        </>
      )}
      <MandiChatAction
        outletId={chat.outletId}
        supplierStoreId={chat.supplierStoreId}
        side={chat.side}
        suggest={{ type: 'ORDER', id: chat.orderId }}
      >
        {({ onPress, label }) => (
          <>
            <View style={styles.divider} />
            <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.row}>
              <MandiText variant="body" color={Colors.textSecondary} style={styles.flex}>Need help?</MandiText>
              <MandiText variant="bodyEmphasis" color={Colors.primaryDark}>{`Chat with ${other}`}</MandiText>
              <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.primaryDark} />
            </Pressable>
          </>
        )}
      </MandiChatAction>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg - 2,
    paddingVertical: Spacing.xs,
    ...Elevation.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TouchTarget.min },
  plain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: TouchTarget.min - Spacing.sm },
  flex: { flex: 1 },
  right: { flex: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.divider },
  lines: { gap: Spacing.xs, paddingBottom: Spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
});
