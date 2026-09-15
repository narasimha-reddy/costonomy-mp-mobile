import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification, NotificationCategory } from '@/models/notification';
import {
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { track } from '@/analytics';
import { Colors, Radius, Spacing } from '@/theme';

const SCREEN = 'REST-NOTIF-01';

const FACES: Record<NotificationCategory, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  ORDERS: { icon: 'receipt-outline', tint: Colors.primary },
  APPROVALS: { icon: 'checkmark-circle-outline', tint: Colors.warning },
  PAYMENTS: { icon: 'card-outline', tint: Colors.info },
  CREDIT: { icon: 'wallet-outline', tint: Colors.info },
  DELIVERY: { icon: 'navigate-outline', tint: Colors.success },
  MARKETPLACE: { icon: 'megaphone-outline', tint: Colors.textSecondary },
};

/**
 * REST-NOTIF-01 / the supplier's equivalent. Doc 05 §22.
 *
 * <p>Shared by both experiences: a notification is a notification, and the
 * category decides its face. It lives outside both route trees for that reason.
 *
 * <p><b>Tapping one goes to the thing, not to a copy of it.</b> The notification
 * carries `targetType` and `targetId`; the screen it opens re-reads that resource
 * from its own endpoint. The notification body is a summary written when the
 * event happened and may already be out of date — the order it points at is not.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications, unreadCount, loading, error, refetch, isRefetching,
    markRead, markAllRead, markingAll,
  } = useNotifications();

  function open(notification: AppNotification) {
    if (!notification.read) markRead(notification.id);
    track('notification_opened', { screen: SCREEN, entityId: notification.id },
      { category: notification.category });

    const target = destinationFor(notification);
    if (target) router.push(target);
  }

  return (
    <MandiScreen
      header={
        <MandiHeader
          title="Notifications"
          subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
          back
        />
      }
      onRefresh={() => refetch()}
      refreshing={isRefetching}
    >
      {loading ? (
        <MandiSkeletonList count={4} />
      ) : error ? (
        <MandiErrorState message="Couldn't load notifications." onRetry={() => refetch()} />
      ) : notifications.length === 0 ? (
        <MandiEmptyState
          icon="notifications-outline"
          title="Nothing yet"
          description="Order responses, deliveries, payments and credit decisions land here."
        />
      ) : (
        <>
          {unreadCount > 0 && (
            <MandiButton
              label="Mark all as read"
              variant="tertiary"
              size="md"
              loading={markingAll}
              onPress={() => markAllRead()}
            />
          )}

          {notifications.map((notification) => {
            const face = FACES[notification.category] ?? FACES.MARKETPLACE;
            return (
              <MandiCard
                key={notification.id}
                onPress={() => open(notification)}
                accentColor={notification.read ? undefined : face.tint}
              >
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: Colors.surfaceSunken }]}>
                    <Ionicons name={face.icon} size={18} color={face.tint} />
                  </View>
                  <View style={styles.body}>
                    <MandiText variant={notification.read ? 'body' : 'bodyEmphasis'}>
                      {notification.title}
                    </MandiText>
                    {notification.body && (
                      <MandiText variant="caption" color={Colors.textSecondary}>
                        {notification.body}
                      </MandiText>
                    )}
                    <MandiText variant="caption" color={Colors.textTertiary}>
                      {relativeTime(notification.createdAt)}
                      {/* Unread is stated, not just coloured — §36. */}
                      {notification.read ? '' : ' · unread'}
                    </MandiText>
                  </View>
                </View>
              </MandiCard>
            );
          })}
        </>
      )}
    </MandiScreen>
  );
}

/**
 * Where a notification leads.
 *
 * <p>Returns null when this build has no screen for that target — a notification
 * that cannot be opened still reads, rather than navigating somewhere wrong.
 * Mobile releases lag the API, so an unknown target is expected, not exceptional.
 */
function destinationFor(notification: AppNotification): string | null {
  if (notification.targetId == null) return null;
  switch (notification.targetType) {
    case 'SUPPLIER_ORDER':
      return `/restaurant/orders/${notification.targetId}`;
    case 'DELIVERY':
      return `/restaurant/tracking/${notification.targetId}`;
    case 'PROCUREMENT':
      return `/restaurant/checkout/${notification.targetId}`;
    case 'CREDIT_AGREEMENT':
      return `/restaurant/credit/${notification.targetId}`;
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md },
  icon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: Spacing.xs },
});
