import { apiRequest } from '@/lib/api/client';
import type {
  ChatMessage,
  ChatShareable,
  ChatThread,
  ChatThreadDetail,
} from '@/models/chat';

/** A kitchen's conversations, most recent first. */
export function fetchOutletThreads(token: string, outletId: number): Promise<ChatThread[]> {
  return apiRequest<ChatThread[]>(`/api/v1/outlets/${outletId}/chat/threads`, { token });
}

/** A store's conversations. */
export function fetchStoreThreads(token: string, storeId: number): Promise<ChatThread[]> {
  return apiRequest<ChatThread[]>(`/api/v1/supplier-stores/${storeId}/chat/threads`, { token });
}

/**
 * Open the conversation with a supplier, or return the one that exists.
 *
 * <p>Idempotent on the server by the outlet–store pair, so a double tap cannot
 * make two threads.
 */
export function openThread(
  token: string,
  outletId: number,
  supplierStoreId: number,
): Promise<ChatThread> {
  return apiRequest<ChatThread>(`/api/v1/outlets/${outletId}/chat/threads`, {
    method: 'POST',
    token,
    body: { supplierStoreId },
  });
}

/**
 * The same, from the store's side. D-095 as amended.
 *
 * <p>A supplier answering a question about an order they are filling. The
 * server still requires the two to have traded.
 */
export function openThreadFromStore(
  token: string,
  supplierStoreId: number,
  outletId: number,
): Promise<ChatThread> {
  return apiRequest<ChatThread>(`/api/v1/supplier-stores/${supplierStoreId}/chat/threads`, {
    method: 'POST',
    token,
    body: { outletId },
  });
}

/**
 * One conversation and its messages.
 *
 * <p>`afterId` asks only for what has arrived since, which is how an open
 * thread catches up without re-reading itself.
 */
export function fetchThread(
  token: string,
  threadId: number,
  afterId?: number,
): Promise<ChatThreadDetail> {
  const cursor = afterId == null ? '' : `?afterId=${afterId}`;
  return apiRequest<ChatThreadDetail>(`/api/v1/chat/threads/${threadId}${cursor}`, { token });
}

export function sendMessage(
  token: string,
  threadId: number,
  body: {
    body?: string;
    attachmentType?: 'REQUEST' | 'ORDER';
    attachmentId?: number;
  },
): Promise<ChatMessage> {
  return apiRequest<ChatMessage>(`/api/v1/chat/threads/${threadId}/messages`, {
    method: 'POST',
    token,
    body,
  });
}

export function markThreadRead(token: string, threadId: number): Promise<unknown> {
  return apiRequest<unknown>(`/api/v1/chat/threads/${threadId}/read`, {
    method: 'POST',
    token,
  });
}

/** Requests and orders that can be shared into this conversation. */
export function fetchShareables(token: string, threadId: number): Promise<ChatShareable[]> {
  return apiRequest<ChatShareable[]>(`/api/v1/chat/threads/${threadId}/shareables`, { token });
}
