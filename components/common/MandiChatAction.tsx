import React from 'react';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { openThread, openThreadFromStore } from '@/services/chat';
import { ApiError } from '@/lib/api/errors';
import { MandiHeaderAction } from './MandiHeader';
import { useToast } from './MandiToast';

/**
 * "Message them", from a request or an order. D-095.
 *
 * <p>One component rather than four copies, so the four detail screens cannot
 * drift on what the icon does or what it says when it cannot.
 *
 * <p><b>It opens the pair's thread, not a thread about this order.</b> A
 * conversation belongs to the two parties — see D-095 for why a thread per
 * order is the wrong shape — so this lands in the same place from every order
 * and every request between them. The order can then be shared *into* it, which
 * is what the share picker is for.
 *
 * <p>Both refusals the server can give are shown in its own words: chat
 * switched off for either account, and a pair that has not traded yet.
 */
export function MandiChatAction({
  outletId,
  supplierStoreId,
  side,
  suggest,
}: {
  outletId: number | null | undefined;
  supplierStoreId: number | null | undefined;
  /** Which end the viewer is on. Decides which endpoint opens the thread. */
  side: 'RESTAURANT' | 'SUPPLIER';
  /**
   * What the person was looking at when they tapped.
   *
   * <p>Carried into the thread so it can offer to share it. Somebody who opens
   * a conversation from an order is almost always writing about that order, and
   * the other side reading "is this ready?" has no way to know which one.
   */
  suggest?: { type: 'REQUEST' | 'ORDER'; id: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const { accessToken } = useSession();

  const open = useMutation({
    mutationFn: () => (side === 'RESTAURANT'
      ? openThread(accessToken as string, outletId as number, supplierStoreId as number)
      : openThreadFromStore(
        accessToken as string, supplierStoreId as number, outletId as number)),
    onSuccess: (thread) => router.push(
      suggest == null
        ? `/chat/${thread.id}`
        : `/chat/${thread.id}?suggestType=${suggest.type}&suggestId=${suggest.id}`),
    onError: (caught) =>
      toast.show(
        caught instanceof ApiError ? caught.message : 'Could not open that conversation.',
        'info',
      ),
  });

  // Nothing to message without both ends. Rendering a dead icon would be worse
  // than the gap: it reads as a control that failed rather than one not yet
  // applicable.
  if (outletId == null || supplierStoreId == null) {
    return null;
  }

  return (
    <MandiHeaderAction
      icon="chatbubble-ellipses-outline"
      label={side === 'RESTAURANT' ? 'Message this supplier' : 'Message this restaurant'}
      onPress={() => open.mutate()}
    />
  );
}

export default MandiChatAction;
