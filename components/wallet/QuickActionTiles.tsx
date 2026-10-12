import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiSectionHeader } from '@/components/common/MandiSectionHeader';
import { MandiText } from '@/components/common/MandiText';
import { Colors, Elevation, Radius, Spacing, TouchTarget } from '@/theme';

/** Columns in the grid. Icons keep the same size and place whether 1 or 4 are filled. */
export const MONEY_TRANSFER_COLUMNS = 4;

const DISC = 64;
// Ionicons glyphs fill about 47 percent of their box at this size, as the QR glyph does.
const GLYPH = 30;
// The attention dot: 10dp, ringed in white so it reads against the orange disc.
const BADGE = 10;
const BADGE_RING = 2;

export interface MoneyAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * A custom glyph (an SVG) drawn instead of the Ionicons `icon`. It is given the DIAMETER of
   * the circle it sits in and scales its own glyph (ScanQrIcon does).
   */
  renderIcon?: (circleDiameter: number) => React.ReactNode;
  onPress: () => void;
  /** False leaves the action out and the rest close up, in order. */
  visible: boolean;
  accessibilityLabel?: string;
  /**
   * A small red dot on the disc. Never the only signal: the caller words it into
   * `accessibilityLabel`, and this component appends nothing of its own.
   */
  badge?: boolean;
}

interface QuickActionTilesProps {
  actions: MoneyAction[];
}

/**
 * The "Money transfers" section of Home: one panel, one row of four equal
 * columns, each a round icon over a centred label.
 *
 * <p>Data-driven — adding an action is one more entry in `actions`. Hidden
 * actions drop out and the visible ones take the first slots; unfilled slots are
 * empty spacers so a lone icon is the same size and in the same place as it will
 * be when the row is full. The row has a maximum width so columns do not spread
 * across a wide web window.
 */
export function QuickActionTiles({ actions }: QuickActionTilesProps) {
  const shown = actions.filter((a) => a.visible).slice(0, MONEY_TRANSFER_COLUMNS);
  const spacers = Array.from({ length: MONEY_TRANSFER_COLUMNS - shown.length }, (_, i) => i);

  return (
    <View style={styles.section} testID="money-transfers">
      <MandiSectionHeader title="Money transfers" />
      <View style={styles.panel}>
        <View style={styles.row}>
          {shown.map((action) => (
            <Pressable
              key={action.key}
              testID={`action-${action.key}`}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel ?? action.label}
              style={({ pressed }) => [styles.column, pressed && styles.pressed]}
            >
              <View style={styles.disc}>
                {action.renderIcon != null
                  ? action.renderIcon(DISC)
                  : <Ionicons name={action.icon} size={GLYPH} color={Colors.white} />}
                {action.badge === true && <View testID={`action-${action.key}-badge`} style={styles.badge} />}
              </View>
              <MandiText variant="captionEmphasis" center style={styles.label}>
                {action.label}
              </MandiText>
            </Pressable>
          ))}
          {spacers.map((i) => (
            <View key={`spacer-${i}`} style={styles.column} testID="action-spacer" />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { alignSelf: 'stretch' },
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.cardPadding,
    paddingHorizontal: Spacing.sm,
    ...Elevation.card,
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'flex-start',
  },
  column: {
    flex: 1,
    flexBasis: 0,
    minHeight: TouchTarget.min + 4,
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    gap: Spacing.sm,
  },
  pressed: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: BADGE + BADGE_RING * 2,
    height: BADGE + BADGE_RING * 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    borderWidth: BADGE_RING,
    borderColor: Colors.white,
  },
  label: { alignSelf: 'stretch' },
});
