import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MandiCard, MandiStatusChip, MandiText } from '@/components/common';
import type { StatusTone } from '@/components/common/MandiStatusChip';
import { agreementName, rejectionReason } from '@/lib/credit/overview';
import type { CreditAgreement } from '@/models/credit';
import { formatMoney } from '@/utils/money';
import { Colors, Spacing } from '@/theme';

function describe(a: CreditAgreement): { chip: string; tone: StatusTone; caption: string | null } {
  switch (a.status) {
    case 'ACTIVE':
      return { chip: 'Up to date', tone: 'success', caption: `Available ${formatMoney(a.available)}` };
    case 'REQUESTED':
      return { chip: 'Requested', tone: 'pending', caption: 'Waiting for supplier' };
    case 'APPROVED':
      return { chip: 'Approved', tone: 'info', caption: 'Terms ready: review and accept' };
    case 'REJECTED':
      return { chip: 'Declined', tone: 'danger', caption: rejectionReason(a) };
    case 'SUSPENDED':
      return { chip: 'Suspended', tone: 'danger', caption: a.suspensionReason };
    case 'EXPIRED':
      return { chip: 'Expired', tone: 'neutral', caption: 'This credit line has expired.' };
    default:
      return { chip: 'Closed', tone: 'neutral', caption: null };
  }
}

/** A credit line that owes nothing right now. */
export function CreditLineRow({ agreement, onPress }: { agreement: CreditAgreement; onPress: () => void }) {
  const name = agreementName(agreement);
  const { chip, tone, caption } = describe(agreement);
  return (
    <MandiCard
      testID={`line-row-${agreement.id}`}
      onPress={onPress}
      accessibilityLabel={[name, chip, caption].filter(Boolean).join(', ')}
    >
      <View style={styles.row}>
        <MandiText variant="bodyEmphasis" style={styles.name}>{name}</MandiText>
        <MandiStatusChip label={chip} tone={tone} size="sm" />
      </View>
      {caption ? <MandiText variant="caption" color={Colors.textSecondary}>{caption}</MandiText> : null}
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  name: { flex: 1 },
});
