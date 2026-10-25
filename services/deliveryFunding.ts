import { apiRequest } from '@/lib/api/client';
import type {
  DeliveryFundingCheckout,
  DeliveryFundingConfirmation,
  DeliveryFundingLine,
  DeliveryFundingSummary,
} from '@/models/deliveryFunding';

const base = (storeId: number) => `/api/v1/supplier-stores/${storeId}/delivery-funding`;

/** Every funding line for the store in any state, newest first. `status` narrows it (PENDING, APPLIED, PAID_DIRECTLY, WAIVED). */
export function fetchDeliveryFundingHistory(
  token: string,
  storeId: number,
  options: { status?: string; page?: number; size?: number } = {},
): Promise<DeliveryFundingLine[]> {
  const query = new URLSearchParams();
  if (options.status) query.set('status', options.status);
  query.set('page', String(options.page ?? 0));
  query.set('size', String(options.size ?? 25));
  return apiRequest<DeliveryFundingLine[]>(`${base(storeId)}/history?${query.toString()}`, { token });
}

export function fetchDeliveryFundingSummary(token: string, storeId: number): Promise<DeliveryFundingSummary> {
  return apiRequest<DeliveryFundingSummary>(`${base(storeId)}/summary`, { token });
}

/**
 * Open the gateway checkout for one charge. The amount is the server's: nothing is sent but the key that makes a
 * retry reach the same checkout.
 */
export function initiateDeliveryFundingPayment(
  token: string,
  storeId: number,
  deductionId: number,
  clientKey: string,
): Promise<DeliveryFundingCheckout> {
  return apiRequest<DeliveryFundingCheckout>(`${base(storeId)}/${deductionId}/pay`, {
    method: 'POST', token, body: { clientKey },
  });
}

/** Hand the server the gateway's proof; it verifies the signature and asks the gateway before recording anything. */
export function confirmDeliveryFundingPayment(
  token: string,
  storeId: number,
  deductionId: number,
  proof: { paymentId: string; signature: string },
): Promise<DeliveryFundingConfirmation> {
  return apiRequest<DeliveryFundingConfirmation>(`${base(storeId)}/${deductionId}/confirm`, {
    method: 'POST', token, body: proof,
  });
}
