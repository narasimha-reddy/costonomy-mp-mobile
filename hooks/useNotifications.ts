import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchInbox, markAllRead, markRead } from '@/services/notifications';

/**
 * The inbox and its unread count.
 *
 * <p><b>The count is the server's.</b> §23A.27 requires it to reconcile with the
 * backend: a badge counted on this phone disagrees with the same user's other
 * one, and with what they already read on the web.
 *
 * <p>No polling interval — the realtime provider invalidates this key on every
 * event, so the badge moves when something actually happens rather than on a
 * timer.
 */
export function useNotifications(unreadOnly = false) {
  const { accessToken } = useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', { unreadOnly }],
    queryFn: () => fetchInbox(accessToken as string, { unreadOnly, limit: 50 }),
    enabled: accessToken != null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const read = useMutation({
    mutationFn: (id: number) => markRead(accessToken as string, id),
    onSuccess: invalidate,
  });

  const readAll = useMutation({
    mutationFn: () => markAllRead(accessToken as string),
    onSuccess: invalidate,
  });

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
    markRead: read.mutate,
    markAllRead: readAll.mutate,
    markingAll: readAll.isPending,
  };
}
