import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { recordPayment } from '@/services/credit';
import type { CreditInvoice } from '@/models/credit';
import {
  MandiBottomSheet,
  MandiButton,
  MandiFormField,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing } from '@/theme';
import { radioState } from '@/lib/a11y';

const PAYMENT_METHODS = [
  { label: 'Bank Transfer / NEFT', value: 'BANK_TRANSFER' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Cash', value: 'CASH' },
];

export function RecordPaymentModal({
  visible,
  onClose,
  invoice,
  agreementId,
  storeId,
}: {
  visible: boolean;
  onClose: () => void;
  invoice: CreditInvoice | null;
  agreementId: number;
  storeId: number;
}) {
  const { accessToken } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  // One key per attempt at this payment: the same across a retry whose outcome is unknown (so a retry cannot record the
  // repayment twice), a new one once the server answered definitively or what is being sent changed. It used to be built
  // inside the mutation, so every tap, retry included, was a new payment.
  const idempotency = useIdempotencyKey();

  // Pre-fill full outstanding amount when modal opens
  React.useEffect(() => {
    idempotency.reset();
    if (invoice) {
      setAmount(String(invoice.outstanding));
      setMethod('BANK_TRANSFER');
      setReference('');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);

  const outstanding = invoice ? Number(invoice.outstanding) : 0;
  const enteredAmount = Number(amount);
  const isValidAmount = enteredAmount > 0 && enteredAmount <= outstanding;

  const mutation = useMutation({
    mutationFn: () => {
      if (!invoice) throw new Error('No invoice selected');
      return recordPayment(
        accessToken as string,
        invoice.id,
        {
          amount: String(enteredAmount),
          method,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        },
        idempotency.key(),
      );
    },
    onSuccess: () => {
      idempotency.settle();
      toast.show('Repayment recorded and credit limit restored', 'success');
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId] });
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId, 'invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['credit-agreement', agreementId, 'ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });
      onClose();
    },
    onError: (err) => {
      idempotency.settle(err);
      toast.show(err instanceof ApiError ? err.message : 'Could not record repayment.', 'error');
    },
  });

  if (!invoice) return null;

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={() => {
        idempotency.reset();
        onClose();
      }}
      title={`Record Payment for ${invoice.invoiceNumber}`}
    >
      <View style={styles.container}>
        <View style={styles.summaryCard}>
          <MandiText variant="caption" color={Colors.textSecondary}>Outstanding Balance</MandiText>
          <MandiText variant="display">{formatMoney(invoice.outstanding)}</MandiText>
          <MandiText variant="caption" color={Colors.textTertiary}>
            Invoice total: {formatMoney(invoice.amount)} · Due {invoice.dueDate ?? '—'}
          </MandiText>
        </View>

        <MandiFormField
          label="Amount Received (₹)"
          value={amount}
          onChangeText={(val) => {
            idempotency.reset();
            setAmount(val.replace(/[^\d.]/g, ''));
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          required
          hint={
            enteredAmount > outstanding
              ? 'Amount cannot exceed invoice outstanding balance'
              : enteredAmount === outstanding
              ? 'Full payment'
              : enteredAmount > 0
              ? 'Partial payment'
              : undefined
          }
        />

        <View>
          <MandiText variant="label">Payment Mode</MandiText>
          <View style={styles.methodsGrid}>
            {PAYMENT_METHODS.map((m) => {
              const active = m.value === method;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => {
                    idempotency.reset();
                    setMethod(m.value);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={radioState(active)}
                  accessibilityLabel={m.label}
                  style={[styles.methodChip, active && styles.methodChipActive]}
                >
                  <MandiText
                    variant="captionEmphasis"
                    color={active ? Colors.primary : Colors.textSecondary}
                  >
                    {m.label}
                  </MandiText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <MandiFormField
          label="Transaction / Cheque / UTR Ref"
          value={reference}
          onChangeText={setReference}
          placeholder="e.g. UTR / NEFT / Cheque No."
          hint="Bank or UPI reference for audit trail"
        />

        <MandiFormField
          label="Remarks (Optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Handed over at store"
        />

        <View style={styles.actionRow}>
          <MandiButton
            label="Cancel"
            variant="neutral"
            size="md"
            onPress={onClose}
            style={styles.flex}
          />
          <MandiButton
            label="Confirm Payment"
            size="md"
            disabled={!isValidAmount}
            loading={mutation.isPending}
            onPress={() => mutation.mutate()}
            style={styles.flex}
          />
        </View>
      </View>
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  summaryCard: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceSunken,
    gap: Spacing.xs,
  },
  methodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  methodChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  methodChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
