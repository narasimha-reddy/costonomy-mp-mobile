import type { Money } from '@/utils/money';

/** Which end of a conversation somebody is on. */
export type ChatSide = 'RESTAURANT' | 'SUPPLIER';

/** What can be shared into a conversation. */
export type ChatAttachmentType = 'REQUEST' | 'ORDER';

/**
 * One conversation, as the inbox shows it.
 *
 * <p>`counterpartName` is whoever the reader is not — the same row serves both
 * sides, so a kitchen sees the store's name and the store sees the outlet's.
 */
export interface ChatThread {
  id: number;
  outletId: number;
  supplierStoreId: number;
  counterpartName: string;
  counterpartSubtitle: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastMessageSide: ChatSide | null;
  unreadCount: number;
  /**
   * Whether a message can be sent right now.
   *
   * <p>The server's answer, not this app's. Either party's chat being switched
   * off closes the composer, and the app cannot know about the other party.
   */
  canSend: boolean;
  /** Why not, in words to show. Null when it can. */
  disabledReason: string | null;
}

export interface ChatAttachment {
  type: ChatAttachmentType;
  id: number;
  reference: string;
}

export interface ChatMessage {
  id: number;
  senderSide: ChatSide;
  senderUserId: number;
  body: string | null;
  attachment: ChatAttachment | null;
  createdAt: string;
}

export interface ChatThreadDetail {
  thread: ChatThread;
  messages: ChatMessage[];
}

/** One request or order that could be shared into this conversation. */
export interface ChatShareable {
  type: ChatAttachmentType;
  id: number;
  reference: string;
  status: string;
  createdAt: string;
}

/** Unused import guard — Money is re-exported for screens that format totals. */
export type { Money };
