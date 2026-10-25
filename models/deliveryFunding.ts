import type { Money } from '@/utils/money';

/**
 * What a supplier owes Costonomy for the riders it chose to pay for (D-203, D-204), in the server's names.
 *
 * <p>This is a charge the supplier owes Costonomy, never a payment to a courier: the two are kept apart on
 * the server and must stay apart on the screen.
 */

/** `DELIVERY_FUNDING` is a charge; `DELIVERY_FUNDING_CREDIT` is money back to the supplier after a correction. */
export type DeliveryFundingKind = 'DELIVERY_FUNDING' | 'DELIVERY_FUNDING_CREDIT';

/** Where the money stands, as the server words it. Unknown values from a newer server are shown as received. */
export type DeliveryFundingOutcome =
  | 'OWED'
  | 'PAID_DIRECTLY'
  | 'TAKEN_FROM_SETTLEMENT'
  | 'WAIVED'
  | 'CREDIT_WAITING_FOR_SETTLEMENT'
  | 'CREDITED_IN_SETTLEMENT';

/** What the supplier can do about a line. `PAY_DIRECTLY` means a credit order, which has no payout to take it from. */
export type DeliveryFundingNextAction =
  | 'NONE'
  | 'PAY_DIRECTLY'
  | 'PAY_DIRECTLY_OR_DEDUCTED_FROM_NEXT_SETTLEMENT';

/** `SettlementDtos.DeliveryFundingLine`. */
export interface DeliveryFundingLine {
  deductionId: number;
  kind: DeliveryFundingKind;
  supplierOrderId: number;
  orderNumber: string;
  deliveryId: number | null;
  amount: Money;
  status: string;
  outcome: DeliveryFundingOutcome | string;
  nextAction: DeliveryFundingNextAction | string;
  paymentMethod: string;
  settlementId: number | null;
  appliedAt: string | null;
  paidAt: string | null;
  reason: string;
  createdAt: string;
}

/** `SettlementDtos.DeliveryFundingSummary`: buckets that never overlap. */
export interface DeliveryFundingSummary {
  pending: Money;
  collectedDirectly: Money;
  appliedToSettlement: Money;
  waived: Money;
  creditsPending: Money;
  creditsApplied: Money;
  pendingCount: number;
}

/** `SettlementDtos.InitiateDeliveryFundingPaymentResponse`. */
export interface DeliveryFundingCheckout {
  deductionId: number;
  razorpayOrderId: string;
  keyId: string;
  amount: Money;
  currency: string;
}

/** `SettlementDtos.ConfirmDeliveryFundingPaymentResponse`. */
export interface DeliveryFundingConfirmation {
  deductionId: number;
  status: string;
  paymentId: string;
  amount: Money;
  paidAt: string | null;
}
