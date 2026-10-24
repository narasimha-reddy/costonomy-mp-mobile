import { creditNoteErrorText } from '@/lib/credit/creditNotes';
import { useKeyedWrite } from '@/hooks/useKeyedWrite';
import { issueCreditNote } from '@/services/credit';
import type { CreditNoteBody } from '@/models/credit';

/** Issue a credit note on one invoice. The key is made per (store, invoice, amount, reason, note). */
export function useIssueCreditNote(agreementId: number | null) {
  const { run, ...rest } = useKeyedWrite(agreementId, {
    signature: (a: { invoiceId: number; body: CreditNoteBody }, storeId) => [
      'supplier-credit-note', storeId, a.invoiceId, a.body.amount, a.body.reasonCode, a.body.note ?? '', a.body.disputeId ?? '',
    ].join('|'),
    call: (token, a, key) => issueCreditNote(token, a.invoiceId, a.body, key),
    errorText: creditNoteErrorText,
  });
  return { issue: (invoiceId: number, body: CreditNoteBody) => run({ invoiceId, body }), ...rest };
}
