import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton } from '@/components/common';
import { HelperText, ReviewInput } from './fields';
import { formatDay, isISODate, monthGrid, monthTitle, parseToISODate, shiftMonth, todayIST } from '@/lib/wallet/billReview';
import { ReviewColors, ReviewLayout, Spacing, TextStyles } from '@/theme';

const WEEKDAYS = [
  { short: 'M', long: 'Monday' }, { short: 'T', long: 'Tuesday' }, { short: 'W', long: 'Wednesday' },
  { short: 'T', long: 'Thursday' }, { short: 'F', long: 'Friday' }, { short: 'S', long: 'Saturday' },
  { short: 'S', long: 'Sunday' },
];

/** An ISO day moved by a number of days (UTC arithmetic on the day, so no zone or daylight-saving drift). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * A month calendar in a bottom sheet. Written in the app (no native date-picker module), so it works the
 * same on Android, iOS and the web, and needs no new native build. Every day is a 44 dp target and is
 * read as its full date.
 */
export function DateSheet({
  visible, title, value, onPick, onClose, testID, maxDate, tooLateMessage,
}: {
  visible: boolean;
  title: string;
  /** ISO day or ''. */
  value: string;
  onPick: (iso: string) => void;
  onClose: () => void;
  testID?: string;
  /** Last day that can be picked (ISO day); later days are shown but cannot be chosen. */
  maxDate?: string;
  /** What to say when a typed date is after `maxDate`. */
  tooLateMessage?: (max: string) => string;
}) {
  const today = todayIST();
  const start = isISODate(value) ? value : today;
  const [[year, month], setMonth] = useState<[number, number]>([Number(start.slice(0, 4)), Number(start.slice(5, 7))]);

  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState('');

  useEffect(() => {
    if (visible) {
      setMonth([Number(start.slice(0, 4)), Number(start.slice(5, 7))]);
      setTyped('');
      setTypedError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const [nextYear, nextMonth] = shiftMonth(year, month, 1);
  const nextDisabled = !!maxDate && `${nextYear}-${String(nextMonth).padStart(2, '0')}-01` > maxDate;

  const applyTyped = () => {
    const iso = parseToISODate(typed);
    if (!iso) {
      setTypedError('Enter a date like 04/09/2026.');
    } else if (maxDate && iso > maxDate) {
      setTypedError((tooLateMessage ?? ((max) => `Pick a day up to ${formatDay(max)}.`))(maxDate));
    } else {
      setTypedError('');
      onPick(iso);
    }
  };

  return (
    <MandiBottomSheet visible={visible} onClose={onClose} title={title} closeLabel={`Close ${title.toLowerCase()}`} testID={testID}>
      <View style={styles.typedRow}>
        <ReviewInput
          style={styles.typedInput}
          value={typed}
          onChangeText={(t) => { setTyped(t); setTypedError(''); }}
          onSubmitEditing={applyTyped}
          placeholder="Type a date, e.g. 04/09/2026"
          accessibilityLabel="Type a date, day month year"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={30}
          invalid={!!typedError}
          testID={`${testID}-typed`}
        />
        <Pressable
          onPress={applyTyped}
          accessibilityRole="button"
          accessibilityLabel="Use typed date"
          style={styles.use}
          testID={`${testID}-typed-use`}
        >
          <Text style={styles.useText}>Use</Text>
        </Pressable>
      </View>
      <HelperText error={typedError} testID={`${testID}-typed-error`} />
      <View style={styles.head}>
        <Pressable
          onPress={() => setMonth(shiftMonth(year, month, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={styles.nav}
          testID="date-prev"
        >
          <Ionicons name="chevron-back" size={20} color={ReviewColors.text} />
        </Pressable>
        <Text style={styles.month} accessibilityRole="header" accessibilityLiveRegion="polite">{monthTitle(year, month)}</Text>
        <Pressable
          onPress={() => setMonth(shiftMonth(year, month, 1))}
          disabled={nextDisabled}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: nextDisabled }}
          style={[styles.nav, nextDisabled && styles.navOff]}
          testID="date-next"
        >
          <Ionicons name="chevron-forward" size={20} color={nextDisabled ? ReviewColors.dayDisabled : ReviewColors.text} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {WEEKDAYS.map((d) => <Text key={d.long} style={styles.weekday}>{d.short}</Text>)}
        </View>
        {rows.map((row, r) => (
          <View key={r} style={styles.week}>
            {row.map((iso, c) => {
              if (iso == null) return <View key={c} style={styles.day} />;
              const selected = iso === value;
              const isToday = iso === today;
              const off = !!maxDate && iso > maxDate;
              return (
                <Pressable
                  key={iso}
                  onPress={off ? undefined : () => onPick(iso)}
                  disabled={off}
                  accessibilityRole="button"
                  accessibilityLabel={`${WEEKDAYS[c]?.long ?? ''} ${formatDay(iso)}${isToday ? ', today' : ''}${off ? ', not available' : ''}`}
                  accessibilityState={{ disabled: off, selected }}
                  style={[styles.day, isToday && styles.today, selected && styles.selected]}
                  testID={`day-${iso}`}
                >
                  <Text style={[styles.dayText, off && styles.dayTextOff, selected && styles.selectedText]}>{Number(iso.slice(8))}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <MandiButton label="Today" variant="neutral" size="md" onPress={() => onPick(today)} testID="date-today" />
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  typedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  typedInput: { flex: 1 },
  use: { minWidth: ReviewLayout.tap, height: ReviewLayout.tap, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  useText: { ...TextStyles.bodyEmphasis, color: ReviewColors.orangeText },
  navOff: { opacity: 0.6 },
  dayTextOff: { color: ReviewColors.dayDisabled },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  nav: { width: ReviewLayout.tap, height: ReviewLayout.tap, alignItems: 'center', justifyContent: 'center' },
  month: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
  grid: { alignSelf: 'center', marginVertical: Spacing.sm },
  week: { flexDirection: 'row' },
  weekday: {
    ...TextStyles.label,
    width: ReviewLayout.daySize,
    textAlign: 'center',
    color: ReviewColors.secondary,
    paddingVertical: Spacing.xs,
  },
  day: {
    width: ReviewLayout.daySize,
    height: ReviewLayout.daySize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ReviewLayout.daySize / 2,
  },
  today: { borderWidth: 1, borderColor: ReviewColors.dayToday },
  selected: { backgroundColor: ReviewColors.daySelected, borderColor: ReviewColors.daySelected },
  dayText: { ...TextStyles.body, color: ReviewColors.text },
  selectedText: { ...TextStyles.bodyEmphasis, color: ReviewColors.onOrange },
});
