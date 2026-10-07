import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/contexts/SessionProvider';
import { useStore } from '@/contexts/StoreProvider';
import { approveCredit, fetchAgreement, rejectCredit, type ApproveCreditInput } from '@/services/credit';
import { fetchCreditPolicy, fetchRequestContext } from '@/services/creditRequests';
import { agreementKey, receivablesRootKey } from '@/lib/queryKeys';
import { ApiError } from '@/lib/api/errors';
import {
  contextLines, historyLines, offerWording, usualTerms, usualTermsPreview, waitingWording,
} from '@/lib/credit/requestContext';
import { approveInputFrom, type TermsDraft } from '@/lib/credit/supplierLine';
import { RequestConfirmSheet } from '@/components/credit/RequestConfirmSheet';
import { RequestDeclineSheet } from '@/components/credit/RequestDeclineSheet';
import { TermsEditorSheet } from '@/components/credit/TermsEditorSheet';
import {
  MandiButton, MandiCard, MandiEmptyState, MandiErrorState, MandiHeader, MandiOfflineBanner, MandiScreen,
  MandiSkeletonList, MandiText, useToast,
} from '@/components/common';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { serverNow } from '@/lib/server-clock';
import { track } from '@/analytics';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

const SCREEN = 'SUP-CREDIT-REQUEST';
type Sheet = null | 'asked' | 'usual' | 'terms' | 'decline';

/**
 * SUP-CREDIT-REQUEST: answer one credit request with what this store knows about the restaurant.
 *
 * <p>The context card is the server's: orders with THIS store only, in its own words and figures;
 * the app works nothing out. Approving as asked starts the credit at once; approving anything else
 * (the store's usual terms, or terms typed here) is an offer the restaurant has to accept, and the
 * sheet says so before anything is sent. Hiding a button is a courtesy: the server checks again.
 */
