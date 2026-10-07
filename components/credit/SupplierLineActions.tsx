import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiText } from '@/components/common';
import { RoundAction } from '@/components/wallet/RoundAction';
import { Colors, IconSize, Spacing, TouchTarget } from '@/theme';

/**
 * The round actions under a restaurant's hero: Record, Remind, Statement, More.
 *
 * <p>Extension points. Record and Remind are props, not wired here: while a handler is
 * absent the button shows disabled with "Coming soon" under it, so the next pull
 * requests only pass `onRecord` and `onRemind`. `canCollect` hides both for people who
 * may not collect payments (no dead buttons). Statement is for everyone who can see the
 * line. More shows only when the caller has something in it (`onMore`).
 */
export function SupplierLineActions({
  canCollect, onRecord, onRemind, onStatement, onMore, offline = false,
}: {
  canCollect: boolean;
  onRecord?: () => void;
  onRemind?: () => void;
  onStatement: () => void;
  onMore?: () => void;
  offline?: boolean;
}) {
  return (
    <View style={styles.row} testID="line-actions">
      {canCollect && (
        <Slot comingSoon={onRecord == null} testID="action-record">
          <RoundAction
            testID="action-record"
            icon={{ set: 'mci', name: 'cash-plus' }}
            label="Record"
            glyphTone="strong"
            primary={onRecord != null}
            disabled={onRecord == null || offline}
            accessibilityHint={onRecord == null ? 'Coming soon' : 'Record a payment they made'}
            onPress={onRecord ?? noop}
          />
        </Slot>
      )}
      {canCollect && (
        <Slot comingSoon={onRemind == null} testID="action-remind">
          <RoundAction
            testID="action-remind"
            icon={{ set: 'mci', name: 'bell-ring-outline' }}
            label="Remind"
            glyphTone="strong"
            disabled={onRemind == null || offline}
            accessibilityHint={onRemind == null ? 'Coming soon' : 'Send a payment reminder'}
            onPress={onRemind ?? noop}
          />
        </Slot>
      )}
      <Slot comingSoon={false}>
        <RoundAction
          testID="action-statement"
          icon={{ set: 'mci', name: 'file-document-outline' }}
          label="Statement"
          glyphTone="strong"
          accessibilityHint="Everything on this line, with opening and closing balance"
          onPress={onStatement}
        />
      </Slot>
      {onMore != null && (
        <Slot comingSoon={false}>
          <RoundAction
            testID="action-more"
            icon="ellipsis-horizontal"
            label="More"
            glyphTone="strong"
            accessibilityHint="Edit terms, suspend, reinstate or close"
            onPress={onMore}
          />
        </Slot>
      )}
    </View>
  );
}

function noop() {}

function Slot({ comingSoon, testID, children }: { comingSoon: boolean; testID?: string; children: React.ReactNode }) {
  return (
    <View style={styles.slot}>
      {children}
      {comingSoon && (
        <MandiText variant="caption" muted center testID={testID ? `${testID}-soon` : undefined}>
          Coming soon
        </MandiText>
      )}
    </View>
  );
}

export interface MoreEntry {
  key: string;
  label: string;
  hint?: string;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * The More menu. It only lists what the caller passes, so "Close line" and "Write off"
 * simply are not there until their pull requests add them.
 */
export function SupplierMoreSheet({
  visible, onClose, entries,
}: {
  visible: boolean;
  onClose: () => void;
  entries: MoreEntry[];
}) {
  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title="More" closeLabel="Close the menu" testID="more-sheet">
      <View style={styles.list}>
        {entries.map((entry) => (
          <Pressable
            key={entry.key}
            testID={`more-${entry.key}`}
            onPress={() => { onClose(); entry.onPress(); }}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            accessibilityHint={entry.hint}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <MandiText variant="bodyEmphasis" color={entry.destructive ? Colors.danger : undefined} style={styles.flex}>
              {entry.label}
            </MandiText>
            <Ionicons name="chevron-forward" size={IconSize.sm} color={Colors.textTertiary} />
          </Pressable>
        ))}
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  slot: { flex: 1, alignItems: 'center', gap: 2 },
  list: { gap: Spacing.xs },
  flex: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min + 4,
    paddingVertical: Spacing.sm,
  },
  pressed: { opacity: 0.7 },
});
