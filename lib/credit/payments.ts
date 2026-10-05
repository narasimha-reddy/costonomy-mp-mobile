import type { CreditPaymentSource } from '@/models/credit';

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  ADJUSTMENT: 'Adjustment',
};

/** A payment method in plain words. An unknown method is shown as the server sent it. */
export function methodLabel(method: string | null | undefined): string | null {
  if (method == null || method.trim() === '') return null;
  return METHOD_LABELS[method] ?? method;
}

/** The headline of a payment row: who the money came through. */
export function paymentTitle(source: CreditPaymentSource | string, supplierName: string | null): string {
  const supplier = supplierName ?? 'the supplier';
  switch (source) {
    case 'WALLET': return 'From wallet';
    case 'SUPPLIER_RECORDED': return `Recorded by ${supplier}`;
    case 'CLAIM_CONFIRMED': return `You reported this · confirmed by ${supplier}`;
    default: return 'Payment';
  }
}

/**
 * The second line of a payment row: method and reference, when there are any.
 *
 * <p>A wallet payment has none: "From wallet" says it all, and its method ("WALLET") and
 * reference ("credit-repayment-13") are internal.
 */
export function paymentDetail(
  method: string | null | undefined,
  reference: string | null | undefined,
  source?: CreditPaymentSource | string,
): string | null {
  if (source === 'WALLET') return null;
  const parts: string[] = [];
  const label = methodLabel(method);
  if (label != null) parts.push(label);
  if (reference != null && reference.trim() !== '') parts.push(`ref ${reference}`);
  return parts.length === 0 ? null : parts.join(' · ');
}
