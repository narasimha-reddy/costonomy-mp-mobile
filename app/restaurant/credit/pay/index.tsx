import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOutlet } from '@/contexts/OutletProvider';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useCreditPay, usePayableInvoices } from '@/hooks/useCreditPay';
import { PayInvoicePicker } from '@/components/credit/pay/PayInvoicePicker';
import { PayMethodSheet } from '@/components/credit/pay/PayMethodSheet';
import { PaySelectionBar } from '@/components/credit/pay/PaySelectionBar';
import {
  MandiEmptyState, MandiErrorState, MandiHeader, MandiOfflineBanner, MandiScreen, MandiSkeletonList, useToast,
} from '@/components/common';
import { ApiError } from '@/lib/api/errors';
import { CHANGED_TOAST, FLAG_OFF_TEXT, PAY_DUES, walletShortText } from '@/lib/credit/pay/copy';
import { payErrorMessage, selectionChangedIds } from '@/lib/credit/pay/errors';
import {
  barText, drop, EMPTY, itemsOf, parseScope, preselect, prune, scopeTo, toggle, toggleSupplier, waitingOf,
  type Selection,
} from '@/lib/credit/pay/selection';
import type { CreditPayMethod, CreditPayQuote, PayItem } from '@/models/creditPay';

/**
 * REST-CREDIT-PAY-01. Pick the invoices to pay, then choose how.
 *
 * <p>Whole invoices only, in the order and with the amounts the server sent. This screen
 * never adds a figure that is sent: the ids and the outstanding the server showed go out
 * unchanged, and the server answers with every total and fee.
 */
export default function CreditPayScreen() {
  const router = useRouter();
  const toast = useToast();
  const { outlet } = useOutlet();
  const { offline } = useNetworkStatus();
  const params = useLocalSearchParams<{ agreementId?: string; scopeAgreementId?: string; invoiceIds?: string }>();
  const query = usePayableInvoices();
  const pay = useCreditPay();
  // `scopeAgreementId` limits the whole screen to one supplier (opened from that supplier's page).
  // A bad value shows nothing, never everyone. Without it, every supplier is listed.
  const scope = parseScope(params.scopeAgreementId);
  const scopedId = scope.kind === 'supplier' ? scope.agreementId : null;
  const data = useMemo(() => {
    if (query.data == null) return undefined;
    if (scope.kind === 'all') return query.data;
    return scopeTo(query.data, scope.kind === 'supplier' ? scope.agreementId : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, scope.kind, scopedId]);

  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [quote, setQuote] = useState<CreditPayQuote | null>(null);
  const [quoted, setQuoted] = useState<PayItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<string | null>(null);
  const seeded = useRef(false);

  // First data: preselect what the route asked for. Every later refetch only prunes.
  useEffect(() => {
    if (data == null) return;
    if (!seeded.current) {
      seeded.current = true;
      const invoiceIds = params.invoiceIds?.split(',').map(Number).filter((n) => Number.isFinite(n));
      // Scoped without named invoices: the whole supplier. Otherwise the older `agreementId` preselect.
      const agreementId = scopedId != null && invoiceIds == null ? scopedId
        : params.agreementId != null ? Number(params.agreementId) : undefined;
      setSelection(preselect(data, { agreementId, invoiceIds }));
    } else {
      setSelection((current) => prune(current, data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const bar = data != null ? barText(selection, data) : { count: 0, total: null };

  async function openMethods() {
    if (data == null || quoting || offline) return;
    const items = itemsOf(selection, data);
    setQuoting(true);
    try {
      setQuote(await pay.quote(items));
      setQuoted(items);
      setSheetMessage(null);
      pay.reset();
      setSheetOpen(true);
    } catch (caught) {
      const changed = selectionChangedIds(caught);
      if (changed != null) {
        setSelection((current) => drop(current, changed));
        toast.show(CHANGED_TOAST, 'info');
      } else toast.show(payErrorMessage(caught), 'error');
      void query.refetch();
    } finally {
      setQuoting(false);
    }
  }

  async function onContinue(method: CreditPayMethod) {
    setSheetMessage(null);
    const outcome = await pay.pay(quoted, method);
    if (outcome == null) return;
    switch (outcome.phase) {
      case 'paid':
      case 'refunded':
      case 'pending':
        setSheetOpen(false);
        if (outcome.attempt != null) router.replace(`/restaurant/credit/pay/${outcome.attempt.attemptId}`);
        break;
      case 'changed':
        setSheetOpen(false);
        if (outcome.changedInvoiceIds != null) setSelection((current) => drop(current, outcome.changedInvoiceIds ?? []));
        toast.show(CHANGED_TOAST, 'info');
        void query.refetch();
        break;
      case 'short':
        // The wallet could not cover it after all: re-read the figures so the sheet shows the gap.
        setSheetMessage(walletShortText(outcome.shortBy ?? null));
        try { setQuote(await pay.quote(quoted)); } catch { /* keep the old figures */ }
        break;
      case 'cancelled':
        break;
      default:
        setSheetMessage(outcome.message);
    }
  }

  const scopedSupplier = scopedId != null ? data?.suppliers[0] : undefined;
  const forbidden = query.error instanceof ApiError && query.error.code === 'FORBIDDEN';

  return (
    <MandiScreen
      header={<MandiHeader title={PAY_DUES} subtitle={scopedSupplier?.supplierName ?? outlet?.name} back />}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      footer={data != null && data.suppliers.length > 0 ? (
        <PaySelectionBar
          count={bar.count}
          total={bar.total}
          maxInvoices={data.maxInvoices}
          waiting={waitingOf(selection, data)}
          offline={offline}
          busy={quoting}
          onPay={() => { void openMethods(); }}
        />
      ) : undefined}
    >
      <MandiOfflineBanner visible={offline} />
      {query.isPending ? (
        <MandiSkeletonList count={3} />
      ) : query.error ? (
        <MandiErrorState
          message={forbidden ? FLAG_OFF_TEXT : "Couldn't load your invoices."}
          onRetry={forbidden ? undefined : () => query.refetch()}
        />
      ) : data == null || data.suppliers.length === 0 ? (
        <MandiEmptyState
          icon="checkmark-circle-outline"
          title="Nothing to pay"
          description={scope.kind === 'all' ? 'You have no open credit invoices.' : 'You have no open credit invoices with this supplier.'}
        />
      ) : (
        <PayInvoicePicker
          data={data}
          selection={selection}
          onToggleInvoice={(id) => setSelection((s) => toggle(s, id))}
          onToggleSupplier={(agreementId) => {
            const supplier = data.suppliers.find((s) => s.agreementId === agreementId);
            if (supplier != null) setSelection((s) => toggleSupplier(s, supplier));
          }}
        />
      )}

      <PayMethodSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        quote={quote}
        phase={pay.state.phase}
        message={sheetMessage ?? pay.state.message}
        onContinue={(m) => { void onContinue(m); }}
        onAddMoney={() => { setSheetOpen(false); router.push('/restaurant/wallet/add-money'); }}
      />
    </MandiScreen>
  );
}
