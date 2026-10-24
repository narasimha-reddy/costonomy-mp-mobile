import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton, MandiFormField, MandiText } from '@/components/common';
import { useExtendDue } from '@/hooks/useExtendDue';
import { istDay, shiftDay } from '@/lib/credit/claims';
import { reasonCheck, MAX_REASON } from '@/lib/credit/supplierLine';
import { serverNow } from '@/lib/server-clock';
import type { ExtendDueResponse } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { Colors, IconSize, Radius, Spacing } from '@/theme';

const TARGET = 48;
const QUICK_DAYS = [7, 15, 30] as const;

/**
 * Move one invoice's due date later. The new day starts a day after the current one and is moved
 * with a stepper or a +7/+15/+30 shortcut counted from the current due date: calendar stepping,
 * not a verdict. The server decides what is allowed (after the current day, within 60 days of
 * the original) and its message is shown as sent. A reason is required: the restaurant sees it.
 *
 * <p>The parent mounts one sheet per opening (`key`), so the draft is fresh each time.
 */
export function ExtendDueSheet({
  visible, onClose, invoice, offline, onExtended,
}: {
  visible: boolean;
  onClose: () => void;
  invoice: { id: number; agreementId: number; invoiceNumber: string; dueDate: string | null };
  offline: boolean;
  onExtended: (response: ExtendDueResponse) => void;
}) {
  const ext = useExtendDue(invoice.id, invoice.agreementId);
  const current = invoice.dueDate ?? istDay(new Date(serverNow()));
  const [newDate, setNewDate] = useState(() => shiftDay(current, 1));
  const [reason, setReason] = useState('');

  const valid = reasonCheck(reason);
  const canSend = valid && !ext.pending && !offline;
  const day = formatDay(newDate) ?? newDate;

  async function send() {
    if (!canSend) return;
    const response = await ext.extend(newDate, reason.trim());
    if (response != null) onExtended(response);
  }
  function move(next: string) { setNewDate(next); ext.reset(); }

  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title="Extend due date" closeLabel="Close" avoidKeyboard testID="extend-sheet">
      <View style={styles.body}>
        <MandiText variant="body" color={Colors.textSecondary}>
          {`Give them more time to pay ${invoice.invoiceNumber}.${invoice.dueDate != null ? ` It is due ${formatDay(invoice.dueDate) ?? invoice.dueDate} now.` : ''}`}
        </MandiText>

        <View style={styles.group} testID="extend-date">
          <MandiText variant="captionEmphasis" muted>New due date</MandiText>
          <View style={styles.dateRow}>
            <Pressable
              testID="extend-date-prev"
              onPress={() => move(shiftDay(newDate, -1))}
              disabled={ext.pending}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              accessibilityState={{ disabled: ext.pending }}
              style={styles.step}
            >
              <Ionicons name="chevron-back" size={IconSize.md} color={Colors.primary} />
            </Pressable>
            <MandiText variant="bodyEmphasis" style={styles.dateText} testID="extend-date-text">{day}</MandiText>
            <Pressable
              testID="extend-date-next"
              onPress={() => move(shiftDay(newDate, 1))}
              disabled={ext.pending}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              accessibilityState={{ disabled: ext.pending }}
              style={styles.step}
            >
              <Ionicons name="chevron-forward" size={IconSize.md} color={Colors.primary} />
            </Pressable>
          </View>
          <View style={styles.chips}>
            {QUICK_DAYS.map((n) => (
              <Pressable
                key={n}
                testID={`extend-plus-${n}`}
                onPress={() => move(shiftDay(current, n))}
                disabled={ext.pending}
                accessibilityRole="button"
                accessibilityLabel={`${n} days after the current due date`}
                style={styles.chip}
              >
                <MandiText variant="captionEmphasis" color={Colors.textSecondary}>{`+${n} days`}</MandiText>
              </Pressable>
            ))}
          </View>
          <MandiText variant="caption" color={Colors.textTertiary} testID="extend-hint">
            You can extend up to 60 days past the original due date
          </MandiText>
        </View>

        <MandiFormField
          label="Why are you extending it?"
          value={reason}
          onChangeText={(next) => { setReason(next); ext.reset(); }}
          placeholder="Festival week, they asked for more time"
          required
          multiline
          maxLength={MAX_REASON}
          disabled={ext.pending}
          hint="The restaurant sees this."
          testID="extend-reason"
        />

        {ext.error != null && (
          <View accessibilityLiveRegion="polite" testID="extend-error">
            <MandiText variant="body" color={Colors.danger}>{ext.error}</MandiText>
          </View>
        )}
        {offline && (
          <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>
        )}
        <MandiButton
          testID="extend-submit"
          label={`Extend to ${day}`}
          loading={ext.pending}
          disabled={!canSend}
          onPress={() => { void send(); }}
        />
        {!valid && (
          <MandiText variant="caption" color={Colors.textTertiary} center>
            Add a reason of at least 3 characters to continue.
          </MandiText>
        )}
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  group: { gap: Spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dateText: { flex: 1, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TARGET,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  step: {
    minWidth: TARGET,
    minHeight: TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
