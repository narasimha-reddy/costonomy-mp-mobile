/** Notifications and realtime. Mirrors the DTOs field for field (D-061). */

export type NotificationCategory =
  | 'ORDERS' | 'APPROVALS' | 'PAYMENTS' | 'CREDIT' | 'DELIVERY' | 'MARKETPLACE';

export type NotificationChannel = 'IN_APP' | 'PUSH' | 'SMS';

export interface AppNotification {
  id: number;
  category: NotificationCategory;
  eventType: string;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: number | null;
  /** Critical ones are never silenced by a preference. */
  critical: boolean;
  read: boolean;
  createdAt: string;
}

/**
 * @param unreadCount server-backed, because §23A.27 requires it — a badge counted
 *                    on one phone disagrees with the same user's other one.
 */
export interface NotificationInbox {
  unreadCount: number;
  notifications: AppNotification[];
}

export interface NotificationPreference {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

// ── Realtime ──────────────────────────────────────────────────────────

export interface RealtimeTicket {
  ticket: string;
  url: string;
  expiresAt: string;
  /** The newest event id on these channels — a fresh client starts here, not at zero. */
  cursor: number | null;
  channels: string[];
}

/**
 * One event, identical on every transport.
 *
 * <p>The socket frame, the polling response and a reconnect replay are all this
 * shape, so the app writes one handler and a fact cannot exist on one transport
 * and not another.
 *
 * <p><b>An event is a prompt to refresh, never the record.</b> Authoritative state
 * always comes from the resource's own endpoint — which is why nothing in this
 * app writes a payload from here into a screen.
 */
export interface RealtimeEvent {
  cursor: number;
  channel: string;
  eventType: string;
  aggregateType: string;
  aggregateId: number | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

export interface RealtimeEventPage {
  cursor: number | null;
  hasMore: boolean;
  events: RealtimeEvent[];
}
