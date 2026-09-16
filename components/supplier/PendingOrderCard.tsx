import React from 'react';
import type { IncomingOrder } from '@/models/procurement';
import { MandiCard, MandiCountdown } from '@/components/common';
import { OrderCardBody } from '@/components/order';
import { formatDistance } from '@/utils/orders';
import { Colors } from '@/theme';

/**
 * An order awaiting this store's answer. Doc 05 §24 — "urgent acceptance items
 * must be visually prioritized".
 *
 * <p>The countdown runs to the server's `acceptanceDeadline`, recomputed from
 * that instant on every tick. A local timer started when the card mounted would
 * drift from the deadline the backend actually enforces, and this is the one
 * number the supplier is making a decision against.
 *
 * <p>The amount is the full total, not `acceptedAmount`: nothing has been
 * accepted yet, and a committed figure of zero is not what is being decided on.
 */
export function PendingOrderCard({
  order,
  onPress,
}: {
  order: IncomingOrder;
  onPress: () => void;
}) {
  return (
    <MandiCard onPress={onPress} outlined accentColor={Colors.primary}>
      <OrderCardBody
        primary={order.outletName}
        secondary={[
          order.restaurantName,
          order.outletLocality,
          formatDistance(order.distanceKm),
        ]}
        items={order.items}
        orderNumber={order.orderNumber}
        paymentMethod={order.paymentMethod}
              createdAt={order.createdAt}
        amount={order.totalAmount}
        trailing={
          <MandiCountdown
            deadlineAt={order.acceptanceDeadline}
            slaSeconds={order.responseSlaSeconds ?? undefined}
          />
        }
      />
    </MandiCard>
  );
}
