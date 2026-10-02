import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import {
  fetchShareables,
  fetchThread,
  markThreadRead,
  sendMessage,
} from '@/services/chat';
import type { ChatMessage, ChatShareable, ChatSide } from '@/models/chat';
import {
  MandiBottomSheet,
  MandiEmptyState,
  MandiErrorState,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatAgeOrMoment } from '@/utils/dateRange';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/** How often an open thread asks for anything new. */
const POLL_MS = 8_000;

/**
 * One conversation. D-095.
 *
 * <p>Both sides use this screen. Which bubbles are yours comes from the
 * thread's own side rather than from comparing user ids: a store is answered by
 * whoever is on the counter, and a colleague's message is still the store's.
 *
 * <p><b>The composer is the server's decision.</b> `canSend` says whether a
 * message can be sent, and when it cannot the composer is replaced by the
 * reason — the history stays, because what a supplier agreed to in writing is
 * the thing somebody needs after support has been called.
 */
export default function ChatThreadScreen() {
  const { id, suggestType, suggestId } = useLocalSearchParams<{
    id: string;
    suggestType?: 'REQUEST' | 'ORDER';
    suggestId?: string;
  }>();
  const threadId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken, audience } = useSession();
  const mySide: ChatSide = audience === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT';

  const [draft, setDraft] = useState('');
  const [sharing, setSharing] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const query = useQuery({
    queryKey: ['chat', 'thread', threadId],
    queryFn: () => fetchThread(accessToken as string, threadId),
    enabled: Number.isFinite(threadId) && accessToken != null,
    refetchInterval: POLL_MS,
  });

  const thread = query.data?.thread;
  const messages = useMemo(() => query.data?.messages ?? [], [query.data]);

  /**
   * What they were looking at when they opened this.
   *
   * <p>Offered above the composer rather than attached for them: sharing a link
   * is a message the other side sees, and sending one because somebody tapped a
   * chat icon would be the app writing on their behalf.
   *
   * <p><b>Resolved against the server's own list, not the URL.</b> The route
   * carries a type and an id; the reference shown comes from `shareables`,
   * which is scoped to this pair. An id that is not in that list is one the
   * server would refuse, so no chip is offered for it — better than a
   * suggestion that fails when tapped.
   */
  const suggestedId = suggestId == null ? null : Number(suggestId);
  const wantsSuggestion = suggestType != null
    && suggestedId != null && Number.isFinite(suggestedId);

  const shareables = useQuery({
    queryKey: ['chat', 'thread', threadId, 'shareables'],
    queryFn: () => fetchShareables(accessToken as string, threadId),
    enabled: (wantsSuggestion || sharing) && accessToken != null,
  });

  const suggestion = useMemo(() => {
    if (!wantsSuggestion) return null;
    // Already in the thread: the other side knows what this is about, and a
    // second copy of the same link is noise.
    const alreadyShared = messages.some((message) =>
      message.attachment?.type === suggestType
      && message.attachment?.id === suggestedId);
    if (alreadyShared) return null;
    return (shareables.data ?? []).find(
      (row) => row.type === suggestType && row.id === suggestedId) ?? null;
  }, [wantsSuggestion, messages, shareables.data, suggestType, suggestedId]);

  // Reading it is what marks it read. Doing that from a button would leave the
  // badge on a conversation somebody has plainly just read.
  useEffect(() => {
    if (thread == null || accessToken == null || thread.unreadCount === 0) return;
    void markThreadRead(accessToken, threadId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] }));
  }, [accessToken, queryClient, thread, threadId]);

  const send = useMutation({
    mutationFn: (payload: {
      body?: string;
      attachmentType?: 'REQUEST' | 'ORDER';
      attachmentId?: number;
    }) => sendMessage(accessToken as string, threadId, payload),
    onSuccess: () => {
      setDraft('');
      void query.refetch();
      void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] });
    },
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not send that.',
        'error',
      ),
  });

  const openAttachment = useCallback((message: ChatMessage) => {
    const attachment = message.attachment;
    if (attachment == null) return;
    // The same thing has a different screen on each side, so the link is
    // resolved from who is reading rather than stored as a path. A path in the
    // message would send a supplier to the restaurant's copy of their order.
    const base = mySide === 'SUPPLIER' ? '/supplier' : '/restaurant';
    const section = attachment.type === 'ORDER' ? 'orders' : 'requests';
    router.push(`${base}/${section}/${attachment.id}`);
  }, [mySide, router]);

  return (
    <MandiScreen
      scroll={false}
      // The thread owns the scrolling, so the shell's content block has to fill
      // the screen — without it the composer sits under the last message
      // instead of at the bottom, and an empty conversation has it halfway up.
      contentStyle={styles.fill}
      header={
        <MandiHeader
          title={thread?.counterpartName ?? 'Messages'}
          subtitle={thread?.counterpartSubtitle ?? undefined}
          back
        />
      }
      footer={
        thread == null ? undefined : thread.canSend ? (
          <>
          {/* What they came here about, offered rather than attached.
              <p>One tap sends it, and the other side gets a card they can open
              — which is the whole point: "is this ready?" means nothing without
              saying which one. It disappears once shared, because a second copy
              of the same link says nothing new. */}
          {suggestion != null && (
            <View style={styles.suggestionRow}>
              <Pressable
                onPress={() => send.mutate({
                  attachmentType: suggestion.type,
                  attachmentId: suggestion.id,
                })}
                disabled={send.isPending}
                accessibilityRole="button"
                accessibilityLabel={
                  `Share ${suggestion.type === 'ORDER' ? 'order' : 'request'} `
                  + suggestion.reference
                }
                style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
              >
                <Ionicons
                  name={suggestion.type === 'ORDER' ? 'cube-outline' : 'document-text-outline'}
                  size={14}
                  color={Colors.primary}
                />
                <MandiText variant="caption" color={Colors.primary} numberOfLines={1}>
                  Share {suggestion.type === 'ORDER' ? 'order' : 'request'}{' '}
                  {suggestion.reference}
                </MandiText>
              </Pressable>
            </View>
          )}

          <View style={styles.composer}>
            <Pressable
              onPress={() => setSharing(true)}
              accessibilityRole="button"
              accessibilityLabel="Share a request or an order"
              style={styles.attach}
            >
              <Ionicons name="link-outline" size={20} color={Colors.primary} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message"
              placeholderTextColor={Colors.textTertiary}
              multiline
              style={styles.input}
              accessibilityLabel="Message"
            />
            <Pressable
              onPress={() => send.mutate({ body: draft.trim() })}
              disabled={draft.trim() === '' || send.isPending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: draft.trim() === '' || send.isPending }}
              style={[styles.send, draft.trim() === '' && styles.sendIdle]}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={draft.trim() === '' ? Colors.textTertiary : Colors.textInverse}
              />
            </Pressable>
          </View>
          </>
        ) : (
          <View style={styles.disabled}>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {thread.disabledReason ?? 'Chat is turned off for this account.'}
            </MandiText>
          </View>
        )
      }
    >
      {query.isPending ? (
        <MandiSkeletonList count={4} />
      ) : query.error ? (
        <MandiErrorState message="Couldn't load this conversation." onRetry={() => query.refetch()} />
      ) : (
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 ? (
            <MandiEmptyState
              icon="chatbubble-ellipses-outline"
              title="No messages yet"
              description="Ask about a delivery, a price or a substitution. You can share a request or an order to say which one you mean."
            />
          ) : (
            messages.map((message) => (
              <Bubble
                key={message.id}
                message={message}
                mine={message.senderSide === mySide}
                onOpenAttachment={() => openAttachment(message)}
              />
            ))
          )}
        </ScrollView>
      )}

      <SharePicker
        visible={sharing}
        loading={shareables.isPending}
        rows={shareables.data ?? []}
        onClose={() => setSharing(false)}
        onShare={(type, attachmentId) => {
          setSharing(false);
          send.mutate({ attachmentType: type, attachmentId });
        }}
      />
    </MandiScreen>
  );
}

