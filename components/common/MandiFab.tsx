import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Elevation, Radius, Spacing } from '@/theme';

/**
 * The one action a screen exists to enable, floating over its content.
 *
 * <p>Belongs on a list whose whole purpose is to grow — a catalog, an order book
 * — where the action has to stay reachable after scrolling past thirty rows. A
 * button in the toolbar is fine when the list is empty and useless once it is
 * not, which is the wrong way round.
 *
 * <p><b>It is positioned against its container, not the window.</b> On a tab
 * screen that container already ends where the tab bar begins, so a plain margin
 * is the right offset — adding the tab bar's height back would float it a
 * button's length up the screen, which is what an earlier version did.
 */
export function MandiFab({
  icon = 'add',
  onPress,
  accessibilityLabel,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Required: an icon-only control has no visible text to read out. */
  accessibilityLabel: string;
}) {
  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Ionicons name={icon} size={26} color={Colors.textInverse} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    right: Spacing.screenHorizontal,
    bottom: Spacing.lg,
    alignItems: 'flex-end',
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    ...Elevation.floating,
  },
  pressed: { opacity: 0.9 },
});
