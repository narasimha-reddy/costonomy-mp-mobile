import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiButton } from '@/components/common';
import { CreditNoteSheet } from '@/components/credit/CreditNoteSheet';
import { WriteOffSheet } from '@/components/credit/WriteOffSheet';
import { useStore } from '@/contexts/StoreProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { mayIssueCreditNote, mayWriteOffInvoice } from '@/lib/credit/creditNotes';
import type { CreditInvoiceDetail } from '@/models/credit';
import { Spacing } from '@/theme';

/**
 * "Issue credit note" and "Write off" on the supplier's invoice screen, with their sheets. Each
 * shows only for someone who holds its permission and only while the invoice is open and owed
 * (the server checks again, and answers 404 to anyone without CREDIT_WRITE_OFF).
 */
export function InvoiceCreditActions({ invoice, offline }: {
  invoice: Pick<CreditInvoiceDetail, 'id' | 'agreementId' | 'invoiceNumber' | 'status' | 'outstanding'>;
  offline: boolean;
}) {
  const { store } = useStore();
  const { canForStore } = usePermissions();
  const mayNote = mayIssueCreditNote(invoice, canForStore, store);
  const mayOff = mayWriteOffInvoice(invoice, canForStore, store);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteSession, setNoteSession] = useState(0);
  const [offOpen, setOffOpen] = useState(false);
  const [offSession, setOffSession] = useState(0);

  if (!mayNote && !mayOff) return null;
  return (
    <>
      <View style={styles.actions}>
        {mayNote && (
          <MandiButton
            testID="invoice-credit-note"
            label="Issue credit note"
            variant="secondary"
            icon="receipt-outline"
            disabled={offline}
            onPress={() => { setNoteSession((n) => n + 1); setNoteOpen(true); }}
          />
        )}
        {mayOff && (
          <MandiButton
            testID="invoice-write-off"
            label="Write off"
            variant="neutral"
            icon="close-circle-outline"
            disabled={offline}
            onPress={() => { setOffSession((n) => n + 1); setOffOpen(true); }}
          />
        )}
      </View>
      {mayNote && (
        <CreditNoteSheet
          key={`note-${noteSession}`}
          visible={noteOpen}
          onClose={() => setNoteOpen(false)}
          invoice={invoice}
          offline={offline}
        />
      )}
      {mayOff && (
        <WriteOffSheet
          key={`off-${offSession}`}
          visible={offOpen}
          onClose={() => setOffOpen(false)}
          target={{
            kind: 'invoice', id: invoice.id, agreementId: invoice.agreementId, title: invoice.invoiceNumber, outstanding: invoice.outstanding,
          }}
          offline={offline}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.sm },
});
