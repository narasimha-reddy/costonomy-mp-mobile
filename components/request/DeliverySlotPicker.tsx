import React, { useState, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchAvailableSlots } from '@/services/delivery';
import { MandiCard, MandiText, MandiSkeletonList } from '@/components/common';
import { istDay } from '@/lib/delivery/deliveryDay';
import { Colors, Radius, Spacing } from '@/theme';

interface DeliverySlotPickerProps {
  supplierStoreId: number;
  selectedSlotId: number | null;
  /** The chosen day, or null for as soon as possible (no slot, no day). */
  selectedDate: string | null;
  onSelect: (slotId: number | null, scheduledDate: string | null) => void;
}

export function DeliverySlotPicker({
  supplierStoreId,
  selectedSlotId,
  selectedDate,
  onSelect,
}: DeliverySlotPickerProps) {
  const { accessToken } = useSession();

  // India's days, as the server counts them: UTC's date is still yesterday in the early morning.
  const dateOptions = [
    { label: 'Today', value: istDay(0) },
    { label: 'Tomorrow', value: istDay(1) },
    { label: 'In 2 days', value: istDay(2) },
  ];

  // As soon as possible is no day and no slot, and is what "Immediate" in the cart means.
  const asap = selectedDate == null;

  const [date, setDate] = useState<string>(selectedDate || istDay(1));

  // The parent may change the day after this has mounted (the day the buyer asked for when sending).
  useEffect(() => {
    if (selectedDate && selectedDate !== date) setDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['available-slots', supplierStoreId, date],
    queryFn: () => fetchAvailableSlots(accessToken as string, supplierStoreId, date),
    enabled: accessToken != null && Boolean(supplierStoreId),
  });

  // Start a chosen day on its first available slot. Not while as soon as possible is chosen: that has no slot.
  useEffect(() => {
    if (!asap && slots.length > 0) {
      const firstAvailable = slots.find((s) => s.available);
      if (firstAvailable && (!selectedSlotId || !slots.some((s) => s.id === selectedSlotId && s.available))) {
        onSelect(firstAvailable.id, date);
      }
    }
  }, [slots, date, asap]);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    onSelect(null, newDate);
  };

  return (
    <MandiCard>
      <MandiText variant="bodyEmphasis">When should it arrive?</MandiText>
      <Pressable
        onPress={() => onSelect(null, null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: asap, checked: asap }}
        style={[styles.option, asap && styles.optionActive, styles.asap]}
      >
        <MandiText variant="bodyEmphasis">As soon as possible</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          Sent out as soon as the order is ready, with no fixed time
        </MandiText>
      </Pressable>
      <MandiText variant="caption" color={Colors.textSecondary} style={styles.orPick}>
        Or pick a day and a time slot
      </MandiText>

      {/* Date Tabs */}
      <View style={styles.dateTabs}>
        {dateOptions.map((opt) => {
          const active = !asap && date === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => handleDateChange(opt.value)}
              style={[styles.dateTab, active && styles.dateTabActive]}
            >
              <MandiText
                variant="captionEmphasis"
                color={active ? Colors.primary : Colors.textSecondary}
              >
                {opt.label}
              </MandiText>
            </Pressable>
          );
        })}
      </View>

      {/* Slots List */}
      {isLoading ? (
        <MandiSkeletonList count={2} />
      ) : slots.length === 0 ? (
        <MandiText variant="caption" color={Colors.textTertiary} style={styles.empty}>
          Standard on-demand dispatch (no predefined slots configured)
        </MandiText>
      ) : (
        <View style={styles.options}>
          {slots.map((slot) => {
            const active = selectedSlotId === slot.id;
            return (
              <Pressable
                key={slot.id}
                disabled={!slot.available}
                onPress={() => onSelect(slot.id, date)}
                style={[
                  styles.option,
                  active && styles.optionActive,
                  !slot.available && styles.optionDisabled,
                ]}
              >
                <View style={styles.flex}>
                  <View style={styles.row}>
                    <MandiText variant="bodyEmphasis">{slot.slotName}</MandiText>
                    <MandiText variant="caption" color={Colors.primary}>
                      {slot.startTime.substring(0, 5)} - {slot.endTime.substring(0, 5)}
                    </MandiText>
                  </View>
                  <MandiText variant="caption" color={slot.available ? Colors.textSecondary : Colors.danger}>
                    {slot.available
                      ? `${slot.availableCapacity} slots available (Cutoff: ${slot.orderCutoffTime.substring(0, 5)})`
                      : slot.unavailableReason ?? 'Not available'}
                  </MandiText>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateTabs: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  dateTab: {
    flex: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateTabActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  options: { gap: Spacing.sm, marginTop: Spacing.sm },
  option: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionActive: { borderColor: Colors.primary, borderWidth: 2 },
  optionDisabled: { opacity: 0.5 },
  empty: { marginTop: Spacing.sm, fontStyle: 'italic' },
  asap: { marginTop: Spacing.sm },
  orPick: { marginTop: Spacing.sm },
});
