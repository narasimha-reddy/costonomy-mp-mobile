import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchWalletStatement } from '@/services/wallet';
import {
  MandiButton,
  MandiFormField,
  MandiHeader,
  MandiStickyBar,
  MandiText,
  useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { financialYears, validateStatement } from '@/lib/wallet/statement';
import { saveBlobOnWeb } from '@/lib/wallet/saveFile';
import type { StatementFormat, StatementRange, StatementRequest } from '@/models/wallet';
import { Colors, IconSize, Radius, Spacing } from '@/theme';
import { radioProps } from '@/lib/a11y';

type Mode = 'range' | 'financialYear';

const RANGES: { key: StatementRange; label: string }[] = [
  { key: 'LAST_30', label: 'Last 30 days' },
  { key: 'LAST_90', label: 'Last 90 days' },
  { key: 'LAST_180', label: 'Last 180 days' },
  { key: 'LAST_365', label: 'Last 365 days' },
  { key: 'CUSTOM', label: 'Select date range' },
];

const FORMATS: { key: StatementFormat; label: string; hint: string }[] = [
  { key: 'PDF', label: 'PDF', hint: 'Suitable for viewing on mobile and sharing' },
  { key: 'CSV', label: 'CSV', hint: 'Suitable for analysis in spreadsheets' },
];

/**
 * REST-WALLET-04. My Statement: choose a period and a file type, download the
 * wallet's statement.
 *
 * <p>The server builds the file and has the last word on what it will cover; the
 * checks here (`validateStatement`) only catch a mistyped date before the trip. Its
 * refusals, a period too long or too many rows, are shown in its own words.
 *
 * <p>Saved through the browser on web. Native has no file-saving module in this app
 * yet, so it says so instead of pretending.
 */
export default function WalletStatementScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { accessToken } = useSession();
  const { outlet } = useOutlet();

  const years = financialYears();
  const [mode, setMode] = useState<Mode>('range');
  const [range, setRange] = useState<StatementRange>('LAST_30');
  const [year, setYear] = useState(years[0]?.key ?? '');
  const [format, setFormat] = useState<StatementFormat>('PDF');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [touched, setTouched] = useState(false);

  const request: StatementRequest = mode === 'financialYear'
    ? { kind: 'financialYear', financialYear: year, format }
    : range === 'CUSTOM'
      ? { kind: 'custom', from, to, format }
      : { kind: 'range', range, format };
  const problem = validateStatement(request);

  const download = useMutation({
    mutationFn: async () => {
      const file = await fetchWalletStatement(accessToken as string, outlet?.id as number, request);
      saveBlobOnWeb(file.blob, file.filename);
      return file;
    },
    onSuccess: (file) => toast.show(`Downloaded ${file.filename}`, 'success'),
    onError: (caught) => toast.show(
      caught instanceof ApiError ? caught.message : 'Could not download the statement. Try again.',
      'error'),
  });

  function submit() {
    if (Platform.OS !== 'web') {
      toast.show('Statement download is available on the web app for now', 'info');
      return;
    }
    setTouched(true);
    if (problem != null) return;
    download.mutate();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <MandiHeader title="My statement" subtitle={outlet?.name} back />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <MandiText variant="sectionTitle">Statement period</MandiText>
        <View style={styles.segments} accessibilityRole="tablist">
          {([['range', 'Range'], ['financialYear', 'Financial year']] as const).map(([key, label]) => (
            <Pressable
              key={key}
              testID={`mode-${key}`}
              onPress={() => setMode(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === key }}
              style={[styles.segment, mode === key && styles.segmentOn]}
            >
              <MandiText
                variant="bodyEmphasis"
                color={mode === key ? Colors.textInverse : Colors.textSecondary}
              >
                {label}
              </MandiText>
            </Pressable>
          ))}
        </View>

        {mode === 'range' ? (
          <>
            {RANGES.map((option) => (
              <Radio
                key={option.key}
                testID={`range-${option.key}`}
                label={option.label}
                selected={range === option.key}
                onPress={() => setRange(option.key)}
              />
            ))}
            {range === 'CUSTOM' && (
              <View style={styles.pair}>
                <MandiFormField
                  label="From"
                  value={from}
                  onChangeText={setFrom}
                  placeholder="2026-09-01"
                  autoCapitalize="none"
                  style={styles.flex}
                />
                <MandiFormField
                  label="To"
                  value={to}
                  onChangeText={setTo}
                  placeholder="2026-09-30"
                  autoCapitalize="none"
                  style={styles.flex}
                />
              </View>
            )}
          </>
        ) : (
          years.map((option) => (
            <Radio
              key={option.key}
              testID={`fy-${option.key}`}
              label={option.label}
              selected={year === option.key}
              onPress={() => setYear(option.key)}
            />
          ))
        )}

        <MandiText variant="sectionTitle" style={styles.gap}>File type</MandiText>
        {FORMATS.map((option) => (
          <Radio
            key={option.key}
            testID={`format-${option.key}`}
            label={option.label}
            hint={option.hint}
            selected={format === option.key}
            onPress={() => setFormat(option.key)}
          />
        ))}

        {touched && problem != null && (
          <MandiText variant="caption" color={Colors.danger} testID="statement-problem">
            {problem}
          </MandiText>
        )}
      </ScrollView>

      <MandiStickyBar>
        <MandiButton
          testID="download-statement"
          label="Download statement"
          loading={download.isPending}
          disabled={touched && problem != null}
          onPress={submit}
        />
      </MandiStickyBar>
    </View>
  );
}

function Radio({
  label, hint, selected, onPress, testID,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      {...radioProps(selected)}
      style={styles.radio}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={IconSize.lg}
        color={selected ? Colors.primary : Colors.textTertiary}
      />
      <View style={styles.flex}>
        <MandiText variant="body">{label}</MandiText>
        {hint != null && <MandiText variant="caption" color={Colors.textSecondary}>{hint}</MandiText>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: {
    padding: Spacing.screenHorizontal,
    gap: Spacing.xs,
  },
  flex: { flex: 1 },
  gap: { marginTop: Spacing.xl },
  segments: {
    flexDirection: 'row',
    padding: Spacing.xs,
    marginVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSunken,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  segmentOn: { backgroundColor: Colors.primary },
  radio: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
  pair: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
});
