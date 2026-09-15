import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MandiText } from './MandiText';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * The screen header.
 *
 * <p>Two shapes, because screens have two shapes. A tab root announces where you
 * are and carries the outlet switcher; a pushed screen carries a back affordance
 * and the title of the thing you opened. Both keep the same height so the content
 * below does not shift as you navigate.
 */
export function MandiHeader({
  title,
  subtitle,
  back = false,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      {back && (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
      )}
      <View style={styles.titles}>
        <MandiText variant={back ? 'bodyEmphasis' : 'title'} numberOfLines={1}>
          {title}
        </MandiText>
        {subtitle != null && (
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {subtitle}
          </MandiText>
        )}
      </View>
      {right}
    </View>
  );
}

/** A compact circular action for a header — cart, notifications. */
export function MandiHeaderAction({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** A count. Zero and null both render nothing — an empty badge is noise. */
  badge?: number | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} items` : label}
      style={styles.action}
    >
      <Ionicons name={icon} size={20} color={Colors.textPrimary} />
      {badge != null && badge > 0 && (
        <View style={styles.badge}>
          <MandiText variant="caption" color={Colors.textInverse} style={styles.badgeText}>
            {badge > 9 ? '9+' : String(badge)}
          </MandiText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    backgroundColor: Colors.background,
  },
  back: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.md,
  },
  titles: { flex: 1 },
  action: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { lineHeight: 18 },
});
