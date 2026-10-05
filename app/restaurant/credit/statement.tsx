import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { fetchAgreement } from '@/services/credit';
import { useCreditStatement, type StatementRange } from '@/hooks/useCreditStatement';
import { CreditStatementRow } from '@/components/credit/CreditStatementRow';
import { MonthHeader } from '@/components/wallet/MonthHeader';
import {
  MandiBottomSheet,
  MandiButton,
  MandiCard,
  MandiEmptyState,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiScreen,
  MandiSkeletonList,
  MandiText,
} from '@/components/common';
import {
  groupStatementByMonth,
  isDay,
  orderRoute,
  presetRange,
  rangeText,
  statementErrorMessage,
  walletEntryRoute,
} from '@/lib/credit/statement';
import type { CreditStatementLine } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const PRESETS = [
  { key: 'd30', label: 'Last 30 days', days: 30 },
  { key: 'd90', label: 'Last 90 days', days: 90 },
  { key: 'd180', label: 'Last 6 months', days: 180 },
  { key: 'd365', label: 'Last year', days: 365 },
] as const;

/**
 * What one credit line owes, in date order. Every number is the server's: the signed
 * amounts, "Owed after", and the opening and closing balances. This screen only groups
 * the lines by month and words them.
 */
export default function CreditStatementScreen() {
  const router = useRouter();
  const { accessToken } = useSession();
  const { agreementId: raw } = useLocalSearchParams<{ agreementId?: string | string[] }>();
  const agreementId = Number(Array.isArray(raw) ? raw[0] : raw);

  // No range until the person picks one: the server then chooses the last 90 days.
  const [range, setRange] = useState<StatementRange | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const statement = useCreditStatement(agreementId, range);
  const agreement = useQuery({
    queryKey: ['credit-agreement', agreementId],
    queryFn: () => fetchAgreement(accessToken as string, agreementId),
    enabled: Number.isFinite(agreementId) && accessToken != null,
  });
  const supplier = agreement.data?.supplierName ?? agreement.data?.storeName ?? undefined;

  function choose(next: StatementRange | null) {
    setRange(next);
    setFilterOpen(false);
  }
  function applyCustom() {
    if (!isDay(fromText) || !isDay(toText)) {
      setProblem('Use the form 2026-09-16 for both days.');
      return;
    }
    setProblem(null);
    choose({ from: fromText.trim(), to: toText.trim() });
  }
  function open(line: CreditStatementLine): (() => void) | undefined {
    if (line.walletEntryId != null) {
      return () => router.push(walletEntryRoute(line.walletEntryId as number) as never);
    }
    if (line.supplierOrderId != null) {
      return () => router.push(orderRoute(line.supplierOrderId as number) as never);
    }
    return undefined;
  }

  const data = statement.data;
  const months = data ? groupStatementByMonth(data.lines) : [];

  const header = <MandiHeader title="Statement" subtitle={supplier} back />;

  let body: React.ReactNode;
  if (statement.isPending) {
    body = <View style={styles.pad}><MandiSkeletonList count={5} /></View>;
  } else if (statement.isError) {
    body = (
      <View style={styles.pad}>
        <MandiErrorState
          message={statementErrorMessage(statement.error)}
          onRetry={() => statement.refetch()}
          retrying={statement.isRefetching}
          testID="statement-error"
        />
      </View>
    );
  } else if (data) {
    body = (
      <>
        <View style={styles.rangeRow}>
          <MandiText variant="caption" muted testID="statement-range">
            {rangeText(data.from, data.to)}
          </MandiText>
          <Pressable
            testID="statement-filter"
            onPress={() => setFilterOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Period: ${rangeText(data.from, data.to)}. Change`}
            style={styles.filter}
          >
            <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
            <MandiText variant="captionEmphasis" muted>Change period</MandiText>
          </Pressable>
        </View>

        <View style={styles.pad}>
        <MandiCard>
          <View style={styles.summary}>
            <View style={styles.summaryCell}>
              <MandiText variant="caption" muted>Owed at start</MandiText>
              <MandiText variant="price" testID="statement-opening">{formatMoney(data.openingOwed)}</MandiText>
            </View>
            <View style={[styles.summaryCell, styles.summaryEnd]}>
              <MandiText variant="caption" muted>Owed now</MandiText>
              <MandiText variant="price" testID="statement-closing">{formatMoney(data.closingOwed)}</MandiText>
            </View>
          </View>
        </MandiCard>
        </View>

        {months.length === 0 ? (
          <View style={styles.pad}>
            <MandiEmptyState
              icon="receipt-outline"
              title="No credit activity in this period."
              description="Orders on credit and repayments will appear here."
            />
          </View>
        ) : (
          <View style={styles.list} testID="statement-list">
            {months.map((month) => (
              <View key={month.month}>
                <MonthHeader title={month.title} amount={null} />
                {month.lines.map((line, i) => (
                  <CreditStatementRow
                    key={`${line.at}-${line.type}-${line.walletEntryId ?? line.creditInvoiceId ?? line.supplierOrderId ?? i}-${i}`}
                    line={line}
                    last={i === month.lines.length - 1}
                    onPress={open(line)}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <>
      <MandiScreen
        header={header}
        onRefresh={() => { void statement.refetch(); }}
        refreshing={statement.isRefetching}
        contentStyle={styles.content}
      >
        {body}
      </MandiScreen>
      <MandiBottomSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Show statement for"
        closeLabel="Close the period chooser"
      >
        {PRESETS.map((p) => (
          <Pressable
            key={p.key}
            testID={`preset-${p.key}`}
            onPress={() => choose(p.key === 'd90' ? null : presetRange(p.days))}
            accessibilityRole="button"
            accessibilityLabel={p.label}
            style={styles.option}
          >
            <MandiText variant="body">{p.label}</MandiText>
          </Pressable>
        ))}
        <View style={styles.custom}>
          <MandiText variant="captionEmphasis">Or choose days (up to a year)</MandiText>
          <View style={styles.pair}>
            <MandiFormField
              label="From"
              value={fromText}
              onChangeText={setFromText}
              placeholder="2026-07-01"
              autoCapitalize="none"
              style={styles.flex}
              testID="custom-from"
            />
            <MandiFormField
              label="To"
              value={toText}
              onChangeText={setToText}
              placeholder="2026-09-30"
              autoCapitalize="none"
              style={styles.flex}
              testID="custom-to"
            />
          </View>
          {problem != null && <MandiText variant="caption" color={Colors.danger}>{problem}</MandiText>}
          <MandiButton label="Show" onPress={applyCustom} testID="custom-apply" />
        </View>
      </MandiBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0, gap: Spacing.lg },
  pad: { paddingHorizontal: Spacing.screenHorizontal },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenHorizontal,
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  summaryCell: { flex: 1, gap: 2 },
  summaryEnd: { alignItems: 'flex-end' },
  list: { backgroundColor: Colors.surface },
  option: { minHeight: TouchTarget.min, justifyContent: 'center' },
  custom: { gap: Spacing.sm, paddingTop: Spacing.sm },
  pair: { flexDirection: 'row', gap: Spacing.md },
  flex: { flex: 1 },
});
