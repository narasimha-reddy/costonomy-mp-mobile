import type { Money } from '@/utils/money';

/** Receiving, disputes and ratings. Mirrors `TrustDtos` exactly (D-061). */

export type ReceivingStatus = 'PENDING' | 'RECEIVED';

export interface ReceivingItem {
  id: number;
  supplierOrderItemId: number;
  productName: string;
  requestedQuantity: Money;
  acceptedQuantity: Money;
  receivedQuantity: Money;
  damagedQuantity: Money;
  missingQuantity: Money;
  unit: string;
  note: string | null;
}

export interface Receiving {
  id: number;
  supplierOrderId: number;
  orderNumber: string;
  status: ReceivingStatus;
  hasDiscrepancy: boolean;
  totalAcceptedQuantity: Money;
  totalReceivedQuantity: Money;
  totalDamagedQuantity: Money;
  totalMissingQuantity: Money;
  notes: string | null;
  receivedAt: string | null;
  items: ReceivingItem[];
}

export type DisputeCategory =
  | 'WRONG_PRODUCT' | 'SHORT_QUANTITY' | 'DAMAGED' | 'EXPIRED'
  | 'QUALITY' | 'INCORRECT_INVOICE' | 'OTHER';

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESPONDED' | 'RESOLVED' | 'REJECTED';

export interface DisputeItem {
  id: number;
  supplierOrderItemId: number;
  productName: string;
  disputedQuantity: Money;
  reason: string | null;
}

export interface DisputeMessage {
  id: number;
  authorSide: string;
  message: string;
  createdAt: string;
}

export interface DisputeEvidence {
  id: number;
  evidenceType: string;
  reference: string;
  caption: string | null;
  createdAt: string;
}

export interface Dispute {
  id: number;
  disputeNumber: string;
  supplierOrderId: number;
  orderNumber: string;
  /** The order's own status — a dispute never changes it (doc 05 §21). */
  supplierOrderStatus: string;
  outletId: number;
  supplierStoreId: number;
  category: DisputeCategory;
  status: DisputeStatus;
  description: string;
  claimedAmount: Money | null;
  resolution: string | null;
  resolutionType: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  items: DisputeItem[];
  messages: DisputeMessage[];
  evidence: DisputeEvidence[];
}

export type RatingModerationStatus = 'PUBLISHED' | 'HIDDEN' | 'PENDING_REVIEW';

export interface Rating {
  id: number;
  supplierOrderId: number;
  supplierStoreId: number;
  overall: number;
  productQuality: number | null;
  quantityAccuracy: number | null;
  packaging: number | null;
  delivery: number | null;
  comment: string | null;
  moderationStatus: RatingModerationStatus;
  createdAt: string;
}

/** `averageOverall` is null when nobody has rated — doc 07 §4, never a default of three. */
export interface RatingSummary {
  supplierStoreId: number;
  ratingCount: number;
  averageOverall: Money | null;
  averageProductQuality: Money | null;
  averageQuantityAccuracy: Money | null;
  averagePackaging: Money | null;
  averageDelivery: Money | null;
  recent: Rating[];
}
