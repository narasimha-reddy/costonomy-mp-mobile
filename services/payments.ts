import { apiRequest } from '@/lib/api/client';
import type { Money } from '@/utils/money';

/**
 * `PaymentDtos.PaymentResponse`. The fields this app reads; the server sends more.
 *
 * <p>`failureReason`, not `failureMessage` — the old name matched nothing the
 * server sends, so a decline always fell back to generic copy.
 */
export interface Payment {
  id: number;
  supplierOrderId: number;
  status: string;
  provider: string;
  authorizedAmount: Money;
  capturedAmount: Money;
  currency: string;
  failureCode: string | null;
  failureReason: string | null;
  /** Whether the order may reach its supplier. The server's rule — do not infer it from `status`. */
  fundsSecured: boolean;
}

export function fetchPayment(token: string, paymentId: number): Promise<Payment> {
  return apiRequest<Payment>(`/api/v1/payments/${paymentId}`, { token });
}

/**
 * Tell the server which payment to look at; it asks the provider what happened.
 *
 * <p>Doc 05 §14: "never infer final financial success only from client callback".
 * This sends an id and nothing else — the client has no way to assert a payment
 * succeeded, by design.
 */
export function confirmPayment(
  token: string,
  paymentId: number,
  providerPaymentId: string,
): Promise<Payment> {
  return apiRequest<Payment>(`/api/v1/payments/${paymentId}/confirm`, {
    method: 'POST',
    token,
    body: { providerPaymentId },
  });
}

/**
 * Stand in for the provider's hosted checkout, which the mock provider does not
 * have. Refused unless the server is running on a mock provider, so this is a
 * development affordance and cannot become a way to authorise real money.
 */
export function simulateCheckout(token: string, paymentId: number): Promise<{ providerPaymentId: string }> {
  return apiRequest<{ providerPaymentId: string }>(
    `/api/v1/internal/payments/${paymentId}/simulate-checkout`,
    { method: 'POST', token },
  );
}
