import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/contexts/StoreProvider';
import { placeLabel } from '@/utils/placeName';
import { useNotifications } from '@/hooks/useNotifications';
import { useChatThreads } from '@/hooks/useChat';
import {
  MandiBottomSheet,
  MandiHeaderAction,
  MandiText,
  useToast,
} from '@/components/common';
import { Colors, Spacing, TouchTarget } from '@/theme';

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
  /** The section, when the screen is one — "Catalog", "Orders". */
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const { supplier, store, stores, select } = useStore();
  const { unreadCount } = useNotifications();
  const { unreadCount: chatUnread, enabled: chatEnabled } = useChatThreads('SUPPLIER', store?.id ?? null);
  const toast = useToast();
  const [open, setOpen] = useState(false);

  // The store leads, the business follows.
  //
  // A supplier with three stores works in one of them at a time, and the answer
  // to "where am I" was the small grey line while the answer to "who am I" — a
  // thing nobody forgets — was the headline. The storefront icon went with it:
  // once the store is the title, an icon saying "this is a store" is decoration.
  const multiStore = stores.length > 1;
  const business = supplier?.displayName ?? null;
  const title = placeLabel(store?.name, business) ?? business ?? 'Your business';
  const line = [subtitle, store?.name ? business : null].filter(Boolean).join(' · ');

  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        {/* The switcher is on the title now, because the title is the store.
            One store and there is nothing to switch between, so it is a heading
            rather than a control that does nothing. */}
        <Pressable
          onPress={() => multiStore && setOpen(true)}
          disabled={!multiStore}
          accessibilityRole={multiStore ? 'button' : 'header'}
          accessibilityLabel={multiStore ? `${title}. Change store` : title}
          style={styles.titleRow}
        >
          {/* A step down from `title`. At 22px a name like "Sri Suppliers -
              Gachibowli" ran the width of the header and sat against the
              action icons with nothing between them. `sectionTitle` is the
              same weight one size smaller, so the heading still reads as the
              heading without crowding the controls beside it. */}
          <MandiText variant="sectionTitle" numberOfLines={1} style={styles.titleText}>
            {title}
          </MandiText>
          {multiStore && (
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
        {/* Chat sits before the bell: a message is somebody waiting on an
            answer, and notifications are mostly the system telling you what it
            did. Disabled rather than hidden when chat is off for this account —
            a control that vanishes is a bug, one that explains itself is a
            decision (D-095). */}
        <MandiHeaderAction
          icon="chatbubble-ellipses-outline"
          label="Messages"
          badge={chatUnread}
          onPress={() => {
            if (!chatEnabled) {
              toast.show(
                'Chat is turned off for this account. Contact Costonomy support if you need it.',
                'info',
              );
              return;
            }
            router.push(`/chat?storeId=${store?.id ?? ''}`);
          }}
        />
        <MandiHeaderAction
          icon="notifications-outline"
          label="Notifications"
          badge={unreadCount}
          onPress={() => router.push('/notifications')}
        />
      </View>

      <MandiBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Choose a store"
        closeLabel="Close the store list"
      >
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
  // against the name it belongs to. Filling, it drifted to the far edge and read
  // as an unrelated control — the gap beside "Whitefield" was the whole header.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  // Shrink, not grow: a long store name gives way and truncates, and the chevron
  // stays beside it instead of being pushed off the end.
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
