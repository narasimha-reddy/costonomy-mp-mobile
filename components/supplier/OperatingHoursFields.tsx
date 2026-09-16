import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MandiFormField, MandiText } from '@/components/common';
import type { OperatingHours } from '@/services/supplier';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

/** Monday first, and abbreviated — seven full names do not fit a phone row. */
const DAYS: { key: string; short: string }[] = [
  { key: 'MONDAY', short: 'Mon' },
  { key: 'TUESDAY', short: 'Tue' },
  { key: 'WEDNESDAY', short: 'Wed' },
  { key: 'THURSDAY', short: 'Thu' },
  { key: 'FRIDAY', short: 'Fri' },
  { key: 'SATURDAY', short: 'Sat' },
  { key: 'SUNDAY', short: 'Sun' },
];

/**
 * When this store trades.
 *
 * <p><b>Not a display preference.</b> A shut store cannot answer an order, so a
 * restaurant is shown these hours and cannot order outside them — which is why
 * the helper below states the consequence rather than the rule.
 *
 * <p>Unticking every day is refused rather than saved. It reads as "closed
 * forever", but the server treats no days as no answer and falls back to the
 * defaults — so the store would look open all week to everyone except its owner.
 * Going offline is the control for "stop taking orders", and it says so.
 */
export function OperatingHoursFields({
  value,
  onChange,
}: {
  value: OperatingHours;
  onChange: (next: OperatingHours) => void;
}) {
  const toggle = (day: string) => {
    const days = value.days.includes(day)
      ? value.days.filter((d) => d !== day)
      : [...value.days, day];
    onChange({ ...value, days });
  };

  const everyDay = value.days.length === 7;

  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <MandiText variant="label">Days you trade</MandiText>
        <Pressable
          onPress={() => onChange({ ...value, days: everyDay ? [] : DAYS.map((d) => d.key) })}
          accessibilityRole="button"
          accessibilityLabel={everyDay ? 'Clear all days' : 'Select every day'}
          hitSlop={8}
        >
          <MandiText variant="captionEmphasis" color={Colors.primary}>
            {everyDay ? 'Clear' : 'Every day'}
          </MandiText>
        </Pressable>
      </View>

      <View style={styles.days}>
        {DAYS.map((day) => {
          const on = value.days.includes(day.key);
          return (
            <Pressable
              key={day.key}
              onPress={() => toggle(day.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={day.key.toLowerCase()}
              style={[styles.day, on && styles.dayOn]}
            >
              <MandiText
                variant="captionEmphasis"
                color={on ? Colors.textInverse : Colors.textSecondary}
              >
                {day.short}
              </MandiText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.times}>
        <MandiFormField
          label="Opens"
          value={value.opensAt}
          onChangeText={(text) => onChange({ ...value, opensAt: text })}
          placeholder="10:00"
          style={styles.flex}
        />
        <MandiFormField
          label="Closes"
          value={value.closesAt}
          onChangeText={(text) => onChange({ ...value, closesAt: text })}
          placeholder="21:00"
          style={styles.flex}
        />
      </View>

      <MandiText variant="caption" color={Colors.textSecondary}>
        {value.days.length === 0
          ? 'Choose at least one day. To stop taking orders, go offline below.'
          : `Restaurants can order from you ${everyDay ? 'every day' : `on ${value.days.length} days`}`
            + `, ${value.opensAt}–${value.closesAt}. Outside that they see you as closed.`}
      </MandiText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  day: {
    minWidth: 46,
    minHeight: TouchTarget.min - 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dayOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  times: { flexDirection: 'row', gap: Spacing.md },
  flex: { flex: 1 },
});
