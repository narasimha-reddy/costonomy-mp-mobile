import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiSearchBar } from '@/components/common';
import { Colors, ControlHeight, IconSize, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * The search bar with an optional round button beside it. The bar keeps its own
 * rotating hint and navigation; the button is whatever quick entry the caller
 * passes (Quick Scan on Home), absent when that feature is not available.
 */
export function HomeSearchRow({
  hints,
  placeholder,
  onPressSearch,
  side,
}: {
  hints: readonly string[];
  placeholder: string;
  onPressSearch: () => void;
  side?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void } | null;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.bar}>
        <MandiSearchBar
          value=""
          onChangeText={() => {}}
          readOnly
          onPress={onPressSearch}
          placeholder={placeholder}
          rotatingHints={hints}
        />
      </View>
      {side && (
        <Pressable
          testID="home-search-side"
          onPress={side.onPress}
          accessibilityRole="button"
          accessibilityLabel={side.label}
          style={({ pressed }) => [styles.side, pressed && styles.pressed]}
        >
          <Ionicons name={side.icon} size={IconSize.lg} color={Colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const SIDE = Math.max(48, TouchTarget.min, ControlHeight.md);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bar: { flex: 1 },
  side: {
    width: SIDE,
    height: SIDE,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: { opacity: 0.7 },
});
