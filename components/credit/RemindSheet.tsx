import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  MandiBottomSheet, MandiButton, MandiErrorState, MandiFormField, MandiSkeletonList, MandiText,
} from '@/components/common';
import { useSession } from '@/contexts/SessionProvider';
import { useSendReminder } from '@/hooks/useSendReminder';
import { dayMonth } from '@/lib/credit/istFormat';
import {
  NOTE_MAX, blockedText, channelsText, queuedText, skipReasonText,
} from '@/lib/credit/remind';
import { agreementKey } from '@/lib/queryKeys';
import type { Reminder, ReminderPreviewInvoice } from '@/models/credit';
import { previewReminder } from '@/services/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

/**
 * Remind a restaurant about what it owes. It shows the server's own preview: the exact message
 * they will get, which invoices it is about and which are left out (and why), the channels in
 * words, and when it will go if it has to wait. When the server says a reminder cannot go now
 * (nothing due, a claim covers it, too soon, a limit) the reason is shown and Send stays off.
 *
 * <p>Nothing is worked out here: who is included, the message, the channels and the times are all
 * the server's. The preview is read fresh each time the sheet opens, and the send's idempotency
 * key lives in `useSendReminder`.
 */
export function RemindSheet({
  visible, onClose, agreementId, offline, onSent,
}: {
  visible: boolean;
  onClose: () => void;
  agreementId: number;
  offline: boolean;
  onSent: (reminder: Reminder) => void;
}) {
  const { accessToken } = useSession();
  const { send, pending, error, reset } = useSendReminder(agreementId);
  const [note, setNote] = useState('');
  const tapped = useRef(false);

  const preview = useQuery({
    queryKey: [...agreementKey(agreementId), 'reminder-preview'],
    queryFn: () => previewReminder(accessToken as string, agreementId),
    enabled: visible && accessToken != null,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (visible) { setNote(''); reset(); tapped.current = false; }
  }, [visible, reset]);

  const data = preview.data;
  const canSend = data != null && data.canRemind && !pending && !offline && !preview.isFetching;

  async function submit() {
    if (!canSend || tapped.current) return;
    tapped.current = true;
    try {
      const trimmed = note.trim();
      const reminder = await send(trimmed === '' ? {} : { note: trimmed });
      if (reminder != null) onSent(reminder);
    } finally {
      tapped.current = false;
    }
  }

  const included = (data?.invoices ?? []).filter((i) => i.included);
  const skipped = (data?.invoices ?? []).filter((i) => !i.included);

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title="Remind about payment"
      closeLabel="Close"
      avoidKeyboard
      testID="remind-sheet"
    >
      <View style={styles.body}>
        {preview.isPending ? (
          <MandiSkeletonList count={2} />
        ) : preview.isError || data == null ? (
          <MandiErrorState
            message="Couldn't check this reminder."
            onRetry={() => { void preview.refetch(); }}
            testID="remind-preview-error"
          />
        ) : (
          <>
            {!data.canRemind && (
              <View style={styles.blocked} accessibilityLiveRegion="polite" testID="remind-blocked">
                <MandiText variant="bodyEmphasis">{blockedText(data.reason, data.nextAllowedAt)}</MandiText>
              </View>
            )}

            {data.message != null && data.message !== '' && (
              <View style={styles.message} testID="remind-message">
                <MandiText variant="caption" color={Colors.textSecondary}>What they will get</MandiText>
                <MandiText variant="body">{data.message}</MandiText>
              </View>
            )}

            {data.canRemind && data.channels.length > 0 && (
              <MandiText variant="caption" color={Colors.textSecondary} testID="remind-channels">
                {channelsText(data.channels)}
              </MandiText>
            )}
            {data.canRemind && data.status === 'QUEUED' && (
              <MandiText variant="caption" color={Colors.warning} testID="remind-queued">
                {queuedText(data.sendAt)}
              </MandiText>
            )}

            {included.length > 0 && (
              <View style={styles.list} testID="remind-included">
                <MandiText variant="label">About these invoices</MandiText>
                {included.map((i) => <InvoiceLine key={i.invoiceId} invoice={i} />)}
              </View>
            )}
            {skipped.length > 0 && (
              <View style={styles.list} testID="remind-skipped">
                <MandiText variant="label">Left out</MandiText>
                {skipped.map((i) => <InvoiceLine key={i.invoiceId} invoice={i} skipped />)}
              </View>
            )}

            {data.canRemind && (
              <MandiFormField
                label="Add a note (optional)"
                value={note}
                onChangeText={(t) => { setNote(t.slice(0, NOTE_MAX)); reset(); }}
                placeholder="For example: please pay by Friday"
                multiline
                maxLength={NOTE_MAX}
                disabled={pending}
                hint={`${note.length}/${NOTE_MAX}`}
                testID="remind-note"
              />
            )}
          </>
        )}

        {error != null && (
          <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite" testID="remind-error">
            {error}
          </MandiText>
        )}
        {offline && (
          <MandiText variant="caption" color={Colors.textTertiary}>You are offline. Connect to continue.</MandiText>
        )}
        <MandiButton
          testID="remind-send"
          label={data?.status === 'QUEUED' ? 'Schedule reminder' : 'Send reminder'}
          loading={pending}
          disabled={!canSend}
          onPress={() => { void submit(); }}
        />
      </View>
    </MandiBottomSheet>
  );
}

function InvoiceLine({ invoice, skipped = false }: { invoice: ReminderPreviewInvoice; skipped?: boolean }) {
  const due = dayMonth(invoice.dueDate);
  const amount = formatMoney(invoice.outstanding);
  const detail = skipped
    ? skipReasonText(invoice.skipReason)
    : [due != null ? `Due ${due}` : null].filter(Boolean).join(' · ');
  return (
    <View
      style={styles.line}
      accessible
      accessibilityLabel={`${invoice.invoiceNumber}, ${amount}${detail !== '' ? `, ${detail}` : ''}`}
      testID={`remind-invoice-${invoice.invoiceId}`}
    >
      <View style={styles.lineLeft}>
        <MandiText variant="bodyEmphasis" numberOfLines={1}>{invoice.invoiceNumber}</MandiText>
        {detail !== '' && (
          <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={2}>{detail}</MandiText>
        )}
      </View>
      <MandiText variant="bodyEmphasis" color={skipped ? Colors.textTertiary : undefined}>{amount}</MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  blocked: { padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.warningLight },
  message: { padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.surfaceSunken, gap: Spacing.xs },
  list: { gap: Spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
  lineLeft: { flex: 1, gap: 2 },
});
