import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MandiButton, MandiCard, toneColors } from '@/components/common';
import { RequestCardBody } from '@/components/request/RequestCardBody';
import type { Intent } from '@/models/intent';
import { restaurantIntentStatus } from '@/models/status';
import { Spacing } from '@/theme';

/**
 * A request, as the restaurant sees it in a list.
 *
 * <p>One component for Home and the Requests tab. They had drifted already —
 * Home showed a supplier name, a chip and an item count while the tab showed
 * the full card — so the same request looked like two different records
 * depending which screen you reached it from, and the figure a kitchen was
 * deciding on appeared on only one of them.
 *
 * <p>The clock shown is whichever is running, and they belong to different
 * people: the supplier's time to answer while the request is open, the
 * restaurant's own time to order once it has been answered. Nothing counts down
 * on a request that has finished.
 *
 * <p><b>An answered request carries a button.</b> Tapping the card has always
 * opened it, but a card that opens is not a card that asks for anything — and
 * this is the one state where the request is waiting on the restaurant rather
 * than the other way round, with a window that closes. The button goes where
 * the card goes; what it adds is that there is something to do.
 *
 * <p><b>Which is why that card is not itself pressable.</b> {@code MandiCard}
 * wraps its content in a {@code Pressable} with a button role, and React Native
 * Web renders that as a real {@code <button>} — so a button inside it is a
 * button inside a button, which is invalid and leaves the browser to decide
 * which control a tap belongs to. The body and the call to action are siblings
 * instead: two controls, one destination, no guessing.
 */
export function RestaurantRequestCard({
  request,
  onPress,
}: {
  request: Intent;
  /** Defaults to opening the request. */
  onPress?: () => void;
}) {
  const router = useRouter();
  const status = restaurantIntentStatus(request.status, request.fulfilment);

  const awaitingReply = request.status === 'OPEN';
  const readyToOrder = request.status === 'RESPONSES_RECEIVED' && request.withinOrderWindow;

  const open = onPress ?? (() => router.push(`/restaurant/requests/${request.id}`));

  const body = (
    <RequestCardBody
        primary={request.storeName}
        secondary={[
          request.supplierName !== request.storeName ? request.supplierName : null,
        ]}
        status={status}
        deadlineAt={
          awaitingReply ? request.responseDeadline
            : readyToOrder ? request.orderCreationDeadline : null
        }
        deadlineSeconds={
          awaitingReply ? request.responseWindowSeconds : request.orderCreationWindowSeconds
        }
        deadlineAction={awaitingReply ? 'for their reply' : 'to order'}
        reference={request.reference}
        occurredAt={request.sentAt ?? request.createdAt}
        amount={request.agreedTotal}
        amountLabel={`${request.items.length} item${request.items.length === 1 ? '' : 's'}`}
        items={request.items}
    />
  );

  if (!readyToOrder) {
    return (
      <MandiCard onPress={open} accentColor={toneColors(status.tone).fg}>
        {body}
      </MandiCard>
    );
  }

  return (
    <MandiCard accentColor={toneColors(status.tone).fg}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Open request ${request.reference}`}
      >
        {body}
      </Pressable>
      {/* The card's colour, as on the detail screen this opens: the state and
          the act on it are the same thing, so they are the same violet. */}
      <MandiButton
        label="Create Order"
        size="sm"
        tone={status.tone}
        style={styles.cta}
        onPress={open}
      />
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  // Clear of the status row above it, which the body ends with.
  cta: { marginTop: Spacing.sm },
});
