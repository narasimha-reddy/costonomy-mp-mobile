import { apiRequest } from '@/lib/api/client';
import type {
  CreditPayAttempt, CreditPayMethod, CreditPayQuote, PayableInvoices, PayItem,
} from '@/models/creditPay';

export { selectionChangedIds } from '@/lib/credit/pay/errors';

const base = (outletId: number) => `/api/v1/outlets/${outletId}/credit`;

/** What the pay picker lists: open invoices across suppliers, in the server's order. A pure read. */
export function fetchPayableInvoices(token: string, outletId: number): Promise<PayableInvoices> {
  return apiRequest<PayableInvoices>(`${base(outletId)}/payable-invoices`, { token });
}

/**
 * The method sheet's figures for a selection. A pure read; sends the invoice ids and the
 * outstanding the server showed, never a total.
 */
export function quoteCreditPayment(token: string, outletId: number, items: PayItem[]): Promise<CreditPayQuote> {
  return apiRequest<CreditPayQuote>(`${base(outletId)}/payments/quote`, { method: 'POST', token, body: { items } });
}

/** Starts a payment (an online order, or a wallet debit applied at once). One key per attempt. */
export function createCreditPayment(
  token: string,
  outletId: number,
  items: PayItem[],
  method: CreditPayMethod,
  idempotencyKey: string,
): Promise<CreditPayAttempt> {
  return apiRequest<CreditPayAttempt>(`${base(outletId)}/payments`, {
    method: 'POST', token, idempotencyKey, body: { items, method },
  });
}

/** Presents Razorpay's proof; the server checks it and applies the payment. Naturally idempotent. */
export function verifyCreditPayment(
  token: string,
  outletId: number,
  attemptId: number,
  proof: { paymentId: string; signature?: string },
): Promise<CreditPayAttempt> {
  return apiRequest<CreditPayAttempt>(`${base(outletId)}/payments/${attemptId}/verify`, {
    method: 'POST',
    token,
    body: { razorpayPaymentId: proof.paymentId, razorpaySignature: proof.signature },
  });
}

/** Where an attempt has got to. A read: never asks Razorpay, never moves money. */
export function fetchCreditPayment(token: string, outletId: number, attemptId: number | string): Promise<CreditPayAttempt> {
  return apiRequest<CreditPayAttempt>(`${base(outletId)}/payments/${encodeURIComponent(String(attemptId))}`, { token });
}
