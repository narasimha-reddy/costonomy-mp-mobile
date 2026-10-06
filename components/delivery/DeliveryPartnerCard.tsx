import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { MandiButton, MandiCard, MandiText } from '@/components/common';
import { initials } from '@/lib/delivery/orderTracking';
import { AvatarSize, Colors, Radius, Spacing } from '@/theme';

/** Who is carrying the order. A call button appears only when there is a number and the caller allows it. */
export function DeliveryPartnerCard({
  name, vehicle, phone, showCall, compact = false,
}: {
  name: string;
  vehicle?: string | null;
  phone?: string | null;
  showCall: boolean;
  compact?: boolean;
}) {
  const callable = showCall && !!phone;
  return (
    <MandiCard compact={compact} outlined>
      <View style={styles.row}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MandiText variant="bodyEmphasis" color={Colors.partnerAvatarText}>{initials(name)}</MandiText>
        </View>
        <View style={styles.info}>
          <MandiText variant="bodyEmphasis" numberOfLines={1}>{name}</MandiText>
          {!compact && vehicle ? (
            <MandiText variant="caption" color={Colors.textSecondary} numberOfLines={1}>{vehicle}</MandiText>
          ) : null}
        </View>
        {callable && (
          <MandiButton
            label={`Call ${name}`}
            icon="call-outline"
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={() => { void Linking.openURL(`tel:${phone}`); }}
          />
        )}
      </View>
    </MandiCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: AvatarSize.md,
    height: AvatarSize.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.partnerAvatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
});