export default function RequestReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const agreementId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { accessToken } = useSession();
  const { storeId, store } = useStore();
  const { offline } = useNetworkStatus();
  const { canForStore } = usePermissions();
  const canModify = store != null && canForStore('CREDIT_MODIFY', store);
  const canViewContext = store != null && canForStore('CREDIT_REQUEST_VIEW', store);
  const [sheet, setSheet] = useState<Sheet>(null);
  const busy = useRef(false);
  const enabled = Number.isFinite(agreementId) && accessToken != null && storeId != null;

  const agreement = useQuery({
    queryKey: agreementKey(agreementId),
    queryFn: () => fetchAgreement(accessToken as string, agreementId),
    enabled,
  });
  const data = agreement.data;
  const waiting = data?.status === 'REQUESTED';

  const context = useQuery({
    queryKey: [...agreementKey(agreementId), 'request-context'],
    queryFn: () => fetchRequestContext(accessToken as string, storeId as number, agreementId),
    enabled: enabled && canViewContext && data != null,
  });
  const policy = useQuery({
    queryKey: ['store', storeId, 'credit-policy'],
    queryFn: () => fetchCreditPolicy(accessToken as string, storeId as number),
    enabled: enabled && canModify && waiting,
  });
  const usual = usualTerms(policy.data);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: agreementKey(agreementId) });
    void queryClient.invalidateQueries({ queryKey: ['store', storeId, 'credit-agreements'] });
    void queryClient.invalidateQueries({ queryKey: receivablesRootKey(storeId) });
  }
  function done(message: string) {
    refresh();
    setSheet(null);
    toast.show(message, 'success');
    if (router.canGoBack()) router.back();
    else router.replace('/supplier/credit' as never);
  }
  /** A refused transition means the screen was out of date: show what is true now. */
  function onFailure(caught: unknown) {
    if (caught instanceof ApiError && (caught.status === 409 || caught.status === 404)) refresh();
  }
  /** One write at a time: a double tap in the same instant reaches the server once. */
  function once<T>(run: () => Promise<T>): Promise<T | undefined> {
    if (busy.current) return Promise.resolve(undefined);
    busy.current = true;
    return run().finally(() => { busy.current = false; });
  }
  const messageOf = (caught: unknown, fallback: string) =>
    caught instanceof ApiError && caught.message !== '' ? caught.message : fallback;

  const approve = useMutation({
    // `{}` approves what was asked; any terms make it an offer the restaurant must accept.
    mutationFn: (input: ApproveCreditInput) => approveCredit(accessToken as string, agreementId, input),
    onSuccess: (_r, input) => {
      const modified = Object.keys(input).some((k) => k !== 'note');
      track('credit_approved', { screen: SCREEN, entityId: agreementId }, { modified });
      done(modified ? 'Sent with your terms. The restaurant has to accept.' : 'Credit approved');
    },
    onError: onFailure,
  });
  const decline = useMutation({
    mutationFn: (reason: string) => rejectCredit(accessToken as string, agreementId, reason),
    onSuccess: () => {
      track('credit_rejected', { screen: SCREEN, entityId: agreementId });
      done('Request declined. The restaurant is told.');
    },
    onError: onFailure,
  });

  function open(next: Exclude<Sheet, null>) {
    approve.reset(); decline.reset();
    setSheet(next);
  }
  const send = (input: ApproveCreditInput) => { void once(() => approve.mutateAsync(input).catch(() => undefined)); };

  const notFound = agreement.error instanceof ApiError && agreement.error.status === 404;
  const request = data?.latestRequest ?? null;
  const approveError = approve.error == null ? null : messageOf(approve.error, 'Could not approve this request.');
  const heading = data?.restaurantName ?? data?.outletName ?? 'Credit request';
  const refetchAll = () => { void agreement.refetch(); if (canViewContext) void context.refetch(); };

  return (
    <MandiScreen
      header={
        <MandiHeader
          title={heading}
          subtitle={data == null ? undefined : [data.outletName, data.outletLocality].filter(Boolean).join(' · ') || undefined}
          back
          onBack={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/supplier/credit' as never);
          }}
        />
      }
      onRefresh={refetchAll}
      refreshing={agreement.isRefetching}
    >
      <MandiOfflineBanner visible={offline} />
      {agreement.isPending ? (
        <MandiSkeletonList count={3} />
      ) : notFound ? (
        <MandiEmptyState
          icon="mail-open-outline"
          title="This request is no longer available"
          description="It may have been answered, or it belongs to another store."
        />
      ) : agreement.error || data == null ? (
        <MandiErrorState message="Couldn't load this request." onRetry={() => agreement.refetch()} />
      ) : (
        <>
          <MandiCard testID="request-asked">
            <MandiText variant="caption" color={Colors.textSecondary}>They are asking for</MandiText>
            <MandiText variant="display" numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(request?.requestedLimit)}
            </MandiText>
            <MandiText variant="caption" color={Colors.textSecondary}>
              {`payable in ${request?.requestedPeriodDays ?? '—'} days`}
            </MandiText>
            {request?.purpose != null && (
              <MandiText variant="body" color={Colors.textSecondary}>{request.purpose}</MandiText>
            )}
            {request?.note != null && (
              <MandiText variant="caption" color={Colors.textTertiary}>&ldquo;{request.note}&rdquo;</MandiText>
            )}
            {waiting && waitingWording(request?.createdAt, new Date(serverNow())) != null && (
              <MandiText variant="caption" color={Colors.textTertiary} testID="request-waiting">
                {waitingWording(request?.createdAt, new Date(serverNow()))}
              </MandiText>
            )}
          </MandiCard>

          {canViewContext && (
            <ContextCard
              loading={context.isPending}
              error={context.error}
              data={context.data}
              onRetry={() => { void context.refetch(); }}
            />
          )}

          {!waiting && (
            <MandiCard testID="request-answered">
              <MandiText variant="bodyEmphasis">
                {offerWording(data) ?? 'This request has already been answered.'}
              </MandiText>
            </MandiCard>
          )}

          {waiting && canModify && (
            <View style={styles.actions} testID="request-actions">
              <MandiButton
                testID="action-approve-asked"
                label="Approve as asked"
                disabled={offline}
                onPress={() => open('asked')}
              />
              {usual != null && (
                <MandiButton
                  testID="action-approve-usual"
                  label="Approve at my usual terms"
                  variant="neutral"
                  disabled={offline}
                  onPress={() => open('usual')}
                />
              )}
              <MandiButton
                testID="action-change-terms"
                label="Change terms"
                variant="neutral"
                disabled={offline}
                onPress={() => open('terms')}
              />
              <MandiButton
                testID="action-decline"
                label="Decline"
                variant="tertiary"
                disabled={offline}
                onPress={() => open('decline')}
              />
            </View>
          )}
        </>
      )}

      {data != null && waiting && canModify && (
        <>
          <RequestConfirmSheet
            visible={sheet === 'asked'}
            onClose={() => setSheet(null)}
            title="Approve as asked"
            lines={[
              `Limit ${formatMoney(request?.requestedLimit, true)}`,
              `Pay within ${request?.requestedPeriodDays ?? '—'} days`,
            ]}
            consequence="Credit starts at once on exactly what they asked for."
            confirmLabel="Approve"
            pending={approve.isPending}
            error={approveError}
            offline={offline}
            onConfirm={() => send({})}
          />
          {usual != null && (
            <RequestConfirmSheet
              visible={sheet === 'usual'}
              onClose={() => setSheet(null)}
              title="Approve at your usual terms"
              lines={usualTermsPreview(usual)}
              consequence="Your restaurant will be asked to accept these terms. Nothing can be drawn until they do."
              confirmLabel="Send These Terms"
              pending={approve.isPending}
              error={approveError}
              offline={offline}
              onConfirm={() => send(usual)}
              testID="confirm-sheet"
            />
          )}
          <TermsEditorSheet
            visible={sheet === 'terms'}
            onClose={() => setSheet(null)}
            agreement={data}
            mode="approve"
            pending={approve.isPending}
            error={approveError}
            offline={offline}
            onSubmit={(draft: TermsDraft) => send(approveInputFrom(draft))}
          />
          <RequestDeclineSheet
            visible={sheet === 'decline'}
            onClose={() => setSheet(null)}
            pending={decline.isPending}
            error={decline.error == null ? null : messageOf(decline.error, 'Could not decline this request.')}
            offline={offline}
            onSubmit={(reason) => { void once(() => decline.mutateAsync(reason).catch(() => undefined)); }}
          />
        </>
      )}
    </MandiScreen>
  );
}

