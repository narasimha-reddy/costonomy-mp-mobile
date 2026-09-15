import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Colors, Elevation, Radius, Spacing, type ElevationToken } from '@/theme';

interface MandiCardProps {
  children: React.ReactNode;
  /** Makes the whole card a single tap target. */
  onPress?: () => void;
  elevation?: ElevationToken;
  /** Tighter padding for dense list rows. */
  compact?: boolean;
  /** Draws a 1px border instead of a shadow — for cards on a white background. */
  outlined?: boolean;
  /** Left accent stripe, e.g. countdown urgency on a supplier's new-order card. */
  accentColor?: string;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
}

/** The container every piece of grouped content sits in. PRD §23A.3. */
export function MandiCard({
  children,
  onPress,
  elevation = 'card',
  compact = false,
  outlined = false,
  accentColor,
  style,
  testID,
  accessibilityLabel,
}: MandiCardProps) {
  // How the caller wants this card sized has to land on the outermost element.
  // A pressable card is wrapped in a Pressable, and a width left on the inner
  // View sizes the card inside a wrapper that has already shrunk to its content
  // — which is how a `width: '31%'` grid renders as a column of slivers.
  const [outer, inner] = splitLayout(style);

  const body = (
    <View
      style={[
        styles.card,
        outlined ? styles.outlined : Elevation[elevation],
        { padding: compact ? Spacing.cardPaddingCompact : Spacing.cardPadding },
        accentColor != null && {
          borderLeftWidth: 3,
          borderLeftColor: accentColor,
          paddingLeft: (compact ? Spacing.cardPaddingCompact : Spacing.cardPadding) - 3,
        },
        inner,
        // Fill the wrapper when the wrapper is the one that was sized.
        onPress != null && outer != null ? styles.fill : null,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [outer, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** Layout properties belong on the outer element; everything else stays visual. */
const LAYOUT_KEYS = [
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'flex', 'flexBasis', 'flexGrow', 'flexShrink', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'position', 'top', 'bottom', 'left', 'right',
] as const satisfies readonly (keyof ViewStyle)[];

function splitLayout(style?: ViewStyle): [ViewStyle | undefined, ViewStyle | undefined] {
  if (style == null) return [undefined, undefined];

  const outer: ViewStyle = {};
  const inner: ViewStyle = {};
  let sawLayout = false;

  (Object.keys(style) as (keyof ViewStyle)[]).forEach((key) => {
    if ((LAYOUT_KEYS as readonly string[]).includes(key as string)) {
      sawLayout = true;
      Object.assign(outer, { [key]: style[key] });
    } else {
      Object.assign(inner, { [key]: style[key] });
    }
  });

  return [sawLayout ? outer : undefined, Object.keys(inner).length ? inner : undefined];
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: { opacity: 0.9 },
});

export default MandiCard;
