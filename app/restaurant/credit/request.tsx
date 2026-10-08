import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/contexts/SessionProvider';
import { useOutlet } from '@/contexts/OutletProvider';
import { fetchStorefrontHeader, searchSuppliers } from '@/services/catalog';
import { useDebounced } from '@/hooks/useDebounced';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { fetchCreditSummary, requestCredit } from '@/services/credit';
import {
  MandiButton,
  MandiCard,
  MandiErrorState,
  MandiFormField,
  MandiHeader,
  MandiOfflineBanner,
  MandiScreen,
  MandiSearchBar,
  MandiSkeletonList,
  MandiStickyBar,
  MandiText,
} from '@/components/common';
import { agreementsByStore, requestErrorMessage, supplierCreditState } from '@/lib/credit/request';
import { scaledToAmount, toScaled } from '@/lib/wallet/amount';
import { formatMoney } from '@/utils/money';
import { track } from '@/analytics';
import { Colors, IconSize, Radius, Spacing, TouchTarget } from '@/theme';
import { radioProps } from '@/lib/a11y';

const SCREEN = 'REST-CREDIT-02';

const PERIODS = [7, 15, 30, 45];

/**
 * REST-CREDIT-02. Doc 05 §20.
 *
 * <p>Supplier, outlet, requested limit, payment days, purpose — the spec's
 * fields. The outlet is the one currently selected rather than a picker: credit
 * belongs to an outlet, and choosing a different one here than the header shows
 * is how a restaurant ends up with a line against the wrong branch.
 */
