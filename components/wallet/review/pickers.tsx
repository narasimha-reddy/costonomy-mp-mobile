import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton, MandiSkeleton } from '@/components/common';
import { useDebounced } from '@/hooks/useDebounced';
import { useSkuLookup, useSupplierLookup } from '@/hooks/useInvoiceLookups';
import { ApiError } from '@/lib/api/errors';
import { LOOKUP_MAX_QUERY } from '@/services/wallet';
import {
  MONEY_DECIMALS, MONEY_INT_DIGITS, SKU_UNITS, defaultSkuUnit, newSku, newSkuProblems, type SkuUnit,
} from '@/lib/wallet/billReview';
import type { ReviewSku } from '@/models/wallet';
import { formatUnitPrice } from '@/lib/wallet/pickerFormat';
import { ReviewColors, ReviewLayout, Spacing, TextStyles } from '@/theme';
import { Chip, FieldLabel, HelperText, NumberInput, ReviewInput } from './fields';
import { radioProps } from '@/lib/a11y';

/** The lookup is asked 300 ms after the typing stops. */
export const LOOKUP_DEBOUNCE_MS = 300;

export interface LookupProblem { text: string; retry: boolean; quiet: boolean }

/** The longest supplier / SKU name the Create forms take. */
export const NAME_MAX = 150;

/** Whole seconds a 429 asks us to wait, or null if the error is not a 429. */
export function rateLimitWait(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null;
  const raw = error.details?.retryAfterSeconds;
  const wait = typeof raw === 'number' && Number.isFinite(raw) ? raw : error.retryAfterSeconds ?? 30;
  return Math.max(1, Math.ceil(wait));
}

/** Seconds left of a 429's wait, ticking once a second (timer cleaned up on unmount); null if not rate limited. */
function useRateLimitCountdown(error: unknown): number | null {
  const wait = rateLimitWait(error);
  const [state, setState] = useState<{ error: unknown; left: number } | null>(null);
  const left = wait == null ? null : state != null && state.error === error ? state.left : wait;
  useEffect(() => {
    if (left == null || left <= 0) return undefined;
    const id = setTimeout(() => setState({ error, left: left - 1 }), 1000);
    return () => clearTimeout(id);
  }, [error, left]);
  return left;
}

/** What a failed lookup says, and whether it is worth a Try again. */
export function lookupProblem(error: unknown, kind: 'suppliers' | 'skus', secondsLeft?: number | null): LookupProblem {
  const noun = kind === 'suppliers' ? 'Supplier' : 'SKU';
  if (error instanceof ApiError) {
    if (error.status === 403 && error.code === 'INVOICE_LOOKUP_NOT_AVAILABLE') {
      return { text: `${noun} list not available for this restaurant`, retry: false, quiet: true };
    }
    if (error.status === 429) {
      const wait = secondsLeft ?? rateLimitWait(error) ?? 30;
      return wait > 0
        ? { text: `Too many searches, try again in ${wait} s`, retry: true, quiet: false }
        : { text: 'Too many searches. You can try again now.', retry: true, quiet: false };
    }
    if (error.status === 503) {
      return { text: `${noun} search is not available right now. You can still create one.`, retry: true, quiet: false };
    }
  }
  return {
    text: kind === 'suppliers'
      ? 'Could not load your suppliers. Use the one on the bill or create one.'
      : 'Could not load your SKUs. Use the suggestion or create one.',
    retry: true,
    quiet: false,
  };
}

const isLookupBlocked = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && error.code === 'INVOICE_LOOKUP_NOT_AVAILABLE';

/** Once the lookups are refused for this restaurant, stop asking until the sheet is reopened. */
function useLookupBlocked(visible: boolean) {
  const state = useState(false);
  const reset = state[1];
  useEffect(() => { reset(false); }, [visible, reset]);
  return state;
}

/** The note to show for the lookup's error; a 403 latches `blocked` and keeps its hint after the query is disabled. */
function useLookupNote(
  error: unknown,
  blocked: boolean,
  setBlocked: (v: boolean) => void,
  kind: 'suppliers' | 'skus',
  secondsLeft?: number | null,
): LookupProblem | null {
  const refused = isLookupBlocked(error);
  useEffect(() => { if (refused) setBlocked(true); }, [refused, setBlocked]);
  if (blocked || refused) {
    return { text: `${kind === 'suppliers' ? 'Supplier' : 'SKU'} list not available for this restaurant`, retry: false, quiet: true };
  }
  return error ? lookupProblem(error, kind, secondsLeft) : null;
}

