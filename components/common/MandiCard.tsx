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

  // Android can flatten a View that only draws a background (or merge it into its
  // parent's layer), and an elevated, clipped, rounded View is the one most often
  // caught by that: the box paints, its children do not, until the next layout
  // pass. `collapsable={false}` keeps a real native view for the card body and for
  // the Pressable's wrapper. It has no visual effect and is ignored on iOS and web.
  // The accent is a separate absolutely positioned stripe rather than a one-sided
  // border, so the card keeps one uniform border and radius.
  const body = (
    <View
      collapsable={false}
      testID={onPress ? undefined : testID}
      style={[
        styles.card,
        outlined ? styles.outlined : Elevation[elevation],
        { padding: compact ? Spacing.cardPaddingCompact : Spacing.cardPadding },
        inner,
        // Fill the wrapper when the wrapper is the one that was sized.
        onPress != null && outer != null ? styles.fill : null,
      ]}
    >
      {accentColor != null && (
        <View
          pointerEvents="none"
          collapsable={false}
          testID={testID ? `card-accent-${testID}` : 'card-accent'}
          style={[styles.accent, { backgroundColor: accentColor }]}
        />
      )}
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
      collapsable={false}
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
  accent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
  },
  pressed: { opacity: 0.9 },
});

export default MandiCard;
