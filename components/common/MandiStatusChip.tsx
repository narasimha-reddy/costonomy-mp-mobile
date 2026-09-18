import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { MandiText } from './MandiText';

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'pending'
  | 'credit'
  | 'live'
  | 'stale';

interface MandiStatusChipProps {
  label: string;
  tone?: StatusTone;
  /** Overrides the tone's default icon. Pass `null` for no icon. */
  icon?: keyof typeof Ionicons.glyphMap | null;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  testID?: string;
}

/**
 * Tone → colour + icon.
 *
 * Every tone carries an icon as well as a colour. That is not decoration: §23A.48
 * forbids conveying information by colour alone, and an order's state is exactly
 * the kind of information a colour-blind user must not lose.
 */
export const TONES: Record<
  StatusTone,
  { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  neutral: { bg: Colors.surfaceSunken, fg: Colors.textSecondary, icon: 'ellipse-outline' },
  info: { bg: Colors.infoLight, fg: Colors.info, icon: 'information-circle' },
  success: { bg: Colors.successLight, fg: Colors.success, icon: 'checkmark-circle' },
  warning: { bg: Colors.warningLight, fg: Colors.warning, icon: 'alert-circle' },
  danger: { bg: Colors.dangerLight, fg: Colors.danger, icon: 'close-circle' },
  pending: { bg: Colors.warningLight, fg: Colors.warning, icon: 'time' },
  credit: { bg: Colors.creditLight, fg: Colors.credit, icon: 'card' },
  live: { bg: Colors.deliveryLiveLight, fg: Colors.deliveryLive, icon: 'navigate' },
  stale: { bg: Colors.staleBg, fg: Colors.stale, icon: 'cloud-offline' },
};

/**
 * A tone's colours, for the surfaces that carry the same meaning as a chip.
 *
 * <p>A card's accent stripe and a section's icon read as part of the same
 * system as the chip inside them only if they come from the same table. Two
 * tables would drift, and the drift would be a card edged in one colour above a
 * chip in another, both claiming to describe the same state.
 */
export function toneColors(tone: StatusTone): { bg: string; fg: string } {
  const { bg, fg } = TONES[tone];
  return { bg, fg };
}

/** A compact state pill. PRD §23A.3. Domain mappings live in `models/status.ts`. */
export function MandiStatusChip({
  label,
  tone = 'neutral',
  icon,
  size = 'md',
  style,
  testID,
}: MandiStatusChipProps) {
  const config = TONES[tone];
  const glyph = icon === null ? null : (icon ?? config.icon);

  return (
    <View
      testID={testID}
      // The chip reads as one unit rather than an icon and a stray word.
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          backgroundColor: config.bg,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? Spacing.sm : Spacing.md,
        },
        style,
      ]}
    >
      {glyph && (
        <Ionicons
          name={glyph}
          size={size === 'sm' ? IconSize.xs : IconSize.sm}
          color={config.fg}
        />
      )}
      <MandiText variant="label" color={config.fg} numberOfLines={1}>
        {label}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    borderRadius: Radius.full,
  },
});

export default MandiStatusChip;
