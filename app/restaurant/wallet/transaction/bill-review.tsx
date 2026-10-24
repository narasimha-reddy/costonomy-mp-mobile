import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo, Keyboard, KeyboardAvoidingView, LayoutAnimation, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutlet } from '@/contexts/OutletProvider';
import { usePermissions } from '@/hooks/usePermissions';
import { MandiConfirm, MandiEmptyState, MandiErrorState, MandiSkeleton, useToast } from '@/components/common';
import { DateSheet, addDaysISO } from '@/components/wallet/review/DateSheet';
import { Chip, FieldLabel, HelperText, ReviewInput, Segmented, SelectField } from '@/components/wallet/review/fields';
import { KeyboardBar, ReviewFormProvider, useFormScroll } from '@/components/wallet/review/formContext';
import { InvoicePanel } from '@/components/wallet/review/InvoicePanel';
import { ReviewLineCard } from '@/components/wallet/review/ReviewLineCard';
import { SkuPicker, SupplierPicker } from '@/components/wallet/review/pickers';
import { ReviewFooter, ReviewSummary } from '@/components/wallet/review/ReviewSummary';
import { useSaveInvoiceReview } from '@/hooks/useBillReview';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useWalletInvoice } from '@/hooks/useWalletInvoice';
import { ApiError, NetworkError, RequestTimeoutError } from '@/lib/api/errors';
import { billErrorMessage, linkExpired } from '@/lib/wallet/bill';
import {
  buildReviewPayload, deliveryChanged, fieldErrorsFrom, filterLines, firstErrorField, footerStatus, formFromDraft,
  formFromInvoice, formatDay, isBlankLine, isDirty, matchedSku, newLineKey, paiseToRupees, previewTotals, readiness,
  saveProblem, taxOverrideChanged, todayIST,
  type FieldKey, type ReviewForm,
} from '@/lib/wallet/billReview';
import {
  initReviewState, lineErrorsSelector, reviewReducer, type NumberField, type ReviewAction, type ReviewState,
} from '@/lib/wallet/billReviewReducer';
import type { InvoicePage, ReviewPaymentStatus, ReviewSku, WalletInvoice } from '@/models/wallet';
import { formatMoney } from '@/utils/money';
import { ReviewColors, ReviewLayout, Spacing, TextStyles, Elevation } from '@/theme';

type Confirm =
  | { kind: 'delete'; key: string; name: string }
  | { kind: 'startOver' }
  | { kind: 'discard' }
  | { kind: 'changed' };

/** A failed save, as the footer shows it: the words, whether Try again makes sense, and where to look. */
type SaveTrouble = { message: string; retry: boolean; target: FieldKey | 'top' | null };

const PAYMENT_OPTIONS: { value: ReviewPaymentStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
];

/** Links to the bill's pages last 5 minutes; after a refetch that worked, another is allowed after this. */
const LINK_REFETCH_GAP_MS = 60_000;

/** The reducer, with nothing to act on until the bill has loaded. */
function screenReducer(state: ReviewState | null, action: ReviewAction): ReviewState | null {
  if (action.type === 'reset') return initReviewState(action.form);
  return state == null ? state : reviewReducer(state, action);
}

const reviewable = (invoice: WalletInvoice | undefined) => invoice?.status === 'READ' || invoice?.status === 'UNREADABLE';

/**
 * Review the bill of a wallet payment: check what was read, resolve each line to a SKU, fix
 * quantities, amounts and tax, and save. A clone of the cost app's Upload Invoice review, saved only
 * as this payment's review (nothing is written to the cost system).
 *
 * <p>The form is built from a fresh copy of the bill (never only a cached one), and rebuilt quietly
 * when the bill changes elsewhere while nothing has been edited here. Edits live in memory until Save;
 * leaving with unsaved edits asks first, and nothing can leave while a save is in flight.
 *
 * <p>Needs QUICKSCAN_PAY: without it (a deep link) a plain "no permission" state is shown instead of the form.
 */
