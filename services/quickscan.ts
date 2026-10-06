import { apiRequest } from '@/lib/api/client';
import type { QuickScanConfig, QuickScanPayment } from '@/models/quickscan';

/**
 * Whether this outlet can use QuickScan, and on what terms.
 *
 * <p>Read before the scanner opens and again before the pay screen offers a
 * method: the fee, the ceiling and the wallet balance are all the server's
 * figures, refreshed on every visit rather than trusted from a previous screen.
 */
export function fetchQuickScanConfig(token: string, outletId: number): Promise<QuickScanConfig> {
  return apiRequest<QuickScanConfig>(`/api/v1/outlets/${outletId}/quickscan/config`, { token });
}

/**
 * Pay a shop's UPI ID from the outlet wallet.
 *
 * <p>`amount` is rupees as the user entered or the QR fixed it, never a figure
 * computed here — the server adds its own fee and returns the total it actually
 * charged.
 */
export function createQuickScanPayment(
  token: string,
  outletId: number,
  params: {
    payeeVpa: string;
    payeeName?: string;
    amount: string;
    note?: string;
    method: 'WALLET';
  },
  idempotencyKey: string,
): Promise<QuickScanPayment> {
  return apiRequest<QuickScanPayment>(`/api/v1/outlets/${outletId}/quickscan/payments`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: params,
  });
}

/** This outlet's QuickScan payments, newest first. */
export function fetchQuickScanPayments(token: string, outletId: number): Promise<QuickScanPayment[]> {
  return apiRequest<QuickScanPayment[]>(`/api/v1/outlets/${outletId}/quickscan/payments`, { token });
}

/** One payment, for the result screen to poll while it settles. */
export function fetchQuickScanPayment(token: string, paymentId: number): Promise<QuickScanPayment> {
  return apiRequest<QuickScanPayment>(`/api/v1/quickscan/payments/${paymentId}`, { token });
}
