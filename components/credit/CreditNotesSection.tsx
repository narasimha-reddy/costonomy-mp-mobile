import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiCard, MandiText } from '@/components/common';
import { creditNoteLine } from '@/lib/credit/creditNotes';
import { istDayMonth } from '@/lib/credit/istFormat';
import type { CreditNote } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

/** One credit note or write-off: number, why in plain words, the amount and the India date. */
export function CreditNoteRow({ note }: { note: CreditNote }) {
  const line = creditNoteLine(note);
  const day = istDayMonth(note.createdAt) ?? '';
  return (
    <MandiCard
      compact
      testID={`credit-note-${note.id}`}
    >
      <View style={styles.top}>
        <MandiText variant="bodyEmphasis" style={styles.flex} numberOfLines={1}>{line.title}</MandiText>
        <MandiText variant="bodyEmphasis">{formatMoney(note.amount)}</MandiText>
      </View>
      <MandiText variant="caption" color={Colors.textSecondary}>{line.reason}</MandiText>
      {line.detail != null && <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={3}>{line.detail}</MandiText>}
      <MandiText variant="caption" color={Colors.textTertiary}>{[note.invoiceNumber, day].filter(Boolean).join(' · ')}</MandiText>
    </MandiCard>
  );
}

/** A section header that folds. */
export function CreditNotesFold({ title, open, onPress }: { title: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID="credit-notes-toggle"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      style={styles.fold}
    >
      <MandiText variant="bodyEmphasis" style={styles.flex}>{title}</MandiText>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={IconSize.sm} color={Colors.textTertiary} />
    </Pressable>
  );
}

/**
 * The credit notes on one invoice (the invoice detail's `creditNotes`), collapsed until opened.
 * Shown to both sides; nothing here when there are none.
 */
export function CreditNotesSection({ notes }: { notes: readonly CreditNote[] | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (notes == null || notes.length === 0) return null;
  return (
    <View style={styles.section} testID="credit-notes">
      <CreditNotesFold title={`Credit notes (${notes.length})`} open={open} onPress={() => setOpen((v) => !v)} />
      {open && notes.map((n) => <CreditNoteRow key={n.id} note={n} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.listGap },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fold: { flexDirection: 'row', alignItems: 'center', minHeight: TouchTarget.min, gap: Spacing.sm },
});
