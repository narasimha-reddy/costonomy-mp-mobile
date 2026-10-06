import type { Money } from '@/utils/money';

/** One thing that happened on a credit line with this store (newest first in the list). */
export interface RequestHistoryEvent {
  at: string;
  /** REQUESTED, APPROVED, MODIFIED, REJECTED, SUSPENDED, REINSTATED, CLOSED or EXPIRED. */
  event: string;
  note: string | null;
}

/**
 * What this store knows about a restaurant asking for credit: orders with THIS store only,
 * as the server counted them. The app shows these words and figures and works none out.
 */
export interface RequestContext {
  agreementId: number;
  status: string;
  outletId: number;
  outletName: string | null;
  restaurantName: string | null;
  /** The India day the figures are for, 'YYYY-MM-DD'. */
  asOf: string;
  windowDays: number;
  ordersCount90d: number;
  ordersValue90d: Money | number;
  averageOrderValue: Money | number | null;
  cancelledOrders90d: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  previousOverdueCount: number;
  pastLineStatus: 'REJECTED' | 'CLOSED' | 'EXPIRED' | null;
  pastLineEndedAt: string | null;
  history: RequestHistoryEvent[];
}

/** The store's credit policy: the terms it usually offers. A default may be missing. */
export interface CreditPolicy {
  supplierStoreId: number;
  creditEnabled: boolean | null;
  defaultCreditLimit: Money | number | null;
  defaultCreditPeriodDays: number | null;
  defaultGracePeriodDays: number | null;
  maxSingleOrderCredit: Money | number | null;
  maxOverdueAmount: Money | number | null;
}
