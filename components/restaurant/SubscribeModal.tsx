import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { createSubscription } from '@/services/subscription';
import { fetchAvailableSlots } from '@/services/delivery';
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

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState(defaultUnit);
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('DAILY');
  const [startDate, setStartDate] = useState(tomorrow);
  const [preferredSlotId, setPreferredSlotId] = useState<number | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<'SUPPLIER_DELIVERY' | 'COSTONOMY_DELIVERY' | 'PICKUP'>('SUPPLIER_DELIVERY');
  const [notes, setNotes] = useState('');

  // Fetch slots
  const { data: slots = [] } = useQuery({
    queryKey: ['available-slots', supplierStoreId, startDate],
    queryFn: () => fetchAvailableSlots(accessToken as string, supplierStoreId, startDate),
    enabled: visible && Boolean(supplierStoreId) && accessToken != null,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createSubscription(accessToken as string, outletId as number, {
        supplierStoreId,
        supplierSkuId,
        quantity: Number(quantity) || 1,
        unit,
        frequency,
        preferredSlotId: preferredSlotId ?? undefined,
        deliveryMode,
        startDate,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.show(`Subscribed to ${productName}!`, 'success');
      queryClient.invalidateQueries({ queryKey: ['outlet-subscriptions', outletId] });
      onClose();
    },
    onError: (err) => {
      toast.show(err instanceof ApiError ? err.message : 'Could not set up subscription', 'error');
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
                Automatic daily replenishment like BigBasket Daily. Pause or skip any time.
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
              <MandiFormField
                label="Unit"
                value={unit}
                onChangeText={setUnit}
                style={styles.flex}
              />
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
              {[
                { label: 'Supplier Delivery', value: 'SUPPLIER_DELIVERY' as const },
                { label: 'Costonomy Courier', value: 'COSTONOMY_DELIVERY' as const },
                { label: 'Store Pickup', value: 'PICKUP' as const },
              ].map((m) => {
                const active = deliveryMode === m.value;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => setDeliveryMode(m.value)}
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

            <View style={styles.buttonRow}>
              <MandiButton
                label="Confirm Subscription"
                size="lg"
                loading={mutation.isPending}
                onPress={() => mutation.mutate()}
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
