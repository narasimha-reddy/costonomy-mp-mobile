import type { PaymentMethod } from '@/components/request/PaymentMethodPicker';

/**
 * One name for each way of paying, used by the picker's options and by the checkout bar's "PAY USING" column.
 * Two lists drifted before ("Pay by card" in one place, "Pay online" in the other); this is the only copy.
 */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CREDIT: 'Mandi Credit',
  WALLET: 'Wallet',
  PREPAID: 'Card / UPI',
};
