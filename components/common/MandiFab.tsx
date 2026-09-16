import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MandiText } from './MandiText';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

/**
 * The one action a screen exists to enable, floating over its content.
 *
 * <p>Belongs on a list whose whole purpose is to grow — a catalog, an order book
 * — where the action has to stay reachable after scrolling past thirty rows. A
 * button in the toolbar is fine when the list is empty and useless once it is
 * not, which is the wrong way round.
 *
 * <p><b>It clears the tab bar and the home indicator.</b> Absolute positioning
 * inside a tab screen puts it at the screen's bottom, not the content's, so the
 * inset and the bar height both have to be added back or it sits under them.
 */
export function MandiFab({
  icon = 'add',
  label,
  onPress,
  accessibilityLabel,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  /** Turns it into an extended FAB. Keep it to two words. */
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { bottom: TAB_BAR_CLEARANCE + insets.bottom }]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.fab,
          label != null && styles.extended,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name={icon} size={24} color={Colors.textInverse} />
        {label != null && (
          <MandiText variant="bodyEmphasis" color={Colors.textInverse}>{label}</MandiText>
        )}
      </Pressable>
    </View>
  );
}

/** Matches the tab bar's content height in `tabBarOptions`, plus a gap. */
const TAB_BAR_CLEARANCE = 64 + Spacing.lg;

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    right: Spacing.screenHorizontal,
    alignItems: 'flex-end',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    ...Elevation.floating,
  },
  extended: { width: 'auto', paddingHorizontal: Spacing.xl },
  pressed: { opacity: 0.9 },
});
