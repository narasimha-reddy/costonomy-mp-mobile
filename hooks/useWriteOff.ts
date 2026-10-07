import { writeOffErrorText } from '@/lib/credit/creditNotes';
import { useKeyedWrite } from '@/hooks/useKeyedWrite';
import { writeOffInvoice, writeOffLine } from '@/services/credit';
import type { WriteOffBody } from '@/models/credit';

export interface WriteOffTarget {
  kind: 'invoice' | 'line';
  id: number;
}

/** Write off one invoice, or everything owed on a line. The key is made per (store, target, whole body). */
export function useWriteOff(agreementId: number | null) {
  const { run, ...rest } = useKeyedWrite(agreementId, {
    signature: (a: { target: WriteOffTarget; body: WriteOffBody }, storeId) => [
      'supplier-write-off', storeId, a.target.kind, a.target.id, a.body.amount ?? '', a.body.reason,
      a.body.quickReason ?? '', a.body.keepLineOpen === true ? 'keep' : 'pause',
    ].join('|'),
    call: (token, a, key) => (a.target.kind === 'invoice'
      ? writeOffInvoice(token, a.target.id, a.body, key)
      : writeOffLine(token, a.target.id, a.body, key)),
    errorText: writeOffErrorText,
  });
  return { writeOff: (target: WriteOffTarget, body: WriteOffBody) => run({ target, body }), ...rest };
}