function Bubble({ message, mine, onOpenAttachment }: {
  message: ChatMessage;
  mine: boolean;
  onOpenAttachment: () => void;
}) {
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {message.body != null && (
          <MandiText
            variant="body"
            color={mine ? Colors.textInverse : Colors.textPrimary}
          >
            {message.body}
          </MandiText>
        )}

        {/* A shared request or order, as a card you can open.
            <p>The reference is the server's, snapshotted onto the message, so
            it still reads as MP-260919-000013 whoever is looking and whatever
            happened to the order since. */}
        {message.attachment != null && (
          <Pressable
            onPress={onOpenAttachment}
            accessibilityRole="link"
            accessibilityLabel={
              `Open ${message.attachment.type === 'ORDER' ? 'order' : 'request'} `
              + message.attachment.reference
            }
            style={[styles.attachment, mine ? styles.attachmentMine : styles.attachmentTheirs]}
          >
            <Ionicons
              name={message.attachment.type === 'ORDER' ? 'cube-outline' : 'document-text-outline'}
              size={16}
              color={mine ? Colors.textInverse : Colors.primary}
            />
            <View style={styles.flex}>
              <MandiText
                variant="caption"
                color={mine ? Colors.textInverse : Colors.textSecondary}
              >
                {message.attachment.type === 'ORDER' ? 'Order' : 'Request'}
              </MandiText>
              <MandiText
                variant="bodyEmphasis"
                color={mine ? Colors.textInverse : Colors.textPrimary}
              >
                {message.attachment.reference}
              </MandiText>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={mine ? Colors.textInverse : Colors.textTertiary}
            />
          </Pressable>
        )}

        <MandiText
          variant="caption"
          color={mine ? Colors.textInverse : Colors.textTertiary}
          style={styles.stamp}
        >
          {formatAgeOrMoment(message.createdAt)}
        </MandiText>
      </View>
    </View>
  );
}

