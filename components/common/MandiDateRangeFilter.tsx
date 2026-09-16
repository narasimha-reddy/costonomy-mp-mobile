import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet } from './MandiBottomSheet';
import { MandiButton } from './MandiButton';
import { MandiFormField } from './MandiFormField';
import { MandiText } from './MandiText';
import {
  customRange,
  describeRange,
  rangeFor,
  RANGE_LABELS,
  type DateRange,
  type DateRangeKey,
} from '@/utils/dateRange';
import { Colors, ControlHeight, Radius, Spacing, TouchTarget } from '@/theme';

const PRESETS: Exclude<DateRangeKey, 'custom'>[] = ['today', 'week', 'month', 'quarter'];

/**
 * Narrow a list to a period.
 *
 * <p>Shared, because more than one screen answers a question about a window —
 * orders, settlements, the credit ledger — and a filter reimplemented per screen
 * is one that disagrees with itself about what "last week" means.
 *
 * <p>The trigger shows the chosen period rather than the word "Dates", so a list
 * that looks shorter than expected says why without being opened. Same reasoning
 * as `MandiFilterMenu`, and the two sit side by side on purpose.
 */
export function MandiDateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  // Only a narrowed filter is coloured. Every list here starts on a window, so a
  // tinted control on the default state would be tinted permanently.
  const narrowed = value.key !== 'week';

  function choose(key: Exclude<DateRangeKey, 'custom'>) {
    onChange(rangeFor(key));
    setOpen(false);
    setCustomising(false);
  }

  function applyCustom() {
    const from = parseDate(fromText);
    const to = parseDate(toText);
    if (!from || !to) {
      setProblem('Use the form 2026-09-16 for both dates.');
      return;
    }
    setProblem(null);
    onChange(customRange(from, to));
    setOpen(false);
    setCustomising(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Period: ${describeRange(value)}. Change`}
        style={[styles.trigger, narrowed && styles.triggerActive]}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color={narrowed ? Colors.primary : Colors.textSecondary}
        />
        <MandiText
          variant="captionEmphasis"
          color={narrowed ? Colors.primary : Colors.textSecondary}
          numberOfLines={1}
        >
          {describeRange(value)}
        </MandiText>
      </Pressable>

      <MandiBottomSheet
        visible={open}
        onClose={() => { setOpen(false); setCustomising(false); }}
        title="Show orders from"
        closeLabel="Close the date filter"
      >
        {PRESETS.map((key) => {
          const chosen = value.key === key;
          return (
            <Pressable
              key={key}
              onPress={() => choose(key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              style={styles.option}
            >
              <MandiText variant="body" style={styles.flex}>{RANGE_LABELS[key]}</MandiText>
              {chosen && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => setCustomising(!customising)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value.key === 'custom' }}
          style={styles.option}
        >
          <MandiText variant="body" style={styles.flex}>{RANGE_LABELS.custom}</MandiText>
          {value.key === 'custom' && !customising
            ? <Ionicons name="checkmark" size={20} color={Colors.primary} />
            : <Ionicons
                name={customising ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textTertiary}
              />}
        </Pressable>

        {customising ? (
          <View style={styles.custom}>
            <View style={styles.pair}>
              <MandiFormField
                label="From"
                value={fromText}
                onChangeText={setFromText}
                placeholder="2026-09-01"
                autoCapitalize="none"
                style={styles.flex}
              />
              <MandiFormField
                label="To"
                value={toText}
                onChangeText={setToText}
                placeholder="2026-09-16"
                autoCapitalize="none"
                style={styles.flex}
              />
            </View>
            {problem ? (
              <MandiText variant="caption" color={Colors.danger}>{problem}</MandiText>
            ) : (
              <MandiText variant="caption" color={Colors.textSecondary}>
                Both days are included.
              </MandiText>
            )}
            <MandiButton label="Apply" size="md" onPress={applyCustom} />
          </View>
        ) : null}
      </MandiBottomSheet>
    </>
  );
}

/**
 * Parse `YYYY-MM-DD` as a local day.
 *
 * <p>`new Date('2026-09-16')` is parsed as UTC midnight, which in India is the
 * morning of the 16th but in the Americas is still the 15th — so a range typed as
 * the 16th would quietly start a day early. Building it from parts keeps the day
 * the one the person typed.
 */
function parseDate(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    height: ControlHeight.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  triggerActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
  },
  custom: { gap: Spacing.sm, paddingTop: Spacing.sm },
  pair: { flexDirection: 'row', gap: Spacing.md },
});
