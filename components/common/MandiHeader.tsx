import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
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
  fallbackHref,
  leading,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
  fallbackHref?: string;
  /**
   * A thumbnail beside the titles — the thing this screen is about.
   * <p>It belongs here rather than in a card below, because a card that only
   * restates what the header already says reads as a second subject.
   */
  leading?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (fallbackHref) {
      router.replace(fallbackHref as any);
      return;
    }
    // Smart fallbacks when no history stack exists (e.g. page refresh or direct URL)
    if (pathname?.startsWith('/supplier/tracking/')) {
      router.replace('/supplier/orders' as any);
    } else if (pathname?.startsWith('/supplier/orders/')) {
      router.replace('/supplier/orders' as any);
    } else if (pathname?.startsWith('/supplier/credit/')) {
      router.replace('/supplier/credit' as any);
    } else if (pathname?.startsWith('/supplier/settlements/')) {
      router.replace('/supplier/settlements' as any);
    } else if (pathname?.startsWith('/supplier/settings/')) {
      router.replace('/supplier/more' as any);
    } else if (pathname?.startsWith('/supplier/')) {
      router.replace('/supplier' as any);
    } else if (pathname?.startsWith('/restaurant/tracking/')) {
      router.replace('/restaurant/orders' as any);
    } else if (pathname?.startsWith('/restaurant/order/') || pathname?.startsWith('/restaurant/orders/')) {
      router.replace('/restaurant/orders' as any);
    } else if (pathname?.startsWith('/restaurant/product/')) {
      router.replace('/restaurant/browse' as any);
    } else if (pathname?.startsWith('/restaurant/checkout/')) {
      router.replace('/restaurant/cart' as any);
    } else if (pathname?.startsWith('/restaurant/')) {
      router.replace('/restaurant' as any);
    } else {
      router.replace('/' as any);
    }
  };

  return (
    <View style={styles.header}>
      {back && (
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
      )}
      {leading}
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
