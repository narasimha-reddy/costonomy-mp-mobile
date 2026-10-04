import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { createSubscription } from '@/services/subscription';
import { fetchAvailableSlots } from '@/services/delivery';
import { useOutletCredit } from '@/hooks/useOutletCredit';
import {
  DELIVERY_MODES, PAYMENT_METHODS, buildSubscriptionPayload, tomorrowInIndia,
  type SubscriptionDeliveryMode, type SubscriptionPaymentMethod,
} from '@/lib/subscription/form';
import {
  MandiButton,
  MandiCard,
  MandiFormField,
  MandiHeader,
  MandiText,
  useToast,
} from '@/components/common';
import type { SubscriptionFrequency } from '@/models/subscription';
import { ApiError } from '@/lib/api/errors';
import { Colors, Radius, Spacing } from '@/theme';

interface SubscribeModalProps {
  visible: boolean;
  onClose: () => void;
  supplierStoreId: number;
  supplierSkuId: number;
  productName: string;
  defaultUnit?: string;
}

export function SubscribeModal({
  visible,
  onClose,
  supplierStoreId,
  supplierSkuId,
  productName,
  defaultUnit = 'KG',
}: SubscribeModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId } = useOutlet();

  // Tomorrow in India, as the server counts it, not the phone's UTC date.
  const tomorrow = tomorrowInIndia();
  const { creditFor } = useOutletCredit();
  const creditActive = creditFor(supplierStoreId)?.status === 'ACTIVE';

  const [quantity, setQuantity] = useState('1');
  // The SKU's own unit: shown, not chosen. The server takes it from the SKU whatever is sent.
  const unit = defaultUnit;
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('DAILY');
  const [startDate] = useState(tomorrow);
  const [preferredSlotId, setPreferredSlotId] = useState<number | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<SubscriptionDeliveryMode>('SUPPLIER_DELIVERY');
  const [paymentMethod, setPaymentMethod] = useState<SubscriptionPaymentMethod>('WALLET');
  const [notes, setNotes] = useState('');
  // The refusal, inside the sheet where it can be read and acted on: a toast sits behind a modal.
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch slots
  const { data: slots = [] } = useQuery({
    queryKey: ['available-slots', supplierStoreId, startDate],
    queryFn: () => fetchAvailableSlots(accessToken as string, supplierStoreId, startDate),
    enabled: visible && Boolean(supplierStoreId) && accessToken != null,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const built = buildSubscriptionPayload({
        supplierStoreId, supplierSkuId, quantity, unit, frequency, startDate, paymentMethod, deliveryMode,
        preferredSlotId, notes,
      });
      // Unfinished input is refused here with the reason, never quietly turned into an order of one.
      if (!built.ok) throw new ApiError({ code: 'VALIDATION_ERROR', status: 400, message: built.message });
      return createSubscription(accessToken as string, outletId as number, built.payload);
    },
    onSuccess: () => {
      toast.show(`Subscribed to ${productName}!`, 'success');
      queryClient.invalidateQueries({ queryKey: ['outlet-subscriptions', outletId] });
      onClose();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : 'Could not set up the subscription. Try again.');
    },
  });

  const frequencies: { label: string; value: SubscriptionFrequency }[] = [
    { label: 'Every Day', value: 'DAILY' },
    { label: 'Weekdays (Mon-Fri)', value: 'WEEKDAYS' },
    { label: 'Alternate Days', value: 'ALTERNATE_DAYS' },
    { label: 'Weekly', value: 'WEEKLY' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <MandiHeader title="Daily Subscription" back onBack={onClose} />
          <ScrollView contentContainerStyle={styles.content}>
            <MandiCard>
              <MandiText variant="bodyEmphasis">{productName}</MandiText>
              <MandiText variant="caption" color={Colors.textSecondary}>
                Delivered on your schedule, paid for each time from your wallet or on credit. Pause or skip any time.
              </MandiText>
            </MandiCard>

            <View style={styles.row}>
              <MandiFormField
                label="Quantity"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                style={styles.flex}
              />
              <View style={styles.flex}>
                <MandiText variant="captionEmphasis" color={Colors.textSecondary}>Unit</MandiText>
                <MandiText variant="body">{unit}</MandiText>
              </View>
            </View>

            <MandiText variant="captionEmphasis" style={styles.sectionLabel}>
              Delivery Frequency
            </MandiText>
            <View style={styles.freqRow}>
              {frequencies.map((f) => {
                const active = frequency === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => setFrequency(f.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={f.label}
                    style={[styles.freqPill, active && styles.freqPillActive]}
                  >
                    <MandiText
                      variant="captionEmphasis"
                      color={active ? Colors.primary : Colors.textSecondary}
                    >
                      {f.label}
                    </MandiText>
                  </Pressable>
                );
              })}
            </View>

            <MandiText variant="captionEmphasis" style={styles.sectionLabel}>
              Delivery Mode
            </MandiText>
            <View style={styles.freqRow}>
              {DELIVERY_MODES.map((m) => {
                const active = deliveryMode === m.value;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => setDeliveryMode(m.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={m.label}
                    style={[styles.freqPill, active && styles.freqPillActive]}
                  >
                    <MandiText
                      variant="caption"
                      color={active ? Colors.primary : Colors.textSecondary}
                    >
                      {m.label}
                    </MandiText>
                  </Pressable>
                );
              })}
            </View>

            <MandiText variant="captionEmphasis" style={styles.sectionLabel}>
              Payment
            </MandiText>
            <View style={styles.freqRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = paymentMethod === m.value;
                // Credit only where this supplier has extended it: the server refuses it otherwise.
                const disabled = m.value === 'CREDIT' && !creditActive;
                return (
                  <Pressable
                    key={m.value}
                    onPress={disabled ? undefined : () => setPaymentMethod(m.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled }}
                    accessibilityLabel={disabled ? `${m.label}, not available with this supplier` : m.label}
                    style={[styles.freqPill, active && styles.freqPillActive, disabled && { opacity: 0.5 }]}
                  >
                    <MandiText
                      variant="caption"
                      color={active ? Colors.primary : Colors.textSecondary}
                    >
                      {m.label}
                    </MandiText>
                  </Pressable>
                );
              })}
            </View>
            {!creditActive && (
              <MandiText variant="caption" color={Colors.textSecondary}>
                Credit isn&apos;t set up with this supplier yet.
              </MandiText>
            )}

            {slots.length > 0 && deliveryMode !== 'PICKUP' && (
              <>
                <MandiText variant="captionEmphasis" style={styles.sectionLabel}>
                  Preferred Delivery Window
                </MandiText>
                <View style={styles.slotsCol}>
                  {slots.map((s) => {
                    const active = preferredSlotId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setPreferredSlotId(s.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${s.slotName}, ${s.startTime.substring(0, 5)} to ${s.endTime.substring(0, 5)}`}
                        style={[styles.slotOption, active && styles.slotOptionActive]}
                      >
                        <MandiText variant="bodyEmphasis">{s.slotName}</MandiText>
                        <MandiText variant="caption" color={Colors.textSecondary}>
                          {s.startTime.substring(0, 5)} - {s.endTime.substring(0, 5)}
                        </MandiText>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <MandiFormField
              label="Special instructions / notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Leave crate by side kitchen dock"
            />

            {formError != null && (
              <MandiText variant="caption" color={Colors.danger} accessibilityLiveRegion="polite">
                {formError}
              </MandiText>
            )}

            <View style={styles.buttonRow}>
              <MandiButton
                label="Confirm Subscription"
                size="lg"
                loading={mutation.isPending}
                onPress={() => {
                  setFormError(null);
                  mutation.mutate();
                }}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '90%',
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  sectionLabel: { marginTop: Spacing.xs, color: Colors.textSecondary },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  freqPill: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  freqPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  slotsCol: { gap: Spacing.xs },
  slotOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  slotOptionActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  buttonRow: { marginTop: Spacing.md },
});
