import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOutlet } from '@/contexts/OutletProvider';
import { useCart } from '@/hooks/useCart';
import { useNotifications } from '@/hooks/useNotifications';
import { placeLabel } from '@/utils/placeName';
import { MandiBottomSheet, MandiHeaderAction, MandiText } from '@/components/common';
import { track } from '@/analytics';
import { Colors, Spacing, TouchTarget } from '@/theme';

/**
 * The header every restaurant tab wears. The mirror of `SupplierHeader`.
 *
 * <p><b>The outlet leads, the restaurant follows.</b> A cook orders for one
 * kitchen at a time, and "which outlet is this cart for" is the question the
 * header has to answer before any other — a wrong answer there sends a delivery
 * to the wrong address. The restaurant's name sits beneath it because it is a
 * thing nobody forgets.
 *
 * <p>The outlet is also the switcher, and only when there is more than one:
 * most restaurants have a single outlet, and a picker with one option is noise on
 * every screen in the app.
 *
 * <p>One component rather than five, so the cart badge cannot be present on Home
 * and missing on Discover — which is what happened when each tab built its own
 * header, and it meant a cook could add to a cart and then lose sight of it.
 */
export function RestaurantHeader({
  screen,
  subtitle,
  trailing,
}: {
  /**
   * The doc 05 code of the screen wearing this header, e.g. `REST-ORDERS-01`.
   *
   * <p>Required rather than derived: the cart is now reachable from five screens
   * instead of one, and "opened the cart" is only worth recording if it says from
   * where. A route path would answer the same question in a second vocabulary.
   */
  screen: string;
  /** The section, when the screen is one — "Orders", "Requirements". */
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const { outlet, outlets, restaurantName, select } = useOutlet();
  const { itemCount } = useCart();
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);

  const multiOutlet = outlets.length > 1;
  const title = placeLabel(outlet?.name, restaurantName) ?? restaurantName ?? 'Your restaurant';
  const line = [subtitle, outlet?.name ? restaurantName : null].filter(Boolean).join(' · ');

  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        <Pressable
          onPress={() => multiOutlet && setOpen(true)}
          disabled={!multiOutlet}
          accessibilityRole={multiOutlet ? 'button' : 'header'}
          accessibilityLabel={multiOutlet ? `${title}. Change outlet` : title}
          style={styles.titleRow}
        >
          <MandiText variant="title" numberOfLines={1} style={styles.titleText}>{title}</MandiText>
          {multiOutlet && (
            <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
          )}
        </Pressable>

        {line !== '' && (
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
            {line}
          </MandiText>
        )}
      </View>

      <View style={styles.actions}>
        {trailing}
        <MandiHeaderAction
          icon="notifications-outline"
          label="Notifications"
          badge={unreadCount}
          onPress={() => router.push('/notifications')}
        />
        <MandiHeaderAction
          icon="cart-outline"
          label="Cart"
          badge={itemCount}
          onPress={() => {
            track('open_cart', { screen, outletId: outlet?.id ?? null });
            router.push('/restaurant/cart');
          }}
        />
      </View>

      <MandiBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Choose an outlet"
        closeLabel="Close the outlet list"
      >
        <ScrollView>
          {outlets.map((option) => {
            const active = option.id === outlet?.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  select(option.id);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={styles.option}
              >
                <View style={styles.optionText}>
                  <MandiText variant="bodyEmphasis">{option.name}</MandiText>
                  <MandiText variant="caption" color={Colors.textSecondary}>
                    {[option.addressLine1, option.city].filter(Boolean).join(', ')}
                  </MandiText>
                </View>
                {active && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </MandiBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    minHeight: 60,
    backgroundColor: Colors.background,
  },
  identity: { flex: 1, gap: 2 },
  // The row wraps the title rather than filling the header, so the chevron sits
  // against the name it belongs to rather than drifting to the far margin.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  // Shrink, not grow: a long outlet name gives way and truncates, and the
  // chevron stays beside it instead of being pushed off the end.
  titleText: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    minHeight: TouchTarget.min,
  },
  optionText: { flex: 1, gap: Spacing.xs },
});
