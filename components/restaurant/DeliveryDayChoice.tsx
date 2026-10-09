import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
 * so the dates run to the furthest the server accepts, wrapping onto further lines.
 */
export function DeliveryDayChoice({
  value,
  onChange,
}: {
  value: DeliveryWhen;
  onChange: (when: DeliveryWhen) => void;
}) {
  const days = dayChoices();
  // Today and tomorrow are always on show; the other days wait behind "Pick a date", which opens itself when one of
  // them is already chosen so the choice is never hidden.
  const [showDates, setShowDates] = useState(false);
  const farther = days.filter((day) => day.offset >= 2);
  const fartherChosen = value.offset != null && value.offset >= 2;
  const chosenFarther = fartherChosen ? days.find((day) => day.offset === value.offset)?.label ?? null : null;
  const datesOpen = showDates || fartherChosen;
  const hours = value.offset == null ? [] : deliverByHoursFor(value.offset);

  const pick = (offset: number) => {
    const stillAhead = value.byHour != null && deliverByHoursFor(offset).includes(value.byHour);
    onChange({ offset, byHour: stillAhead ? value.byHour : null });
  };

  return (
    <View style={styles.wrap} testID="delivery-day-choice">
      <MandiText variant="captionEmphasis" color={Colors.textSecondary}>
        Delivery
      </MandiText>
      <View style={styles.chips}>
        {/* No day: sent out when ready. "Later today" is today with an optional hour to have it by. */}
        <Chip
          label="As soon as possible"
          active={value.offset == null}
          onPress={() => onChange({ offset: null, byHour: null })}
        />
        {days.filter((day) => day.offset < 2).map((day) => (
          <Chip
            key={day.offset}
            label={day.offset === 0 ? 'Later today' : day.label}
            active={value.offset === day.offset}
            onPress={() => pick(day.offset)}
          />
        ))}
        {/* Selected only when a farther day is chosen; open or closed is the toggle's own state. */}
        <Chip
          label={chosenFarther ?? 'Pick a date'}
          spokenAs={chosenFarther == null ? undefined : `Pick a date, ${chosenFarther} chosen`}
          active={fartherChosen}
          expanded={datesOpen}
          onPress={() => setShowDates((open) => !open)}
        />
      </View>
      {datesOpen && (
        <View style={styles.chips}>
          {farther.map((day) => (
            <Chip
              key={day.offset}
              label={day.label}
              active={value.offset === day.offset}
              onPress={() => pick(day.offset)}
            />
          ))}
        </View>
      )}
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

function Chip({ label, spokenAs, active, expanded, onPress }: {
  label: string; spokenAs?: string; active: boolean; expanded?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={expanded == null ? { selected: active } : { selected: active, expanded }}
      accessibilityLabel={`Delivery: ${spokenAs ?? label}`}
      style={[styles.chip, active && styles.chipActive]}
    >
      <MandiText variant="caption" color={active ? Colors.surface : Colors.textSecondary}>
        {label}
      </MandiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The bottom margin keeps wrapped chip rows off the supplier card that follows.
  wrap: { gap: Spacing.xs, marginBottom: Spacing.md },
  // Rows wrap rather than scroll: a scroller cut the last visible chip at the screen edge, and nothing said to swipe.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexShrink: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
});