/** What this store knows about them, in words. A 404 is a quiet line, not an error page. */
function ContextCard({ loading, error, data, onRetry }: {
  loading: boolean;
  error: unknown;
  data: Parameters<typeof contextLines>[0] | undefined;
  onRetry: () => void;
}) {
  if (loading) return <MandiSkeletonList count={1} />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <MandiText variant="caption" color={Colors.textSecondary} testID="context-unavailable">
        Their history with you is not available.
      </MandiText>
    );
  }
  if (error != null || data == null) {
    return (
      <MandiCard testID="context-error">
        <MandiText variant="caption" color={Colors.textSecondary}>{"Couldn't load their history with you."}</MandiText>
        <MandiButton testID="context-retry" label="Retry" variant="neutral" size="sm" onPress={onRetry} />
      </MandiCard>
    );
  }
  const lines = contextLines(data);
  const history = historyLines(data.history);
  const parts = [lines.orders, lines.dates, lines.cancelled, lines.overdue, lines.past].filter((x): x is string => x != null);
  return (
    <MandiCard testID="request-context">
      <MandiText variant="bodyEmphasis">Their history with you</MandiText>
      <View accessible accessibilityLabel={parts.join(' ')} style={styles.lines}>
        {parts.map((line) => (
          <MandiText key={line} variant="body">{line}</MandiText>
        ))}
      </View>
      {history.length > 0 && (
        <View style={styles.lines}>
          {history.map((h, i) => (
            <MandiText key={`${h.when}-${i}`} variant="caption" color={Colors.textSecondary} testID={`history-${i}`}>
              {`${h.label} · ${h.when}${h.note != null ? ` · ${h.note}` : ''}`}
            </MandiText>
          ))}
        </View>
      )}
      <MandiText variant="caption" color={Colors.textTertiary}>You only see your own history with this restaurant</MandiText>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.sm },
  lines: { gap: Spacing.xs },
});