/**
 * What can be shared into this conversation.
 *
 * <p>Fetched per thread and scoped to the pair by the server, because the point
 * of sharing a link is that the other side can open it — and they can only open
 * their own.
 */
function SharePicker({ visible, loading, rows, onClose, onShare }: {
  visible: boolean;
  loading: boolean;
  /** Fetched once by the screen, because the suggestion needs the same list. */
  rows: ChatShareable[];
  onClose: () => void;
  onShare: (type: 'REQUEST' | 'ORDER', id: number) => void;
}) {
  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title="Share a request or order"
      closeLabel="Close"
    >
      <MandiText variant="caption" color={Colors.textSecondary}>
        They can open it from the message.
      </MandiText>

      <ScrollView style={styles.shareScroll}>
        {loading ? (
          <MandiSkeletonList count={3} />
        ) : rows.length === 0 ? (
          <MandiText variant="caption" color={Colors.textTertiary}>
            Nothing to share yet — send this supplier a request first.
          </MandiText>
        ) : (
          rows.map((row) => (
            <Pressable
              key={`${row.type}-${row.id}`}
              onPress={() => onShare(row.type, row.id)}
              accessibilityRole="button"
              accessibilityLabel={`Share ${row.reference}`}
              style={styles.shareRow}
            >
              <Ionicons
                name={row.type === 'ORDER' ? 'cube-outline' : 'document-text-outline'}
                size={18}
                color={Colors.textSecondary}
              />
              <View style={styles.flex}>
                <MandiText variant="body">{row.reference}</MandiText>
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {row.type === 'ORDER' ? 'Order' : 'Request'} · {formatAgeOrMoment(row.createdAt)}
                </MandiText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { flex: 1, padding: 0, gap: 0 },
  thread: { padding: Spacing.screenHorizontal, gap: Spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', gap: Spacing.xs, padding: Spacing.md, borderRadius: Radius.lg },
  mine: { backgroundColor: Colors.primary, borderBottomRightRadius: Radius.sm },
  theirs: { backgroundColor: Colors.surface, borderBottomLeftRadius: Radius.sm },
  stamp: { alignSelf: 'flex-end', opacity: 0.8 },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  attachmentMine: { backgroundColor: Colors.primaryDark },
  attachmentTheirs: { backgroundColor: Colors.surfaceSunken },
  suggestionRow: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  suggestionPressed: { opacity: 0.7 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  attach: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceSunken,
    color: Colors.textPrimary,
  },
  send: {
    width: TouchTarget.min,
    height: TouchTarget.min,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIdle: { backgroundColor: Colors.surfaceSunken },
  disabled: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceSunken,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  shareScroll: { maxHeight: 340 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
});
