import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/contexts/StoreProvider';
import { useNotifications } from '@/hooks/useNotifications';
import { MandiHeaderAction, MandiText } from '@/components/common';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/**
 * The header every supplier tab wears.
 *
 * <p>One component rather than five, so the notification bell cannot be present
 * on Home and missing on Catalog — which is exactly what happened when each tab
 * built its own.
 *
 * <p><b>It shows the business, not the product.</b> "Mandi Supplier" told a
 * supplier nothing they did not already know and, truncated to "Mandi Supp…" on a
 * narrow screen, told them less than nothing. The trading name is the useful
 * fact — it is what restaurants see on their orders, and on an account with more
 * than one store it is the thing that stays constant.
 *
 * <p>The store sits beneath it as a switcher, and only when there is a choice to
 * make: a single-store supplier gets a label, because a picker with one option is
 * noise on every screen in the app.
 */
export function SupplierHeader({
  subtitle,
  trailing,
}: {
  /** Overrides the store line — used where the screen itself names the store. */
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const { supplier, store, stores, select } = useStore();
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);

  const title = supplier?.displayName ?? store?.name ?? 'Your business';
  const multiStore = stores.length > 1;

  // The second line answers "where am I", and on a multi-store account it also
  // has to answer "which store". A section name behind a storefront icon reads
  // as the name of a store, so the icon appears only when a store is named.
  const section = subtitle;
  const storeName = store?.name;
  const line = multiStore || section == null
    ? [section, storeName].filter(Boolean).join(' · ')
    : section;
  const namesStore = line.includes(storeName ?? '\u0000');

  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        <MandiText variant="title" numberOfLines={1}>{title}</MandiText>

        {line !== '' && (
          <Pressable
            onPress={() => multiStore && setOpen(true)}
            disabled={!multiStore}
            accessibilityRole={multiStore ? 'button' : 'text'}
            accessibilityLabel={multiStore ? `${line}. Change store` : line}
            style={styles.storeRow}
          >
            {namesStore && (
              <Ionicons name="storefront-outline" size={13} color={Colors.textSecondary} />
            )}
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
              {line}
            </MandiText>
            {multiStore && (
              <Ionicons name="chevron-down" size={12} color={Colors.textSecondary} />
            )}
          </Pressable>
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
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.scrim}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close the store list"
        >
          <Pressable
            style={styles.sheet}
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            accessibilityLabel="Choose a store"
          >
            <MandiText variant="subtitle">Choose a store</MandiText>
            <ScrollView>
              {stores.map((option) => {
                const active = option.id === store?.id;
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
          </Pressable>
        </Pressable>
      </Modal>
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
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  scrim: { flex: 1, backgroundColor: Colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    maxHeight: '70%',
    gap: Spacing.sm,
  },
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
