import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MandiText } from '@/components/common';
import {
  dayChoices, deliverByHoursFor, deliverByLabel,
} from '@/lib/delivery/deliveryDay';
import { Colors, Radius, Spacing } from '@/theme';

/** What the buyer asked for: no day is immediate; a day, and optionally an hour to have it by. */
export interface DeliveryWhen {
  /** Days from today (India), or null for immediate. */
  offset: number | null;
  /** Hour (India) to have it by on that day, or null for any time. */
  byHour: number | null;
}

/**
 * When the buyer would like these requests delivered: now, a day up to a month ahead, and optionally by an hour.
 *
 * <p>One choice for the whole basket, because it is sent with it. A day and not
 * a slot: slots belong to each supplier and are booked when the order is
 * created, so the exact slot is chosen then, starting from this day. It is a
 * preference the supplier sees, not a promise. A party is planned weeks ahead,
 * so the days scroll to the furthest the server accepts.
 */
export function DeliveryDayChoice({
  value,
  onChange,
}: {
  value: DeliveryWhen;
  onChange: (when: DeliveryWhen) => void;
}) {
  const days = dayChoices();
  const hours = value.offset == null ? [] : deliverByHoursFor(value.offset);

  return (
    <View style={styles.wrap}>
      <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
        Delivery
      </MandiText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip
          label="Immediate"
          active={value.offset == null}
          onPress={() => onChange({ offset: null, byHour: null })}
        />
        {days.map((day) => (
          <Chip
            key={day.offset}
            label={day.label}
            active={value.offset === day.offset}
            onPress={() => {
              const stillAhead = value.byHour != null && deliverByHoursFor(day.offset).includes(value.byHour);
              onChange({ offset: day.offset, byHour: stillAhead ? value.byHour : null });
            }}
          />
        ))}
      </ScrollView>
      {value.offset != null && (
        <View style={styles.wrapRow}>
          <Chip
            label="Any time"
            active={value.byHour == null}
            onPress={() => onChange({ ...value, byHour: null })}
          />
          {hours.map((hour) => (
            <Chip
              key={hour}
              label={deliverByLabel(hour)}
              active={value.byHour === hour}
              onPress={() => onChange({ ...value, byHour: hour })}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Delivery: ${label}`}
      style={[styles.chip, active && styles.chipActive]}
    >
      <MandiText variant="caption" color={active ? Colors.surface : Colors.textSecondary}>
        {label}
      </MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  chips: { flexDirection: 'row', gap: Spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
});
