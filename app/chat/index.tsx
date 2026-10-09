import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useChatThreads } from '@/hooks/useChat';
import { useSession } from '@/contexts/SessionProvider';
import {
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import { formatAgeOrMoment } from '@/utils/dateRange';
import { Colors, Radius, Spacing } from '@/theme';

/**
 * Every conversation this account has. D-095.
 *
 * <p>One screen for both roles: the list is the same, and the server already
 * answers from the reader's side, so a kitchen sees store names and a store
 * sees outlet names from the same rows.
 *
 * <p><b>Nothing is started from here.</b> A conversation belongs to a supplier
 * you already trade with, so it is opened from that supplier's shelf or from an
 * order — which is also where somebody is standing when they need to ask
 * something.
 */
export default function ChatInboxScreen() {
  const router = useRouter();
  const { audience } = useSession();
  /**
   * Which side, and whose inbox, comes from the route.
   *
   * <p>This screen sits above both role navigators, so neither
   * `OutletProvider` nor `StoreProvider` exists here — the header that opened
   * it knows the selected outlet or store and says so in the link.
   */
  const { outletId, storeId } = useLocalSearchParams<{
    outletId?: string;
    storeId?: string;
  }>();
  const side = storeId ? 'SUPPLIER' : 'RESTAURANT';
  const scopeId = Number(storeId || outletId);
  const hasScope = Number.isFinite(scopeId) && scopeId > 0;
  // router.back() does nothing when this page was opened directly (a refresh or a link): go to the role's home then.
  const goBack = () => {
    const noHistory = router.canGoBack?.() === false
      || (typeof window !== 'undefined' && (window.history?.length ?? 2) <= 1);
    if (!noHistory) return router.back();
    router.replace(audience === 'SUPPLIER' ? '/supplier' : audience === 'RESTAURANT' || audience === 'BOTH' ? '/restaurant' : '/');
  };
  const { threads, loading, error, refetch } = useChatThreads(side, hasScope ? scopeId : null);

  return (
    <MandiScreen
      header={<MandiHeader title="Messages" back />}
      onRefresh={() => refetch()}
    >
      {!hasScope ? (
        // No outlet or store in the link: the query is disabled, so "loading" would never end.
        <MandiEmptyState
          icon="chatbubbles-outline"
          title="Choose where to read messages from"
          description="Open Messages from your outlet or store so we know whose conversations to show."
          actionLabel="Go back"
          onAction={goBack}
        />
      ) : loading ? (
        <MandiSkeletonList count={4} />
      ) : error ? (
        <MandiErrorState message="Couldn't load your messages." onRetry={() => refetch()} />
      ) : threads.length === 0 ? (
        <MandiEmptyState
          icon="chatbubbles-outline"
          title="No messages yet"
          description={side === 'RESTAURANT'
            ? 'Open a supplier you order from and tap Message to start a conversation.'
            : 'Restaurants you supply can start a conversation here.'}
        />
      ) : (
        threads.map((thread) => (
          <MandiCard
            key={thread.id}
            onPress={() => router.push(`/chat/${thread.id}`)}
            accessibilityLabel={
              `${thread.counterpartName}${thread.unreadCount > 0
                ? `, ${thread.unreadCount} unread` : ''}`
            }
          >
            <View style={styles.row}>
              <View style={styles.flex}>
                <MandiText variant="bodyEmphasis" numberOfLines={1}>
                  {thread.counterpartName}
                </MandiText>
                {thread.counterpartSubtitle != null
                  && thread.counterpartSubtitle !== thread.counterpartName && (
                  <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                    {thread.counterpartSubtitle}
                  </MandiText>
                )}
              </View>
              {thread.lastMessageAt != null && (
                <MandiText variant="caption" color={Colors.textTertiary}>
                  {formatAgeOrMoment(thread.lastMessageAt)}
                </MandiText>
              )}
            </View>

            <View style={styles.row}>
              <MandiText
                variant="caption"
                color={thread.unreadCount > 0 ? Colors.textPrimary : Colors.textSecondary}
                numberOfLines={1}
                style={styles.flex}
              >
                {thread.lastMessagePreview ?? 'No messages yet'}
              </MandiText>
              {/* A count, not a dot: §23A.48 — the badge has to say something
                  to a reader who cannot see that it is orange. */}
              {thread.unreadCount > 0 && (
                <View style={styles.badge}>
                  <MandiText variant="caption" color={Colors.textInverse}>
                    {thread.unreadCount > 9 ? '9+' : String(thread.unreadCount)}
                  </MandiText>
                </View>
              )}
            </View>

            {!thread.canSend && thread.disabledReason != null && (
              <MandiText variant="caption" color={Colors.textTertiary}>
                {thread.disabledReason}
              </MandiText>
            )}
          </MandiCard>
        ))
      )}
    </MandiScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
