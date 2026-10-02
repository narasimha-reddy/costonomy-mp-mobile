import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MandiButton, MandiCard, MandiFormField, MandiText, useToast } from '@/components/common';
import type { Dispute } from '@/models/trust';
import { postDisputeMessage } from '@/services/trust';
import { ApiError } from '@/lib/api/errors';
import { OPS_TEAM } from '@/lib/brand';
import { formatMomentWithRecency } from '@/utils/dateRange';
import { Colors, Radius, Spacing } from '@/theme';

const SIDES: Record<string, string> = {
  RESTAURANT: 'Restaurant',
  SUPPLIER: 'Supplier',
  OPERATIONS: OPS_TEAM,
};

/**
 * The conversation on a dispute, oldest first, and a reply box while it is open.
 * Refund steps appear here too — the server writes them into the thread — so the
 * whole story reads in one place.
 */
export function DisputeThread({ dispute, token }: { dispute: Dispute; token: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const open = dispute.status !== 'RESOLVED' && dispute.status !== 'REJECTED';

  const send = useMutation({
    mutationFn: () => postDisputeMessage(token, dispute.id, reply.trim()),
    onSuccess: (updated) => {
      setReply('');
      queryClient.setQueryData(['dispute', dispute.id], updated);
    },
    onError: (caught) =>
      toast.show(caught instanceof ApiError ? caught.message : 'Could not send that.', 'error'),
  });

  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">Conversation</MandiText>
      {dispute.messages.map((message) => (
        <View key={message.id} style={styles.message}>
          <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
            {SIDES[message.authorSide] ?? message.authorSide} · {formatMomentWithRecency(message.createdAt)}
          </MandiText>
          <MandiText variant="body">{message.message}</MandiText>
        </View>
      ))}
      {open && (
        <>
          <MandiFormField
            label="Reply"
            value={reply}
            onChangeText={setReply}
            placeholder="Add to the conversation"
            multiline
            maxLength={2000}
          />
          <MandiButton
            label="Send"
            variant="secondary"
            size="md"
            disabled={reply.trim().length === 0}
            loading={send.isPending}
            onPress={() => send.mutate()}
          />
        </>
      )}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  message: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
  },
});