export default function CreditRequestScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { outletId, outlet } = useOutlet();
  const { offline } = useNetworkStatus();

  /**
   * Arriving from a supplier's own shelf, the supplier is already decided.
   *
   * <p>Asking somebody to search for the store whose page they just tapped
   * "Request Credit" on is asking them to prove they meant it.
   */
  const { storeId: preset } = useLocalSearchParams<{ storeId?: string }>();
  const presetId = preset != null && preset !== '' ? Number(preset) : null;

  const [storeId, setStoreId] = useState<number | null>(
    presetId != null && Number.isFinite(presetId) ? presetId : null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [picking, setPicking] = useState(storeId == null);
  const [supplierTerm, setSupplierTerm] = useState('');
  const [limit, setLimit] = useState('');
  const [days, setDays] = useState(30);
  const [purpose, setPurpose] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sending = useRef(false);

  // There is no "suppliers serving this outlet" endpoint — supplier search is
  // search, and returns nothing under two characters. Asking for a name is
  // honest here: a restaurant requesting credit already knows who from.
  const settledTerm = useDebounced(supplierTerm, 250);
  const searching = settledTerm.trim().length >= 2;

  const suppliers = useQuery({
    queryKey: ['search', 'suppliers', 'all', settledTerm.trim(), outletId],
    // reach=all: a supplier you ask for credit need not deliver to this outlet, and a filter would hide them.
    queryFn: () => searchSuppliers(accessToken as string, settledTerm.trim(), outletId ?? undefined,
      undefined, undefined, { reach: 'all' }),
    enabled: searching && accessToken != null,
  });

  // The credit the restaurant already has, from the overview's own cache entry:
  // what each search result says about itself comes from here, not a new call.
  const summary = useQuery({
    queryKey: ['outlet', outletId, 'credit'],
    queryFn: () => fetchCreditSummary(accessToken as string, outletId as number),
    enabled: outletId != null && accessToken != null,
  });
  const byStore = useMemo(() => agreementsByStore(summary.data?.agreements ?? []), [summary.data]);

  // Only to name the preselected store. The shelf header already answers it,
  // and a second endpoint for "what is this store called" would be a third
  // place that could disagree.
  const presetStore = useQuery({
    queryKey: ['supplier-store', storeId, 'storefront', outletId],
    queryFn: () => fetchStorefrontHeader(accessToken as string, storeId as number,
      outletId ?? undefined),
    enabled: !picking && storeId != null && accessToken != null,
  });

  const chosenName = storeName ?? presetStore.data?.supplierName ?? presetStore.data?.storeName ?? null;
  const chosenState = storeId != null ? supplierCreditState(byStore.get(storeId)) : null;
  const chosenBlocked = chosenState?.block != null;

  const scaled = limit.trim() === '' ? null : toScaled(limit, 2);
  const limitError = limit.trim() === '' ? null
    : scaled == null ? 'Use a number with at most 2 decimal places.'
      : scaled < 10_000 ? 'Enter at least ₹1.' : null;
  const amount = scaled != null && scaled >= 10_000 ? scaledToAmount(scaled) : null;
  const valid = storeId != null && amount != null && !chosenBlocked;

  const submit = useMutation({
    mutationFn: () =>
      requestCredit(accessToken as string, {
        supplierStoreId: storeId as number,
        outletId: outletId as number,
        requestedLimit: amount as string,
        requestedDays: days,
        purpose: purpose.trim() || undefined,
      }),
    onSuccess: () => {
      track('credit_requested', { screen: SCREEN, outletId }, { days });
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
      setSentTo(chosenName ?? 'the supplier');
    },
    onError: (caught) => {
      setProblem(requestErrorMessage(caught));
      // The server's answer may mean the picture here is stale.
      void queryClient.invalidateQueries({ queryKey: ['outlet', outletId, 'credit'] });
    },
    onSettled: () => { sending.current = false; },
  });

  function send() {
    // A second tap while the first is in flight must not send a second request.
    if (!valid || offline || sending.current) return;
    sending.current = true;
    setProblem(null);
    submit.mutate();
  }

  const openAgreement = (id: number) => router.push(`/restaurant/credit/${id}`);
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setProblem(null); };

  if (sentTo != null) {
    return (
      <MandiScreen
        header={<MandiHeader title="Request credit" subtitle={outlet?.name} />}
        footer={
          <MandiStickyBar>
            <MandiButton
              testID="back-to-credit"
              label="Back to Credit"
              size="lg"
              onPress={() => router.replace('/restaurant/credit')}
            />
          </MandiStickyBar>
        }
      >
        <View style={styles.sent} accessibilityLiveRegion="polite" testID="request-sent">
          <Ionicons name="checkmark-circle" size={IconSize.xl} color={Colors.success} />
          <MandiText variant="subtitle" center>{`Request sent to ${sentTo}`}</MandiText>
          <MandiText variant="body" color={Colors.textSecondary} center>
            {`They usually reply within a day. We'll notify you.`}
          </MandiText>
        </View>
      </MandiScreen>
    );
  }

  const summaryLine = valid && chosenName != null && amount != null
    ? `You are asking ${chosenName} for ${formatMoney(amount, true)} credit, to pay within ${days} days.`
    : null;

  return (
    // The whole screen lifts above the keyboard: the focused field is in the
    // scroll area and the submit button is in the footer, so neither is hidden.
    <KeyboardAvoidingView style={styles.flex} behavior="padding" testID="request-keyboard-avoiding">
    <MandiScreen
      contentStyle={styles.content}
      header={<MandiHeader title="Request credit" subtitle={outlet?.name} back />}
      footer={
        <MandiStickyBar>
          <MandiButton
            testID="send-request"
            label="Send Request"
            size="lg"
            disabled={!valid || offline}
            loading={submit.isPending}
            onPress={send}
          />
          <MandiText variant="caption" color={Colors.textTertiary} center>
            The supplier decides. They may approve a different limit or period, which you
            will be asked to accept.
          </MandiText>
        </MandiStickyBar>
      }
    >
      <MandiOfflineBanner visible={offline} />
      <MandiCard>
        <MandiText variant="captionEmphasis" muted>Supplier</MandiText>
        {!picking ? (
          <View style={styles.chosen}>
            <View style={styles.flex}>
              <MandiText variant="body">
                {chosenName ?? 'This supplier'}
              </MandiText>
              {presetStore.data?.storeName != null && storeName == null && (
                <MandiText variant="caption" color={Colors.textSecondary}>
                  {presetStore.data.storeName}
                </MandiText>
              )}
              {chosenState?.block != null && (
                <MandiText variant="captionEmphasis" color={Colors.danger} testID="chosen-blocked">
                  {chosenState.block.label}
                </MandiText>
              )}
            </View>
            {chosenState?.agreementId != null && (
              <MandiButton
                label="Open"
                variant="tertiary"
                size="sm"
                onPress={() => openAgreement(chosenState.agreementId as number)}
              />
            )}
            <MandiButton
              label="Change"
              variant="tertiary"
              size="sm"
              onPress={() => {
                setPicking(true);
                setStoreId(null);
                setStoreName(null);
              }}
            />
          </View>
        ) : (
        <>
        <MandiText variant="caption" color={Colors.textSecondary}>
          Search for one you already order from.
        </MandiText>
        <MandiSearchBar
          value={supplierTerm}
          onChangeText={setSupplierTerm}
          placeholder="Supplier name"
          loading={suppliers.isFetching}
          style={styles.search}
        />
        {!searching ? (
          <MandiText variant="caption" color={Colors.textTertiary}>
            Type at least two letters.
          </MandiText>
        ) : suppliers.isPending ? (
          <MandiSkeletonList count={2} />
        ) : suppliers.error ? (
          <MandiErrorState message="Couldn't load suppliers." onRetry={() => suppliers.refetch()} />
        ) : (suppliers.data?.suppliers ?? []).length === 0 ? (
          <MandiText variant="caption" color={Colors.textTertiary}>
            No supplier matching &ldquo;{settledTerm.trim()}&rdquo; delivers here.
          </MandiText>
        ) : (
          (suppliers.data?.suppliers ?? []).map((supplier) => {
            const state = supplierCreditState(byStore.get(supplier.supplierStoreId));
            const block = state.block;
            const active = supplier.supplierStoreId === storeId;
            // Only a supplier with nothing in the way can be picked; an approved
            // line is a different job (accept the terms), so it opens instead.
            const disabled = block != null && block.kind !== 'review';
            const onPress = () => {
              if (block == null) {
                setStoreId(supplier.supplierStoreId);
                setStoreName(supplier.supplierName);
                setProblem(null);
              } else if (block.kind === 'review' && state.agreementId != null) {
                openAgreement(state.agreementId);
              }
            };
            return (
              <View
                key={supplier.supplierStoreId}
                style={[styles.option, active && styles.optionActive, disabled && styles.optionDisabled]}
              >
                <Pressable
                  testID={`supplier-row-${supplier.supplierStoreId}`}
                  onPress={onPress}
                  disabled={disabled}
                  accessibilityRole={block == null ? 'radio' : 'button'}
                  accessibilityLabel={[supplier.supplierName, supplier.storeName, block?.label, state.detail]
                    .filter(Boolean).join(', ')}
                  accessibilityState={{ selected: active, disabled }}
                  style={styles.optionMain}
                >
                  <View style={styles.flex}>
                    <MandiText variant="body">{supplier.supplierName}</MandiText>
                    <MandiText variant="caption" color={Colors.textSecondary}>
                      {supplier.storeName}
                    </MandiText>
                    {block != null && (
                      <MandiText
                        variant="captionEmphasis"
                        color={block.kind === 'review' ? Colors.primary : Colors.textSecondary}
                      >
                        {block.label}
                      </MandiText>
                    )}
                    {state.detail != null && (
                      <MandiText variant="caption" color={Colors.textSecondary}>{state.detail}</MandiText>
                    )}
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={IconSize.md} color={Colors.primary} />}
                </Pressable>
                {block?.kind === 'open' && block.link && state.agreementId != null && (
                  <MandiButton
                    testID={`supplier-open-${supplier.supplierStoreId}`}
                    label="Open"
                    variant="tertiary"
                    size="sm"
                    onPress={() => openAgreement(state.agreementId as number)}
                  />
                )}
              </View>
            );
          })
        )}
        </>
        )}
      </MandiCard>

      <MandiFormField
        label="Credit limit you need (₹)"
        value={limit}
        onChangeText={edit((text: string) => setLimit(text.replace(/[^\d.]/g, '')))}
        placeholder="50000"
        keyboardType="decimal-pad"
        maxLength={12}
        required
        error={limitError}
        hint="The most you would want to owe this supplier at any one time."
        testID="limit-field"
      />

      <MandiCard>
        <MandiText variant="bodyEmphasis">Days to pay</MandiText>
        <MandiText variant="caption" color={Colors.textSecondary}>
          How long after an order you would settle it.
        </MandiText>
        <View style={styles.periods}>
          {PERIODS.map((option) => {
            const active = option === days;
            return (
              <Pressable
                key={option}
                testID={`days-${option}`}
                onPress={() => { setDays(option); setProblem(null); }}
                accessibilityRole="radio"
                accessibilityLabel={`${option} days`}
                {...radioProps(active)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <MandiText
                  variant="captionEmphasis"
                  color={active ? Colors.primary : Colors.textSecondary}
                >
                  {option} days
                </MandiText>
              </Pressable>
            );
          })}
        </View>
      </MandiCard>

      <MandiFormField
        label="What will you buy? (optional)"
        value={purpose}
        onChangeText={edit(setPurpose)}
        placeholder="Daily vegetables, monthly staples…"
        testID="purpose-field"
      />

      {summaryLine != null && (
        <MandiText variant="bodyEmphasis" testID="request-summary">{summaryLine}</MandiText>
      )}

      {problem != null && (
        <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="request-error">
          <Ionicons name="alert-circle" size={IconSize.md} color={Colors.danger} />
          <MandiText variant="bodyEmphasis" color={Colors.danger} style={styles.flex}>{problem}</MandiText>
        </View>
      )}
    </MandiScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.listGap },
  sent: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  problem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.dangerLight },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flex: 1 },
  search: { marginTop: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    minHeight: TouchTarget.min,
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  optionDisabled: { backgroundColor: Colors.surfaceSunken },
  optionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});