export default function BillReviewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const query = useWalletInvoice(id);
  const save = useSaveInvoiceReview(id);
  const { outlet } = useOutlet();
  const { canForOutlet } = usePermissions();
  const mayChangeBill = canForOutlet('QUICKSCAN_PAY', outlet);
  const invoice = query.data;

  const [state, dispatch] = useReducer(screenReducer, null);
  const [baseline, setBaseline] = useState<ReviewForm | null>(null);
  const [version, setVersion] = useState(0);
  /** The copy of the bill that came without a draft or review (shown as an error until a new copy comes). */
  const [noDraft, setNoDraft] = useState<WalletInvoice | null>(null);
  const [showInvoice, setShowInvoice] = useState(true);
  const [search, setSearch] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [skuFor, setSkuFor] = useState<{ key: string; create: boolean } | null>(null);
  const [dateFor, setDateFor] = useState<'invoice' | 'stock' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [problem, setProblem] = useState<SaveTrouble | null>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const linksRefetchedAt = useRef<number | null>(null);
  const leaving = useRef(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  const pendingLeave = useRef<unknown>(null);
  /** The line Add SKU just made: removed again if its picker closes without a choice. */
  const adding = useRef<string | null>(null);
  const errorCache = useRef(new Map<string, { key: string; value: Partial<Record<string, string>> }>());
  const formScroll = useFormScroll();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Build the form from the bill as the server sent it, and make that the "unchanged" state. */
  const load = useCallback((fresh: WalletInvoice) => {
    const form = formFromInvoice(fresh);
    setVersion(fresh.version ?? 0);
    setProblem(null);
    if (form == null) {
      setNoDraft(fresh);
      return;
    }
    setNoDraft(null);
    dispatch({ type: 'reset', form });
    setBaseline(form);
  }, []);

  // A copy of the bill from the cache may be minutes old (the viewer was opened earlier): ask again on
  // opening, and build the form only once that answer is in.
  useEffect(() => {
    if (!query.isFetching) void query.refetch({ cancelRefetch: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const freshEnough = query.isFetchedAfterMount && !query.isFetching;

  const form = state?.form ?? null;
  const dirty = form != null && baseline != null && isDirty(form, baseline);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (invoice == null || !reviewable(invoice) || !freshEnough) return;
    if (baseline == null) {
      if (invoice !== noDraft) load(invoice);
      return;
    }
    // The bill moved on elsewhere (seen on refetch, e.g. coming back to the screen). Untouched forms
    // follow it quietly; edited ones keep the edits, and Save meets the 409 and offers to reload.
    const changedElsewhere = (invoice.version ?? 0) !== version;
    if (changedElsewhere && !dirtyRef.current && !saving.current && !leaving.current) load(invoice);
  }, [invoice, baseline, noDraft, freshEnough, version, load]);

  // Coming back to this screen asks for the bill again (and the effect above follows it if untouched).
  const refetch = useRef(query.refetch);
  refetch.current = query.refetch;
  const loaded = baseline != null;
  useEffect(() => {
    if (!loaded) return undefined;
    const unsubscribe = navigation.addListener?.('focus', () => {
      if (!saving.current) void refetch.current({ cancelRefetch: false });
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [navigation, loaded]);

  // ── Leaving ───────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('beforeRemove', (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (leaving.current) return;
      if (saving.current) {
        // A save in flight finishes here first; leaving now would pop a second screen when it lands.
        e.preventDefault();
        toast.show('Saving… one moment', 'info');
        return;
      }
      if (!dirtyRef.current) return;
      e.preventDefault();
      pendingLeave.current = e.data.action;
      setConfirm({ kind: 'discard' });
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [navigation, toast]);

  // The native stack's swipe-back cannot always be stopped once it starts, so it is off while there
  // are unsaved edits or a save in flight (the back button and Android back go through the guard above).
  const inFlight = save.isPending;
  useEffect(() => {
    (navigation as { setOptions?: (o: object) => void }).setOptions?.({ gestureEnabled: !dirty && !inFlight });
  }, [navigation, dirty, inFlight]);

  const back = useCallback(() => {
    if (router.canGoBack?.() === false) router.replace({ pathname: '/restaurant/wallet/transaction/invoice', params: { id } });
    else router.back();
  }, [router, id]);

  // The footer steps aside while typing, so the field in use has the room.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────
  const lines = form?.lines;
  const delivery = form?.delivery ?? '';
  const taxOverride = form?.taxOverride ?? '';
  const preview = useMemo(() => previewTotals(lines ?? [], delivery, taxOverride), [lines, delivery, taxOverride]);
  const ready = useMemo(() => (form ? readiness(form) : null), [form]);
  const visibleLines = useMemo(() => filterLines(lines ?? [], search), [lines, search]);
  const positions = useMemo(() => new Map((lines ?? []).map((l, i) => [l.key, i + 1])), [lines]);
  const errors = state?.errors;
  const savedTotals = !dirty && invoice?.review != null
    ? { subtotal: invoice.review.subtotal, tax: invoice.review.tax, total: invoice.review.total }
    : null;
  const lockedIds = useMemo(() => {
    const set = new Set<number>();
    for (const l of lines ?? []) if (l.key !== skuFor?.key && l.sku?.id != null) set.add(l.sku.id);
    return set;
  }, [lines, skuFor]);
  const skuLine = skuFor ? lines?.find((l) => l.key === skuFor.key) ?? null : null;
  const skuSuggestion = useMemo(
    () => (skuLine == null || invoice == null ? null : matchedSku(invoice, skuLine.lineNo)),
    [skuLine, invoice],
  );
  const supplierSuggestion = useMemo(() => {
    if (invoice == null) return null;
    const match = invoice.reading?.supplierMatch;
    if (match) return { id: match.id, name: match.name };
    const s = invoice.draft?.supplier;
    if (s?.name) return s;
    return invoice.reading?.vendorName ? { id: null, name: invoice.reading.vendorName } : null;
  }, [invoice]);
  const latestDay = addDaysISO(todayIST(), 1);

  // ── Line actions (stable, so memoised cards skip renders) ─────────────
  const onNumber = useCallback((key: string, field: NumberField, value: string) => {
    dispatch({ type: 'setLineNumber', key, field, value });
  }, []);
  const onPickSku = useCallback((key: string) => setSkuFor({ key, create: false }), []);
  const onCreateSku = useCallback((key: string) => setSkuFor({ key, create: true }), []);
  const onToggleIgnore = useCallback((key: string) => dispatch({ type: 'toggleIgnore', key }), []);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const onDelete = useCallback((key: string) => {
    const line = linesRef.current?.find((l) => l.key === key);
    setConfirm({ kind: 'delete', key, name: line?.fromInvoice?.name ?? line?.sku?.name ?? 'this item' });
  }, []);

  const animate = () => { if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); };

  const togglePanel = () => {
    animate();
    setShowInvoice((v) => !v);
  };

  const removeLine = (key: string) => {
    animate();
    dispatch({ type: 'removeLine', key });
    formScroll.forget(`line:${key}:`);
  };

  // Add SKU: a blank line at the end (every other line keeps its number), scrolled to, with its SKU list open.
  const addLine = () => {
    if (inFlight) return;
    const key = newLineKey();
    animate();
    setSearch('');
    dispatch({ type: 'addLine', key });
    adding.current = key;
    setSkuFor({ key, create: false });
    formScroll.scrollToKey(`line:${key}:row`);
  };

  const closeSkuPicker = () => {
    const key = adding.current;
    adding.current = null;
    setSkuFor(null);
    const line = key ? linesRef.current?.find((l) => l.key === key) : undefined;
    if (key && line && isBlankLine(line)) removeLine(key);
  };

  // ── Links to the bill's pages ─────────────────────────────────────────
  // They expire after 5 minutes: fetch fresh ones when a page fails, at most once a minute (a long
  // review needs more than one), and say so if a fresh link fails too.
  const linkProblem = useCallback(() => {
    const last = linksRefetchedAt.current;
    if (last == null || Date.now() - last > LINK_REFETCH_GAP_MS) {
      linksRefetchedAt.current = Date.now();
      void query.refetch();
    } else {
      setImageFailed(true);
    }
  }, [query]);

  const openPdf = useCallback(async (page: InvoicePage) => {
    let url = page.url;
    try {
      if (linkExpired(page.expiresAt, Date.now())) {
        const fresh = (await query.refetch()).data?.pages.find((p) => p.page === page.page);
        if (fresh) url = fresh.url;
      }
      await Linking.openURL(url);
    } catch {
      toast.show('Could not open the PDF', 'error');
    }
  }, [query, toast]);

  // ── Saving ────────────────────────────────────────────────────────────
  const goTo = useCallback((target: FieldKey | 'top' | null) => {
    if (target == null) return;
    if (search) setSearch('');
    if (target === 'top') formScroll.scrollToTop();
    else formScroll.scrollToKey(target);
  }, [formScroll, search]);

  const showErrors = useCallback((fields: Partial<Record<FieldKey, string>>, other: string[]) => {
    dispatch({ type: 'setErrors', errors: fields, other });
    const first = form ? firstErrorField(fields, form.lines) : null;
    goTo(first ?? (other.length ? 'top' : null));
    return first;
  }, [form, goTo]);

  const onSave = async () => {
    if (form == null || ready == null || !ready.ready || saving.current || save.isPending) return;
    Keyboard.dismiss();
    const blocked = saveProblem(form);
    if (blocked) {
      setProblem(null);
      showErrors({ [blocked.field]: blocked.message }, []);
      AccessibilityInfo.announceForAccessibility?.(blocked.message);
      return;
    }
    const payload = buildReviewPayload(form, version);
    const sentKeys = form.lines.map((l) => l.key);
    saving.current = true;
    setProblem(null);
    dispatch({ type: 'clearErrors' });
    try {
      await save.mutateAsync(payload);
      leaving.current = true;
      toast.show('Review saved', 'success');
      // Only if this screen is still the one in front (nothing can leave mid-save, but be sure).
      if (mounted.current && (navigation as { isFocused?: () => boolean }).isFocused?.() !== false) back();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 400) {
        const found = fieldErrorsFrom(error, sentKeys);
        const marked = Object.keys(found.fields).length > 0;
        const first = showErrors(found.fields, found.other);
        setProblem(marked
          ? { message: 'Some details need fixing. They are marked in red.', retry: false, target: first }
          : { message: 'Could not save. See the message at the top.', retry: false, target: 'top' });
        const count = Object.keys(found.fields).length + found.other.length;
        AccessibilityInfo.announceForAccessibility?.(`${count} ${count === 1 ? 'detail needs' : 'details need'} fixing`);
      } else if (error instanceof ApiError && error.status === 409 && error.code === 'INVOICE_CHANGED') {
        setConfirm({ kind: 'changed' });
      } else if (error instanceof ApiError && error.status === 409) {
        setProblem({ message: 'The bill is still being read. Try again in a moment.', retry: true, target: null });
      } else if (error instanceof RequestTimeoutError) {
        setProblem({ message: 'The server took too long to answer. Your changes are kept.', retry: true, target: null });
      } else if (error instanceof NetworkError) {
        setProblem({ message: 'You seem to be offline. Your changes are kept.', retry: true, target: null });
      } else if (error instanceof ApiError && (error.status >= 500 || error.status === 422)) {
        // A 422 (IDEMPOTENCY_KEY_REUSED) can only be our own bug; the key is dropped, so Try again is clean.
        setProblem({ message: 'Something went wrong on our side. Your changes are kept.', retry: true, target: null });
      } else {
        setProblem({ message: billErrorMessage(error), retry: false, target: null });
      }
    } finally {
      saving.current = false;
    }
  };

  const reload = async () => {
    setConfirm(null);
    const fresh = (await query.refetch()).data;
    if (fresh && reviewable(fresh) && mounted.current) {
      load(fresh);
      toast.show('Loaded the latest version of this bill', 'info');
    }
  };

  const startOver = () => {
    if (invoice == null) return;
    const fresh = formFromDraft(invoice);
    if (fresh == null) {
      toast.show('Could not start over. Reload the bill and try again.', 'error');
      return;
    }
    dispatch({ type: 'reset', form: fresh });
    setSearch('');
    setProblem(null);
    toast.show('Back to what was read from the bill', 'info');
  };

  const onConfirm = () => {
    const c = confirm;
    if (c == null) return;
    if (c.kind === 'discard' && saving.current) return;
    setConfirm(null);
    if (c.kind === 'delete') {
      removeLine(c.key);
    } else if (c.kind === 'startOver') {
      startOver();
    } else if (c.kind === 'discard') {
      leaving.current = true;
      const action = pendingLeave.current;
      pendingLeave.current = null;
      if (action) navigation.dispatch(action as never);
      else back();
    } else if (c.kind === 'changed') {
      void reload();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  const canStartOver = form != null && invoice?.draft != null;
  const header = (
    <View style={[styles.top, { paddingTop: insets.top }]} testID="review-header">
      <StatusBar style="dark" />
      <Pressable
        onPress={back}
        disabled={inFlight}
        accessibilityRole="button"
        accessibilityLabel="Back"
        accessibilityState={{ disabled: inFlight }}
        style={styles.headerButton}
        testID="review-back"
      >
        <Ionicons name="arrow-back" size={22} color={inFlight ? ReviewColors.tertiary : ReviewColors.text} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>Review bill</Text>
      {canStartOver ? (
        <Pressable
          onPress={() => setMenuOpen((v) => !v)}
          disabled={inFlight}
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityState={{ expanded: menuOpen, disabled: inFlight }}
          style={styles.headerButton}
          testID="review-more"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={inFlight ? ReviewColors.tertiary : ReviewColors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!mayChangeBill) {
    return (
      <View style={styles.page}>
        {header}
        <MandiEmptyState icon="lock-closed-outline" title="You don't have permission to add or change bills" />
      </View>
    );
  }

  if (invoice == null || form == null || state == null) {
    const notFound = (query.error as { status?: number } | null)?.status === 404;
    const waiting = invoice != null && !reviewable(invoice);
    return (
      <View style={styles.page}>
        {header}
        {query.isError && invoice == null ? (
          notFound ? (
            <MandiEmptyState icon="document-text-outline" title="No bill on this payment" description="Add the shop's bill from the transaction page." />
          ) : (
            <MandiErrorState message={billErrorMessage(query.error)} onRetry={() => { void query.refetch(); }} retrying={query.isFetching} />
          )
        ) : waiting ? (
          <MandiEmptyState
            icon="time-outline"
            title="The bill is still being read"
            description="You can review it once the reading is done, in about a minute."
          />
        ) : noDraft ? (
          <MandiErrorState message="This bill cannot be reviewed yet. Try again in a moment." onRetry={() => { void query.refetch(); }} retrying={query.isFetching} />
        ) : (
          <View style={styles.skeleton} testID="review-loading">
            <MandiSkeleton height={44} width="40%" />
            <MandiSkeleton height={ReviewLayout.panelImageHeight} />
            <MandiSkeleton height={160} />
            <MandiSkeleton height={220} />
          </View>
        )}
      </View>
    );
  }

  const fieldError = (key: FieldKey) => errors?.[key] ?? null;
  const status = footerStatus(ready!, problem ? { message: problem.message, target: problem.target } : null);
  const total = savedTotals?.total != null ? formatMoney(savedTotals.total) : formatMoney(paiseToRupees(preview.total));

  return (
    <ReviewFormProvider api={formScroll.api}>
      <View style={styles.page}>
        {header}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={formScroll.scroll}
            onScroll={formScroll.onScroll}
            scrollEventThrottle={32}
            onLayout={formScroll.onLayout}
            keyboardShouldPersistTaps="handled"
            // On the web any scroll (even the page settling after a note appears) would count as a drag
            // and take the focus away from the field being typed in.
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'android' ? 'on-drag' : 'none'}
            contentContainerStyle={styles.scroll}
            testID="review-scroll"
          >
            <View ref={formScroll.content} style={styles.content} collapsable={false}>
              <InvoicePanel
                pages={invoice.pages}
                collapsed={!showInvoice}
                onToggle={togglePanel}
                onOpen={() => router.push({ pathname: '/restaurant/wallet/transaction/invoice', params: { id } })}
                onOpenPdf={(p) => { void openPdf(p); }}
                onLinkProblem={linkProblem}
                failed={imageFailed}
                onRetry={() => { linksRefetchedAt.current = Date.now(); setImageFailed(false); void query.refetch(); }}
              />

              {state.otherErrors.length > 0 ? (
                <View style={styles.otherErrors} accessibilityRole="alert" testID="other-errors">
                  {state.otherErrors.map((m, i) => (
                    <View key={i} style={styles.otherRow}>
                      <Ionicons name="alert-circle" size={16} color={ReviewColors.error} />
                      <Text style={styles.otherText}>{m}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.card} testID="review-details" onLayout={formScroll.api.anchor('details', null)}>
                <SelectField
                  ref={(node) => formScroll.api.register('supplier', node)}
                  onLayout={formScroll.api.anchor('supplier', 'details')}
                  label="Supplier"
                  required
                  value={form.supplier.name}
                  placeholder="Choose the supplier"
                  onPress={() => setSupplierOpen(true)}
                  error={fieldError('supplier')}
                  chip={form.supplier.name && form.supplier.id == null ? <Chip label="New" tone="new" /> : null}
                  hint={invoice.reading?.vendorName && invoice.reading.vendorName !== form.supplier.name ? `On the bill: ${invoice.reading.vendorName}` : null}
                  testID="supplier-field"
                />

                <View onLayout={formScroll.api.anchor('invoiceNumber', 'details')}>
                  <FieldLabel label="Invoice number" />
                  <ReviewInput
                    value={form.invoiceNumber}
                    onChangeText={(value) => dispatch({ type: 'setInvoiceNumber', value })}
                    placeholder="As printed on the bill"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    maxLength={60}
                    accessibilityLabel="Invoice number"
                    invalid={!!fieldError('invoiceNumber')}
                    fieldKey="invoiceNumber"
                    testID="invoice-number"
                  />
                  <HelperText error={fieldError('invoiceNumber')} />
                </View>

                <View ref={(node) => formScroll.api.register('paymentStatus', node)} onLayout={formScroll.api.anchor('paymentStatus', 'details')}>
                  <FieldLabel label="Payment status" />
                  <Segmented
                    label="Payment status"
                    options={PAYMENT_OPTIONS}
                    value={form.paymentStatus}
                    onChange={(value) => dispatch({ type: 'setPaymentStatus', value })}
                    testID="payment-status"
                  />
                  <HelperText error={fieldError('paymentStatus')} />
                </View>

                <View style={styles.dates} onLayout={formScroll.api.anchor('dates', 'details')}>
                  <SelectField
                    ref={(node) => formScroll.api.register('invoiceDate', node)}
                    onLayout={formScroll.api.anchor('invoiceDate', 'dates')}
                    label="Invoice date"
                    value={formatDay(form.invoiceDate)}
                    placeholder="Pick a date"
                    onPress={() => setDateFor('invoice')}
                    error={fieldError('invoiceDate')}
                    hint={form.invoiceDateRead ? `Read as “${form.invoiceDateRead}”` : null}
                    style={styles.dateField}
                    testID="invoice-date"
                  />
                  <SelectField
                    ref={(node) => formScroll.api.register('stockInDate', node)}
                    onLayout={formScroll.api.anchor('stockInDate', 'dates')}
                    label="Stock-in date"
                    required
                    value={formatDay(form.stockInDate)}
                    placeholder="Pick a date"
                    onPress={() => setDateFor('stock')}
                    error={fieldError('stockInDate')}
                    style={styles.dateField}
                    testID="stock-in-date"
                  />
                </View>

                {!form.dateConfirmed ? (
                  <View style={styles.confirmDate} testID="confirm-date-bar">
                    <Ionicons name="calendar-outline" size={18} color={ReviewColors.attentionText} />
                    <Text style={styles.confirmDateText}>
                      Check the invoice date{form.invoiceDate ? `: ${formatDay(form.invoiceDate)}` : ''}. Bills are often misread.
                    </Text>
                    <Pressable
                      onPress={() => dispatch({ type: 'confirmDate' })}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm the invoice date"
                      style={styles.confirmDateButton}
                      testID="confirm-date"
                    >
                      <Text style={styles.confirmDateButtonText}>Confirm</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.skuHead} onLayout={formScroll.api.anchor('items', null)}>
                <Text style={styles.skuTitle} accessibilityRole="header" testID="sku-count">
                  SKUs <Text style={styles.skuCount}>({form.lines.length})</Text>
                </Text>
                <Pressable
                  onPress={addLine}
                  accessibilityRole="button"
                  accessibilityLabel="Add SKU, adds a new item at the end"
                  style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
                  testID="add-sku"
                >
                  <Ionicons name="add" size={18} color={ReviewColors.text} />
                  <Text style={styles.addText}>Add SKU</Text>
                </Pressable>
              </View>
              {fieldError('items') ? <HelperText error={fieldError('items')} /> : null}

              {form.lines.length > 0 ? (
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={ReviewColors.tertiary} />
                  <ReviewInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search by name on the bill or SKU…"
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                    maxLength={60}
                    accessibilityLabel="Search items by the name on the bill or the SKU"
                    style={styles.searchInput}
                    testID="line-search"
                  />
                  {search !== '' ? (
                    <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear the search" style={styles.clear}>
                      <Ionicons name="close-circle" size={18} color={ReviewColors.tertiary} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {form.lines.length === 0 ? (
                <View style={styles.empty} testID="no-lines">
                  <Ionicons name="cube-outline" size={28} color={ReviewColors.tertiary} />
                  <Text style={styles.emptyText}>No items yet. Add one.</Text>
                </View>
              ) : visibleLines.length === 0 ? (
                <Text style={styles.noMatch} testID="no-match">No items match “{search.trim()}”.</Text>
              ) : (
                <View style={styles.lines} onLayout={formScroll.api.anchor('lines', null)}>
                  {visibleLines.map((line) => (
                    <ReviewLineCard
                      key={line.key}
                      line={line}
                      position={positions.get(line.key) ?? 0}
                      errors={lineErrorsSelector(state.errors, errorCache.current, line.key)}
                      onNumber={onNumber}
                      onPickSku={onPickSku}
                      onCreateSku={onCreateSku}
                      onDelete={onDelete}
                      onToggleIgnore={onToggleIgnore}
                    />
                  ))}
                </View>
              )}

              <ReviewSummary
                preview={preview}
                server={savedTotals}
                delivery={form.delivery}
                deliveryChanged={deliveryChanged(form)}
                deliveryError={fieldError('delivery')}
                onDelivery={(value) => dispatch({ type: 'setDelivery', value })}
                onResetDelivery={() => dispatch({ type: 'resetDelivery' })}
                taxOverride={form.taxOverride}
                taxChanged={taxOverrideChanged(form)}
                taxFromBill={form.taxOverride !== '' || form.draftTaxOverride !== ''}
                taxError={fieldError('taxOverride')}
                onTaxOverride={(value) => dispatch({ type: 'setTaxOverride', value })}
                onResetTax={() => dispatch({ type: 'resetTaxOverride' })}
              />
            </View>
          </ScrollView>
          <ReviewFooter
            total={total}
            status={status}
            onStatus={() => goTo(status.target)}
            ready={ready?.ready ?? false}
            saving={inFlight}
            retry={problem?.retry ?? false}
            onSave={() => { void onSave(); }}
            hidden={keyboardUp}
          />
        </KeyboardAvoidingView>
        <KeyboardBar onNext={formScroll.goNext} />

        {menuOpen ? (
          <>
            <Pressable
              style={styles.menuScrim}
              onPress={() => setMenuOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close the menu"
              testID="review-menu-close"
            />
            <View style={[styles.menu, { top: insets.top + 52 }]} accessibilityRole="menu" testID="review-menu">
              <Pressable
                onPress={() => { setMenuOpen(false); setConfirm({ kind: 'startOver' }); }}
                accessibilityRole="menuitem"
                accessibilityLabel="Start over, go back to what was read from the bill"
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                testID="start-over"
              >
                <Ionicons name="refresh" size={18} color={ReviewColors.error} />
                <Text style={styles.menuText}>Start over</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <SupplierPicker
          visible={supplierOpen}
          onClose={() => setSupplierOpen(false)}
          current={form.supplier}
          suggestion={supplierSuggestion}
          readName={invoice.reading?.vendorName ?? null}
          onChoose={(supplier) => { dispatch({ type: 'setSupplier', supplier }); setSupplierOpen(false); }}
        />
        <SkuPicker
          visible={skuFor != null}
          onClose={closeSkuPicker}
          current={skuLine?.sku ?? null}
          suggestion={skuSuggestion}
          lineName={skuLine?.fromInvoice?.name ?? null}
          lineUnit={skuLine?.unit ?? skuLine?.fromInvoice?.unit ?? null}
          lockedIds={lockedIds}
          startInCreate={skuFor?.create}
          onChoose={(sku: ReviewSku) => {
            if (skuFor) dispatch({ type: 'setLineSku', key: skuFor.key, sku });
            adding.current = null;
            setSkuFor(null);
          }}
        />
        <DateSheet
          visible={dateFor != null}
          title={dateFor === 'stock' ? 'Stock-in date' : 'Invoice date'}
          value={dateFor === 'stock' ? form.stockInDate : form.invoiceDate}
          maxDate={latestDay}
          tooLateMessage={(max) => (dateFor === 'stock'
            ? `The stock-in date can be at most ${formatDay(max)}.`
            : `The invoice date can be at most ${formatDay(max)}.`)}
          onPick={(value) => {
            dispatch({ type: dateFor === 'stock' ? 'setStockInDate' : 'setInvoiceDate', value });
            setDateFor(null);
          }}
          onClose={() => setDateFor(null)}
          testID="date-sheet"
        />
        <MandiConfirm
          visible={confirm != null}
          title={confirmTitle(confirm)}
          message={confirmMessage(confirm)}
          confirmLabel={confirmLabel(confirm)}
          cancelLabel={confirm?.kind === 'delete' ? 'Keep item' : confirm?.kind === 'changed' ? 'Not now' : 'Keep editing'}
          destructive={confirm?.kind === 'delete' || confirm?.kind === 'discard' || confirm?.kind === 'startOver'}
          confirmDisabled={confirm?.kind === 'discard' && inFlight}
          onConfirm={onConfirm}
          onCancel={() => { pendingLeave.current = null; setConfirm(null); }}
        />
      </View>
    </ReviewFormProvider>
  );
}

function confirmTitle(c: Confirm | null): string {
  switch (c?.kind) {
    case 'delete': return 'Remove this item?';
    case 'startOver': return 'Start over?';
    case 'discard': return 'Discard changes?';
    case 'changed': return 'This bill changed on another device';
    default: return '';
  }
}

function confirmMessage(c: Confirm | null): string | undefined {
  switch (c?.kind) {
    case 'delete': return `“${c.name}” is taken off this review. Start over brings it back.`;
    case 'startOver': return 'Your changes are replaced with what was read from the bill.';
    case 'discard': return 'Your edits to this bill have not been saved.';
    case 'changed': return 'It was saved or changed after you opened it. Reload to see the latest version. Your edits on this screen will be replaced.';
    default: return undefined;
  }
}

function confirmLabel(c: Confirm | null): string {
  switch (c?.kind) {
    case 'delete': return 'Remove item';
    case 'startOver': return 'Start over';
    case 'discard': return 'Discard changes';
    case 'changed': return 'Reload';
    default: return 'OK';
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ReviewColors.page },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ReviewColors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ReviewColors.divider,
    paddingHorizontal: Spacing.xs,
    minHeight: 52,
  },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { ...TextStyles.subtitle, fontFamily: TextStyles.sectionTitle.fontFamily, color: ReviewColors.text, flex: 1 },
  skeleton: { padding: ReviewLayout.gutter, gap: Spacing.md },
  scroll: { paddingBottom: Spacing.xxl },
  content: { paddingHorizontal: ReviewLayout.gutter, paddingTop: Spacing.md, gap: ReviewLayout.sectionGap },
  pressed: { backgroundColor: ReviewColors.band },
  otherErrors: { gap: Spacing.xs, padding: Spacing.md, borderRadius: ReviewLayout.fieldRadius, backgroundColor: ReviewColors.deviationBg },
  otherRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  otherText: { ...TextStyles.caption, color: ReviewColors.error, flex: 1 },
  card: {
    backgroundColor: ReviewColors.card,
    borderWidth: 1,
    borderColor: ReviewColors.cardBorder,
    borderRadius: ReviewLayout.cardRadius,
    padding: ReviewLayout.cardPad,
    gap: Spacing.xs,
  },
  dates: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md },
  dateField: { flexGrow: 1, flexBasis: 140 },
  confirmDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: ReviewLayout.fieldRadius,
    borderWidth: 1,
    borderColor: ReviewColors.attentionBorder,
    backgroundColor: ReviewColors.attentionCard,
  },
  confirmDateText: { ...TextStyles.caption, color: ReviewColors.attentionText, flex: 1 },
  confirmDateButton: {
    minHeight: ReviewLayout.tap,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    borderRadius: ReviewLayout.fieldRadius - 2,
    borderWidth: 1,
    borderColor: ReviewColors.ignoreBorder,
    backgroundColor: ReviewColors.card,
  },
  confirmDateButtonText: { ...TextStyles.captionEmphasis, color: ReviewColors.attentionText },
  skuHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, marginBottom: -Spacing.sm },
  skuTitle: { ...TextStyles.bodyEmphasis, color: ReviewColors.text },
  skuCount: { ...TextStyles.body, color: ReviewColors.secondary },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: ReviewLayout.tap,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: ReviewColors.fieldBorder,
    borderRadius: ReviewLayout.fieldRadius,
    backgroundColor: ReviewColors.card,
  },
  addText: { ...TextStyles.captionEmphasis, color: ReviewColors.text },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.md,
    borderWidth: 1,
    borderColor: ReviewColors.fieldBorder,
    borderRadius: ReviewLayout.fieldRadius,
    backgroundColor: ReviewColors.card,
    marginBottom: -Spacing.sm,
  },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingLeft: Spacing.sm },
  clear: { width: ReviewLayout.tap, height: ReviewLayout.tap, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ReviewColors.fieldBorder,
    borderRadius: ReviewLayout.cardRadius,
  },
  emptyText: { ...TextStyles.body, color: ReviewColors.secondary },
  noMatch: { ...TextStyles.caption, color: ReviewColors.secondary, textAlign: 'center', paddingVertical: Spacing.xl },
  lines: { gap: Spacing.md },
  menuScrim: { ...StyleSheet.absoluteFillObject },
  menu: {
    position: 'absolute',
    right: Spacing.sm,
    minWidth: 200,
    paddingVertical: Spacing.xs,
    backgroundColor: ReviewColors.card,
    borderRadius: ReviewLayout.fieldRadius,
    borderWidth: 1,
    borderColor: ReviewColors.cardBorder,
    ...Elevation.floating,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: ReviewLayout.tap + 4, paddingHorizontal: Spacing.md },
  menuText: { ...TextStyles.body, color: ReviewColors.error },
});
