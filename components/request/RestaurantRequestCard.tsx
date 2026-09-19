import React from 'react';
import { useRouter } from 'expo-router';
import { MandiCard, toneColors } from '@/components/common';
import { RequestCardBody } from '@/components/request/RequestCardBody';
import type { Intent } from '@/models/intent';
import { restaurantIntentStatus } from '@/models/status';

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

  return (
    <MandiCard
      onPress={onPress ?? (() => router.push(`/restaurant/requests/${request.id}`))}
      accentColor={toneColors(status.tone).fg}
    >
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
    </MandiCard>
  );
}
