import type { AppNotification } from '@/models/notification';

/**
 * Where a notification leads.
 *
 * <p><b>The notification says which side it was for; the viewer does not.</b>
 * Every destination here used to be a `/restaurant/...` route, so a supplier
 * tapping "New order" was sent to a restaurant URL they hold no grant on, bounced
 * by the route guard, and landed on their home screen — which is what made every
 * notification look like it did nothing. Routing by the *viewer's* role would fix
 * that for most people and still fail for anyone who is both a supplier and a
 * restaurant, because they have no single role to route by. `audience` is what
 * the server decided when it wrote the row.
 *
 * <p>Returns null when this build has no screen for that pair — a notification
 * that cannot be opened still reads, rather than navigating somewhere wrong.
 * Mobile releases lag the API, so an unknown target is expected, not exceptional.
 */
export function destinationFor(notification: AppNotification): string | null {
  const id = notification.targetId;
  if (id == null) return null;

  const supplier = notification.audience === 'SUPPLIER_STORE';

  switch (notification.targetType) {
    case 'SUPPLIER_ORDER':
      return supplier ? `/supplier/orders/${id}` : `/restaurant/orders/${id}`;

    // The server points these at the order, not the delivery or the dispute:
    // every screen either side has for them is keyed by the order.
    case 'DELIVERY':
      return supplier ? `/supplier/orders/${id}` : `/restaurant/tracking/${id}`;
    case 'DISPUTE':
      return supplier ? `/supplier/orders/${id}` : `/restaurant/dispute/${id}`;

    // A request is an intent, and the server points at its own id. Both sides
    // read it from their own endpoint, so it is the one target with a screen
    // per audience and the same id.
    case 'INTENT':
      return supplier ? `/supplier/requests/${id}` : `/restaurant/requests/${id}`;

    // The thread id, which is what the chat screen reads by. One route for both
    // sides; the chat screen works out the viewer's side from the session.
    case 'CHAT_THREAD':
      return `/chat/${id}`;

    case 'CREDIT_AGREEMENT':
      return supplier ? `/supplier/credit/${id}` : `/restaurant/credit/${id}`;

    // A procurement is a cart, and only its buyer has one.
    case 'PROCUREMENT':
      return supplier ? null : `/restaurant/checkout/${id}`;

    // A subscription whose delivery could not be arranged or was skipped (API D-132): only its restaurant is told, and
    // the list is where it can pause, resume, skip or change it. There is no screen per subscription.
    case 'SUBSCRIPTION':
      return supplier ? null : '/restaurant/subscriptions';

    default:
      return null;
  }
}
