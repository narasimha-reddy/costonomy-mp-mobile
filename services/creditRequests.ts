import { apiRequest } from '@/lib/api/client';
import type { CreditPolicy, RequestContext } from '@/models/creditRequest';

/** What this store knows about the restaurant asking. Needs CREDIT_REQUEST_VIEW; a 404 means not yours or gone. */
export function fetchRequestContext(token: string, storeId: number, agreementId: number): Promise<RequestContext> {
  return apiRequest<RequestContext>(
    `/api/v1/supplier-stores/${storeId}/credit/requests/${agreementId}/context`, { token });
}

/** The store's usual credit terms (what "Approve at my usual terms" sends). */
export function fetchCreditPolicy(token: string, storeId: number): Promise<CreditPolicy> {
  return apiRequest<CreditPolicy>(`/api/v1/supplier-stores/${storeId}/credit-policy`, { token });
}
