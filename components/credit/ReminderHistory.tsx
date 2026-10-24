import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  MandiButton, MandiCard, MandiErrorState, MandiSkeletonList, MandiText,
} from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { istDayMonth } from '@/lib/credit/istFormat';
import { historyKind, historyStatus, channelsText } from '@/lib/credit/remind';
import { agreementRemindersKey } from '@/lib/queryKeys';
import type { Reminder } from '@/models/credit';
import { fetchReminders } from '@/services/credit';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

const PAGE = 10;

/**
 * The reminders sent to this restaurant: a folded section that loads only when opened. Each row
 * says when (India day), what kind (Manual, Automatic before due, Due today, Weekly), whether it
 * has gone, and whether the supplier's team or the app sent it.
 */
export function ReminderHistory({ agreementId }: { agreementId: number }) {
  const { accessToken } = useSession();
  const [open, setOpen] = useState(false);
  const list = useInfiniteQuery({
    queryKey: agreementRemindersKey(agreementId),
    queryFn: ({ pageParam }) => fetchReminders(accessToken as string, agreementId, { page: pageParam, size: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasNext ? all.length : undefined),
    enabled: open && accessToken != null,
  });
  const items = (list.data?.pages ?? []).flatMap((p) => p.items);

  return (
    <View style={styles.section} testID="reminders-section">
      <Pressable
        testID="reminders-toggle"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel="Reminders sent"
        accessibilityState={{ expanded: open }}
        style={styles.fold}
      >
        <MandiText variant="bodyEmphasis" style={styles.flex}>Reminders sent</MandiText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={IconSize.sm} color={Colors.textTertiary} />
      </Pressable>
      {open && (
        list.isPending ? (
          <MandiSkeletonList count={2} />
        ) : list.isError ? (
          <MandiErrorState message="Couldn't load the reminders." onRetry={() => { void list.refetch(); }} />
        ) : items.length === 0 ? (
          <MandiText variant="caption" color={Colors.textTertiary} testID="reminders-empty">
            No reminders sent yet.
          </MandiText>
        ) : (
          <MandiCard>
            {items.map((r, i) => <ReminderRow key={r.id} reminder={r} last={i === items.length - 1} />)}
          </MandiCard>
        )
      )}
      {open && list.hasNextPage && (
        <MandiButton
          testID="reminders-more"
          label="Show more reminders"
          variant="neutral"
          size="md"
          loading={list.isFetchingNextPage}
          onPress={() => { void list.fetchNextPage(); }}
        />
      )}
    </View>
  );
}

function ReminderRow({ reminder, last }: { reminder: Reminder; last: boolean }) {
  const day = istDayMonth(reminder.sentAt ?? reminder.sendAt ?? reminder.requestedAt) ?? '';
  const who = reminder.kind === 'MANUAL' ? 'Sent by your team' : 'Sent automatically';
  const status = historyStatus(reminder.status);
  const channels = channelsText(reminder.channels);
  const label = [day, historyKind(reminder.kind), status, who].filter(Boolean).join(', ');
  return (
    <View
      style={[styles.row, !last && styles.rule]}
      accessible
      accessibilityLabel={label}
      testID={`reminder-${reminder.id}`}
    >
      <View style={styles.flex}>
        <MandiText variant="bodyEmphasis">{historyKind(reminder.kind)}</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>{who}</MandiText>
        {channels !== '' && <MandiText variant="caption" color={Colors.textTertiary}>{channels}</MandiText>}
      </View>
      <View style={styles.right}>
        <MandiText variant="body">{day}</MandiText>
        <MandiText variant="caption" color={reminder.status === 'QUEUED' ? Colors.warning : Colors.textSecondary}>
          {status}
        </MandiText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.listGap },
  fold: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TouchTarget.min + 4 },
  row: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.sm, minHeight: TouchTarget.min },
  rule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  right: { alignItems: 'flex-end', gap: 2 },
});