function useSheetHeight() {
  const { height } = useWindowDimensions();
  return Math.min(ReviewLayout.sheetMaxHeight, Math.round(height * 0.62));
}

function SearchBox({ value, onChange, placeholder, label, testID, disabled }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string; testID?: string; disabled?: boolean;
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={ReviewColors.tertiary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={ReviewColors.tertiary}
        maxLength={LOOKUP_MAX_QUERY}
        editable={!disabled}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={label}
        style={styles.searchInput}
        testID={testID}
      />
      {value !== '' && (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear the search" style={styles.clear} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={ReviewColors.tertiary} />
        </Pressable>
      )}
    </View>
  );
}

function OptionRow({
  title, subtitle, selected, disabled, badge, onPress, testID,
}: {
  title: string; subtitle?: string | null; selected?: boolean; disabled?: boolean; badge?: React.ReactNode;
  onPress: () => void; testID?: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}${disabled ? ', already on another line' : ''}`}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed, disabled && styles.rowDisabled]}
      testID={testID}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, disabled && styles.muted]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {badge}
      {selected ? <Ionicons name="checkmark" size={20} color={ReviewColors.orange} /> : null}
    </Pressable>
  );
}

function CreateRow({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.createRow} testID={testID}>
      <Ionicons name="add-circle-outline" size={20} color={ReviewColors.orange} />
      <Text style={styles.createText}>{label}</Text>
    </Pressable>
  );
}

function SearchingText() {
  return <Text style={styles.searching} accessibilityLiveRegion="polite" testID="lookup-searching">Searching…</Text>;
}

function LoadingRows() {
  return (
    <View style={styles.loading} testID="lookup-loading">
      {[0, 1, 2].map((i) => <MandiSkeleton key={i} height={40} />)}
    </View>
  );
}

function LookupNote({ problem, onRetry, retryDisabled }: { problem: LookupProblem; onRetry?: () => void; retryDisabled?: boolean }) {
  return (
    <View
      style={[styles.note, problem.quiet && styles.noteQuiet]}
      accessibilityRole={problem.quiet ? undefined : 'alert'}
      testID="lookup-note"
    >
      <Ionicons name={problem.quiet ? 'information-circle-outline' : 'cloud-offline-outline'} size={16} color={ReviewColors.secondary} />
      <Text style={styles.noteText}>{problem.text}</Text>
      {problem.retry && onRetry ? (
        <Pressable
          onPress={retryDisabled ? undefined : onRetry}
          disabled={retryDisabled}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          accessibilityState={{ disabled: !!retryDisabled }}
          style={[styles.retry, retryDisabled && styles.rowDisabled]}
          hitSlop={8}
          testID="lookup-retry"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Supplier ──────────────────────────────────────────────────────────

/**
 * Choose the shop: search the outlet's suppliers (the lookup, 300 ms after typing stops), with the
 * supplier read or matched on the bill first, and "Create supplier" at the bottom. Creating one makes
 * no record anywhere: it only names the supplier in this review (marked New).
 *
 * <p>If the lookup is not reachable the sheet still works: the suggestion and Create are always there.
 */
export function SupplierPicker({
  visible, onClose, current, suggestion, readName, onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  current: { id: number | null; name: string };
  /** The shop's name as read off the bill: the new supplier's starting name. */
  readName: string | null;
  /** The supplier the bill was matched to (or read as). */
  suggestion: { id: number | null; name: string } | null;
  onChoose: (supplier: { id: number | null; name: string }) => void;
}) {
  const height = useSheetHeight();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const settled = useDebounced(query, LOOKUP_DEBOUNCE_MS);
  const [blocked, setBlocked] = useLookupBlocked(visible);
  const lookup = useSupplierLookup(settled, visible && mode === 'list' && !blocked);
  const secondsLeft = useRateLimitCountdown(lookup.error);
  const waiting = secondsLeft != null && secondsLeft > 0;
  const problemNote = useLookupNote(lookup.error, blocked, setBlocked, 'suppliers', secondsLeft);

  useEffect(() => {
    if (!visible) return;
    setMode('list');
    setQuery('');
    setProblem(null);
  }, [visible]);

  const rows = useMemo(() => {
    const list: { id: number | null; name: string; suggested?: boolean }[] = [];
    const q = query.trim().toLowerCase();
    if (suggestion && suggestion.name && (!q || suggestion.name.toLowerCase().includes(q))) {
      list.push({ ...suggestion, suggested: true });
    }
    for (const s of lookup.data ?? []) {
      if (suggestion?.id != null && s.id === suggestion.id) continue;
      list.push(s);
    }
    return list;
  }, [lookup.data, suggestion, query]);

  const openCreate = () => {
    setName((query.trim() || (current.id == null ? current.name : '') || readName || '').slice(0, NAME_MAX));
    setProblem(null);
    setMode('create');
  };

  const create = () => {
    if (name.trim() === '') { setProblem('Enter the supplier’s name'); return; }
    onChoose({ id: null, name: name.trim() });
  };

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title={mode === 'list' ? 'Choose supplier' : 'New supplier'}
      closeLabel="Close the supplier list"
      avoidKeyboard
      testID="supplier-picker"
    >
      {mode === 'list' ? (
        <View style={{ height }}>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search suppliers"
            disabled={waiting}
            label="Search suppliers"
            testID="supplier-search"
          />
          <FlatList
            data={rows}
            keyExtractor={(s, i) => `${s.id ?? 'new'}-${i}`}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => (
              <OptionRow
                title={item.name}
                subtitle={item.suggested ? 'On the bill' : null}
                selected={current.name !== '' && item.name === current.name && item.id === current.id}
                badge={item.suggested ? <Chip label="Suggested" tone="neutral" icon="star-outline" /> : null}
                onPress={() => onChoose({ id: item.id, name: item.name })}
                testID={`supplier-option-${item.id ?? 'suggested'}`}
              />
            )}
            ListEmptyComponent={lookup.isLoading || lookup.isFetching || problemNote ? null : (
              <Text style={styles.empty}>{query.trim() ? `No supplier matches “${query.trim()}”.` : 'Type to search your suppliers.'}</Text>
            )}
            ListHeaderComponent={
              <>
                {problemNote ? <LookupNote problem={problemNote} retryDisabled={waiting} onRetry={() => { void lookup.refetch(); }} /> : null}
                {lookup.isFetching ? <SearchingText /> : null}
                {lookup.isLoading && lookup.fetchStatus !== 'idle' ? <LoadingRows /> : null}
              </>
            }
          />
          <CreateRow
            label={query.trim() ? `Create supplier “${query.trim()}”` : 'Create supplier'}
            onPress={openCreate}
            testID="supplier-create"
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formNote}>Only used in this review. No supplier is added to your account.</Text>
          <FieldLabel label="Supplier name" required />
          <ReviewInput
            value={name}
            onChangeText={(v) => { setName(v); setProblem(null); }}
            placeholder="e.g. Kosta Delights"
            maxLength={NAME_MAX}
            autoCapitalize="words"
            accessibilityLabel="Supplier name, required"
            invalid={!!problem}
            returnKeyType="done"
            onSubmitEditing={create}
            testID="new-supplier-name"
          />
          <HelperText error={problem} />
          <View style={styles.formButtons}>
            <MandiButton label="Back" variant="neutral" size="md" fullWidth={false} onPress={() => setMode('list')} style={styles.flex} />
            <MandiButton label="Use this supplier" size="md" fullWidth={false} onPress={create} style={styles.flex2} testID="new-supplier-save" />
          </View>
        </View>
      )}
    </MandiBottomSheet>
  );
}

// ── SKU ───────────────────────────────────────────────────────────────

/**
 * Choose the SKU for one line: search (300 ms debounce), the SKU the bill
 * was matched to first, SKUs already on another line shown as Added and not choosable (as the cost
 * app's lockedSkuIds), and "Create SKU" at the bottom. A created SKU is saved only in this review.
 */
export function SkuPicker({
  visible, onClose, current, suggestion, lineName, lineUnit, lockedIds, startInCreate, onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  current: ReviewSku | null;
  /** The SKU the server matched this line to, if any. */
  suggestion: ReviewSku | null;
  /** What the bill called the item: the starting search and the new SKU's starting name. */
  lineName: string | null;
  lineUnit: string | null;
  /** SKU ids already on other lines. */
  lockedIds: Set<number>;
  /** Open straight on the Create SKU form (the card's own button). */
  startInCreate?: boolean;
  onChoose: (sku: ReviewSku) => void;
}) {
  const height = useSheetHeight();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<SkuUnit>('KG');
  const [price, setPrice] = useState('');
  const [problems, setProblems] = useState<{ name?: string; price?: string } | null>(null);
  const settled = useDebounced(query, LOOKUP_DEBOUNCE_MS);
  const [blocked, setBlocked] = useLookupBlocked(visible);
  const lookup = useSkuLookup(settled, visible && mode === 'list' && !blocked);
  const secondsLeft = useRateLimitCountdown(lookup.error);
  const waiting = secondsLeft != null && secondsLeft > 0;
  const problemNote = useLookupNote(lookup.error, blocked, setBlocked, 'skus', secondsLeft);

  const startCreate = (seedName: string) => {
    setName(seedName.slice(0, NAME_MAX));
    setUnit(defaultSkuUnit(lineUnit));
    setPrice('');
    setProblems(null);
    setMode('create');
  };

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setProblems(null);
    if (startInCreate) startCreate(lineName ?? '');
    else setMode('list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const rows = useMemo(() => {
    const list: (ReviewSku & { categoryName?: string | null; suggested?: boolean })[] = [];
    const q = query.trim().toLowerCase();
    if (suggestion && (!q || suggestion.name.toLowerCase().includes(q))) list.push({ ...suggestion, suggested: true });
    for (const s of lookup.data ?? []) {
      if (suggestion?.id != null && s.id === suggestion.id) continue;
      list.push(s);
    }
    return list;
  }, [lookup.data, suggestion, query]);

  const create = () => {
    const found = newSkuProblems(name, price);
    if (found) { setProblems(found); return; }
    onChoose(newSku(name, unit, price));
  };

  return (
    <MandiBottomSheet
      visible={visible}
      onClose={onClose}
      title={mode === 'list' ? 'Choose SKU' : 'New SKU'}
      closeLabel="Close the SKU list"
      avoidKeyboard
      testID="sku-picker"
    >
      {mode === 'list' ? (
        <View style={{ height }}>
          {lineName ? <Text style={styles.context} numberOfLines={2}>On the bill: {lineName}</Text> : null}
          <SearchBox value={query} onChange={setQuery} placeholder="Search SKUs" label="Search SKUs" testID="sku-search" disabled={waiting} />
          <FlatList
            data={rows}
            keyExtractor={(s, i) => `${s.id ?? 'new'}-${i}`}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => {
              const locked = item.id != null && lockedIds.has(item.id);
              const priceText = formatUnitPrice(item.unitPrice, item.unit);
              return (
                <OptionRow
                  title={item.name}
                  subtitle={[item.categoryName, priceText].filter(Boolean).join(' · ') || (item.suggested ? 'Matched from the bill' : null)}
                  selected={current != null && item.id === current.id && item.name === current.name}
                  disabled={locked}
                  badge={locked
                    ? <Chip label="Added" tone="neutral" icon="checkmark-done" />
                    : item.suggested ? <Chip label="Suggested" tone="neutral" icon="star-outline" /> : null}
                  onPress={() => onChoose({ id: item.id, name: item.name, unit: item.unit, unitPrice: item.unitPrice })}
                  testID={`sku-option-${item.id ?? 'suggested'}`}
                />
              );
            }}
            ListEmptyComponent={lookup.isLoading || lookup.isFetching || problemNote ? null : (
              <Text style={styles.empty}>{query.trim() ? `No SKU matches “${query.trim()}”.` : 'Type to search your SKUs.'}</Text>
            )}
            ListHeaderComponent={
              <>
                {problemNote ? <LookupNote problem={problemNote} retryDisabled={waiting} onRetry={() => { void lookup.refetch(); }} /> : null}
                {lookup.isFetching ? <SearchingText /> : null}
                {lookup.isLoading && lookup.fetchStatus !== 'idle' ? <LoadingRows /> : null}
              </>
            }
          />
          <CreateRow
            label={query.trim() ? `Create SKU “${query.trim()}”` : 'Create SKU'}
            onPress={() => startCreate(query.trim() || lineName || '')}
            testID="sku-create"
          />
        </View>
      ) : (
        <ScrollView style={{ maxHeight: height }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.formNote}>Only used in this review. No SKU is added to your catalogue.</Text>
          <FieldLabel label="SKU name" required />
          <ReviewInput
            value={name}
            onChangeText={(v) => { setName(v); setProblems((p) => (p ? { ...p, name: undefined } : p)); }}
            placeholder="e.g. Prawns 16/20"
            maxLength={NAME_MAX}
            accessibilityLabel="SKU name, required"
            invalid={!!problems?.name}
            testID="new-sku-name"
          />
          <HelperText error={problems?.name} />
          <FieldLabel label="Unit" />
          <View style={styles.units} accessibilityRole="radiogroup" accessibilityLabel="Unit">
            {SKU_UNITS.map((u) => {
              const on = u === unit;
              return (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  accessibilityRole="radio"
                  {...radioProps(on)}
                  accessibilityLabel={u}
                  style={[styles.unit, on && styles.unitOn]}
                  testID={`new-sku-unit-${u}`}
                >
                  <Text style={[styles.unitText, on && styles.unitTextOn]}>{u}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.gap} />
          <FieldLabel label={`Price per ${unit} (optional)`} />
          <NumberInput
            label={`Price per ${unit} in rupees, optional`}
            value={price}
            onChangeText={(v) => { setPrice(v); setProblems((p) => (p ? { ...p, price: undefined } : p)); }}
            decimals={MONEY_DECIMALS}
            maxInt={MONEY_INT_DIGITS}
            placeholder="0.00"
            invalid={!!problems?.price}
            returnKeyType="done"
            onSubmitEditing={create}
            testID="new-sku-price"
          />
          <HelperText error={problems?.price} hint="Used to check the bill’s price for this item." />
          <View style={styles.formButtons}>
            <MandiButton label="Back" variant="neutral" size="md" fullWidth={false} onPress={() => setMode('list')} style={styles.flex} />
            <MandiButton label="Use this SKU" size="md" fullWidth={false} onPress={create} style={styles.flex2} testID="new-sku-save" />
          </View>
        </ScrollView>
      )}
    </MandiBottomSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: ReviewLayout.fieldHeight,
    paddingLeft: Spacing.md,
    borderWidth: 1,
    borderColor: ReviewColors.fieldBorder,
    borderRadius: ReviewLayout.fieldRadius,
    backgroundColor: ReviewColors.field,
    marginTop: Spacing.sm,
  },
  searchInput: { ...TextStyles.body, flex: 1, color: ReviewColors.text, paddingVertical: Spacing.sm },
  clear: { width: ReviewLayout.tap, height: ReviewLayout.tap, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, marginTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: ReviewLayout.fieldRadius,
  },
  rowSelected: { backgroundColor: ReviewColors.selected },
  rowPressed: { backgroundColor: ReviewColors.band },
  rowDisabled: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...TextStyles.body, color: ReviewColors.text },
  rowSub: { ...TextStyles.caption, color: ReviewColors.secondary },
  muted: { color: ReviewColors.secondary },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ReviewColors.divider,
  },
  createText: { ...TextStyles.bodyEmphasis, color: ReviewColors.orangeText, flex: 1 },
  loading: { gap: Spacing.sm, paddingVertical: Spacing.sm },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: ReviewLayout.fieldRadius,
    backgroundColor: ReviewColors.band,
    marginBottom: Spacing.sm,
  },
  noteQuiet: { backgroundColor: ReviewColors.card, paddingVertical: Spacing.xs },
  noteText: { ...TextStyles.caption, color: ReviewColors.secondaryOnBand, flex: 1, minWidth: 160 },
  retry: { minHeight: ReviewLayout.tap, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  retryText: { ...TextStyles.captionEmphasis, color: ReviewColors.orangeText },
  searching: { ...TextStyles.caption, color: ReviewColors.secondary, paddingVertical: Spacing.xs },
  empty: { ...TextStyles.caption, color: ReviewColors.secondary, textAlign: 'center', paddingVertical: Spacing.xl },
  context: { ...TextStyles.caption, color: ReviewColors.secondary, marginTop: Spacing.xs },
  form: { paddingTop: Spacing.sm },
  formNote: { ...TextStyles.caption, color: ReviewColors.secondary, marginBottom: Spacing.md },
  formButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  gap: { height: Spacing.sm },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  unit: {
    minHeight: ReviewLayout.tap,
    minWidth: 60,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ReviewLayout.fieldRadius,
    borderWidth: 1,
    borderColor: ReviewColors.fieldBorder,
    backgroundColor: ReviewColors.field,
  },
  unitOn: { borderColor: ReviewColors.orange, backgroundColor: ReviewColors.orangeTint },
  unitText: { ...TextStyles.body, color: ReviewColors.text },
  unitTextOn: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
});
