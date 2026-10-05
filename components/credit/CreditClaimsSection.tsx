import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MandiButton,
  MandiCard,
  MandiConfirm,
  MandiSectionHeader,
  MandiStatusChip,
  MandiText,
  type StatusTone,
} from '@/components/common';
import { claimMethodLabel } from '@/lib/credit/claims';
import type { ClaimResponse, ClaimStatus } from '@/models/credit';
import { formatDay } from '@/utils/dateRange';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

const TONE: Record<ClaimStatus, StatusTone> = {
  SUBMITTED: 'warning',
  CONFIRMED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  SUPERSEDED: 'neutral',
};

function statusText(claim: ClaimResponse, supplierName: string): string {
  switch (claim.status) {
    case 'SUBMITTED': return `Waiting for ${supplierName}`;
    case 'CONFIRMED': return 'Confirmed';
    case 'REJECTED': return 'Not accepted';
    case 'SUPERSEDED': return 'Not needed: invoice already settled';
    default: return 'Withdrawn';
  }
}

/**
 * The restaurant's own "I paid" reports on one invoice, and what the supplier
 * did with each. Every amount is the server's. Withdrawing asks first, and the
 * list is refreshed by the caller once the server has answered.
 */
export function CreditClaimsSection({
  claims,
  supplierName,
  busy,
  offline,
  onWithdraw,
  onReportAgain,
}: {
  claims: ClaimResponse[];
  supplierName: string;
  busy: boolean;
  offline: boolean;
  onWithdraw: (claim: ClaimResponse) => Promise<boolean>;
  onReportAgain: (claim: ClaimResponse) => void;
}) {
  const [confirming, setConfirming] = useState<ClaimResponse | null>(null);
  if (claims.length === 0) return null;

  async function confirm() {
    const claim = confirming;
    if (claim == null) return;
    await onWithdraw(claim);
    setConfirming(null);
  }

  return (
    <View style={styles.section} testID="claims-section">
      <MandiSectionHeader title="Your reports" />
      {claims.map((claim) => {
        const detail = [
          claimMethodLabel(claim.method),
          claim.reference != null && claim.reference !== '' ? `ref ${claim.reference}` : null,
          `paid ${formatDay(claim.paidOn) ?? claim.paidOn}`,
        ].filter(Boolean).join(' · ');
        const confirmedDiffers = claim.status === 'CONFIRMED'
          && claim.confirmedAmount != null
          && Number(claim.confirmedAmount) !== Number(claim.amount);
        return (
          <View key={claim.id} testID={`claim-${claim.id}`}>
            <MandiCard compact outlined>
              <View style={styles.row}>
                <MandiText variant="bodyEmphasis" style={styles.flex}>{formatMoney(claim.amount)}</MandiText>
                <MandiStatusChip
                  label={statusText(claim, supplierName)}
                  tone={TONE[claim.status] ?? 'neutral'}
                  size="sm"
                  testID={`claim-status-${claim.id}`}
                />
              </View>
              <MandiText variant="caption" color={Colors.textSecondary}>{detail}</MandiText>
              {confirmedDiffers && (
                <MandiText variant="caption" color={Colors.textSecondary} testID={`claim-confirmed-${claim.id}`}>
                  {`${supplierName} confirmed ${formatMoney(claim.confirmedAmount as string)}`}
                </MandiText>
              )}
              {claim.status === 'REJECTED' && (
                <MandiText variant="body" testID={`claim-decision-${claim.id}`}>
                  {claim.decisionNote != null && claim.decisionNote !== ''
                    ? `Supplier said: ${claim.decisionNote}`
                    : 'Your supplier did not accept this.'}
                </MandiText>
              )}
              {claim.status === 'SUBMITTED' && (
                <MandiButton
                  testID={`claim-withdraw-${claim.id}`}
                  label="Withdraw"
                  variant="tertiary"
                  size="sm"
                  disabled={busy || offline}
                  onPress={() => setConfirming(claim)}
                />
              )}
              {claim.status === 'REJECTED' && (
                <MandiButton
                  testID={`claim-again-${claim.id}`}
                  label="Report again"
                  variant="secondary"
                  size="sm"
                  disabled={offline}
                  onPress={() => onReportAgain(claim)}
                />
              )}
            </MandiCard>
          </View>
        );
      })}

      <MandiConfirm
        visible={confirming != null}
        title="Withdraw this report?"
        message={confirming != null
          ? `${supplierName} will no longer see your ${formatMoney(confirming.amount)} report. You can report it again later.`
          : undefined}
        confirmLabel="Withdraw report"
        cancelLabel="Keep it"
        destructive
        confirmDisabled={busy}
        onConfirm={() => { void confirm(); }}
        onCancel={() => setConfirming(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.listGap },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  flex: { flex: 1 },
});
