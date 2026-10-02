import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme';
import { MandiText } from './MandiText';

/**
 * What kind of thing this card is — a request, or an order.
 *
 * <p>The two cards are deliberately laid out alike, because a request and the
 * order it becomes are two stages of one thing and a reader should not have to
 * re-learn where to look. That similarity is what makes this label worth its
 * line: on a screen carrying both — the restaurant's home, where Open Requests
 * sits above Active Orders — the reference number was the only thing saying
 * which was which, and `RQ-` against `MP-` is a distinction you have to know to
 * read.
 *
 * <p><b>Neutral on purpose.</b> Every one of these cards already closes with a
 * status chip that uses colour to mean something. A second coloured badge at
 * the top would read as a second status, so this one is grey and says only what
 * the card is.
 */
export function MandiCardKind({ kind }: { kind: 'REQUEST' | 'ORDER' }) {
  return (
    <View style={styles.label}>
      <MandiText variant="caption" color={Colors.textSecondary} style={styles.text}>
        {kind}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceSunken,
  },
  // Small, spaced and upper case: it is a category, read once, not a heading.
  text: { fontSize: 10, letterSpacing: 0.8 },
});

export default MandiCardKind;
