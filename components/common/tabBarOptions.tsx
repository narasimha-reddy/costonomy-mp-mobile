import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { Colors, FontFamily, FontSize } from '@/theme';

/**
 * One tab bar, shared by both experiences.
 *
 * <p><b>The height has to be computed, not defaulted.</b> The default bar is
 * sized for its own content and the safe-area inset is then added inside it, so
 * the label ends up in the padding. A fixed content height plus whatever the
 * device asks for underneath is the only arrangement that holds on a phone with
 * a home indicator and in a browser with none.
 *
 * <p><b>The label is ours, not react-navigation's.</b> Its own label renders in
 * an `overflow: hidden` box sized to the glyphs — 9px for an 11px face — which
 * clips every descender, and neither `lineHeight` nor `height` in
 * `tabBarLabelStyle` survives to fix it. Rendering the text ourselves is both
 * shorter than fighting it and the only way the tab labels use the same type
 * ramp as the rest of the app.
 */
const CONTENT_HEIGHT = 64;

export function tabBarOptions(insets: EdgeInsets) {
  // A browser reports no bottom inset but the bar still needs clearance from the
  // frame edge; a device reports its indicator and needs exactly that.
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 0);

  return {
    tabBarShowLabel: true,
    tabBarActiveTintColor: Colors.primary,
    tabBarInactiveTintColor: Colors.textTertiary,
    tabBarStyle: {
      height: CONTENT_HEIGHT + bottom,
      paddingTop: 8,
      paddingBottom: bottom + 6,
      backgroundColor: Colors.surface,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    tabBarIconStyle: { marginTop: 0 },
    tabBarItemStyle: { paddingVertical: 0 },
    sceneStyle: { backgroundColor: Colors.background },
  } as const;
}

/** A tab label with room for its own descenders. */
export function tabLabel(title: string) {
  return function TabLabel({ color }: { color: string }) {
    // No `numberOfLines`: react-native-web implements it with `-webkit-line-clamp`
    // on a `-webkit-box`, which sizes the box to the glyphs and clips descenders
    // regardless of `lineHeight`. Five short words do not need clamping anyway.
    return <Text style={[styles.label, { color }]}>{title}</Text>;
  };
}

const styles = StyleSheet.create({
  label: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs + 5,
    marginTop: 3,
    textAlign: 'center',
  },
});
