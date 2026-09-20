import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchOutletThreads, fetchStoreThreads } from '@/services/chat';
import type { ChatThread } from '@/models/chat';

/**
 * This account's conversations. D-095.
 *
 * <p><b>The scope is passed in, not read from a provider.</b> `OutletProvider`
 * lives under the restaurant navigator and `StoreProvider` under the supplier
 * one, so a hook reaching for both throws on whichever side is missing — which
 * it did, and took the supplier home screen down with it. The caller already
 * knows which side it is on and which id it holds.
 *
 * <p>Polled while a screen using it is open. Chat is the one thing in this app
 * that arrives without the reader doing anything; everything else changes
 * because somebody tapped. A socket would be better and is what `realtime` is
 * for — this is the honest version until a chat channel exists, which is also
 * why the interval is slow rather than chatty.
 */
const POLL_MS = 20_000;

export function useChatThreads(
  side: 'RESTAURANT' | 'SUPPLIER',
  scopeId: number | null,
) {
  const { accessToken } = useSession();

  const query = useQuery({
    queryKey: ['chat', 'threads', side, scopeId],
    queryFn: () => (side === 'RESTAURANT'
      ? fetchOutletThreads(accessToken as string, scopeId as number)
      : fetchStoreThreads(accessToken as string, scopeId as number)),
    enabled: scopeId != null && accessToken != null,
    refetchInterval: POLL_MS,
  });

  const threads: ChatThread[] = useMemo(() => query.data ?? [], [query.data]);

  return {
    threads,
    /** Conversations with something unread, for the header badge. */
    unreadCount: threads.reduce((total, thread) => total + thread.unreadCount, 0),
    /**
     * Whether this account may chat at all.
     *
     * <p>Read off the threads rather than held as a flag of its own: each one
     * carries the server's `canSend`, and if every one says no then this side is
     * switched off. With no threads yet there is nothing to contradict, so the
     * action stays live and the server refuses the open if it must — which it
     * does, in words the screen shows.
     */
    enabled: threads.length === 0 || threads.some((thread) => thread.canSend),
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
