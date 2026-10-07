import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { MandiText } from './MandiText';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface DetailRow {
  key: string;
  icon: IoniconName;
  title: string;
  subtitle?: string | null;
  /** Trailing slot: a "Track ›" link, a chip, a chevron. Never shrinks. */
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * A white card of icon rows with hairline dividers.
 *
 * <p>Each row is at least 56dp tall, the title is one line and the subtitle wraps
 * to two. The text column is the one that shrinks (`minWidth: 0`) and the trailing
 * slot is not, so a 200-character address cannot push the title or the action out.
 * Not the key/value `DetailRow` in components/restaurant, which stays.
 */
export function DetailRowCard({ rows }: { rows: DetailRow[] }) {
  return (
    <View style={styles.card}>
      {rows.map((row, i) => {
        const body = (
          <>
            <Ionicons name={row.icon} size={IconSize.lg} color={Colors.textSecondary} />
            <View style={styles.text} testID={`detail-row-text-${row.key}`}>
              <MandiText variant="bodyEmphasis" numberOfLines={1}>{row.title}</MandiText>
              {row.subtitle ? (
                <MandiText variant="caption" muted numberOfLines={2}>{row.subtitle}</MandiText>
              ) : null}
            </View>
            {row.right != null && (
              <View style={styles.right} testID={`detail-row-right-${row.key}`}>{row.right}</View>
            )}
          </>
        );
        const rowStyle = [styles.row, i > 0 && styles.divider];
        return row.onPress ? (
          <Pressable
            key={row.key}
            testID={`detail-row-${row.key}`}
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={row.accessibilityLabel}
            style={rowStyle}
          >
            {body}
          </Pressable>
        ) : (
          <View
            key={row.key}
            testID={`detail-row-${row.key}`}
            accessible={row.accessibilityLabel != null}
            accessibilityLabel={row.accessibilityLabel}
            style={rowStyle}
          >
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  text: { flex: 1, minWidth: 0 },
  right: { flexShrink: 0 },
});
