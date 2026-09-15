import { apiRequest } from '@/lib/api/client';
import type {
  NotificationInbox,
  NotificationPreference,
  RealtimeEventPage,
  RealtimeTicket,
} from '@/models/notification';

export function fetchInbox(
  token: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationInbox> {
  const params = new URLSearchParams();
  if (options.unreadOnly) params.set('unreadOnly', 'true');
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return apiRequest<NotificationInbox>(`/api/v1/notifications${query ? `?${query}` : ''}`, { token });
}

export function markRead(token: string, id: number) {
  return apiRequest(`/api/v1/notifications/${id}/read`, { method: 'POST', token });
}

export function markAllRead(token: string) {
  return apiRequest('/api/v1/notifications/read-all', { method: 'POST', token });
}

export function fetchPreferences(token: string): Promise<NotificationPreference[]> {
  return apiRequest<NotificationPreference[]>('/api/v1/notification-preferences', { token });
}

export function updatePreferences(
  token: string,
  preferences: NotificationPreference[],
): Promise<NotificationPreference[]> {
  return apiRequest<NotificationPreference[]>('/api/v1/notification-preferences', {
    method: 'PATCH',
    token,
    body: { preferences },
  });
}

// ── Realtime ──────────────────────────────────────────────────────────

/**
 * A single-use, seconds-long ticket for the socket.
 *
 * <p>A ticket rather than the access token because a browser cannot set headers
 * on a WebSocket, and a token in a query string ends up in access logs. Spent on
 * connection, so every reconnect needs a fresh one.
 */
export function fetchRealtimeTicket(token: string): Promise<RealtimeTicket> {
  return apiRequest<RealtimeTicket>('/api/v1/realtime/ticket', { method: 'POST', token });
}

/** The polling fallback, and the catch-up after a reconnect. */
export function fetchRealtimeEvents(
  token: string,
  cursor: number | null,
  limit?: number,
): Promise<RealtimeEventPage> {
  const params = new URLSearchParams();
  if (cursor != null) params.set('cursor', String(cursor));
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return apiRequest<RealtimeEventPage>(`/api/v1/realtime/events${query ? `?${query}` : ''}`, { token });
}
