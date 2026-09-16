import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiText } from './MandiText';
import { Colors, Spacing } from '@/theme';

/**
 * Who this is for and where they are — the top of any card about a counterparty.
 *
 * <p>Shared rather than repeated because a supplier should read "who and where"
 * the same way wherever a restaurant appears. An order and a credit line are
 * different things, but the question a supplier asks first is identical, and two
 * implementations of one answer drift.
 *
 * <p>Only the title shares a row with the trailing chip. Wrapping both lines in
 * a column beside it narrows the second by the chip's width, and the second line
 * is the one that loses its last fact when it runs out of room.
 */
export function PartyHeading({
  primary,
  secondary,
  trailing,
}: {
  primary: string | null | undefined;
  /** Nulls are dropped rather than rendered as gaps — an absent fact stays absent. */
  secondary: (string | null | undefined)[];
  trailing?: React.ReactNode;
}) {
  const detail = secondary.filter(Boolean).join(' · ');

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <MandiText variant="bodyEmphasis" numberOfLines={1} style={styles.flex}>
          {primary || '—'}
        </MandiText>
        {trailing}
      </View>
      {detail ? (
        <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
          {detail}
        </MandiText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  flex: { flex: 1 },
});
