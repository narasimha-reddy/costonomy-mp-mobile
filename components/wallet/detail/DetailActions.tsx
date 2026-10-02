import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ArrowGlyph } from '@/components/wallet/detail/DetailIcons';
import { DetailColors, DetailLayout, DetailType, WalletColors } from '@/theme';

/** The four round actions under the card: Pay again (only when offered), Wallet, View History, Share Receipt. */
export function DetailActions({
  canPayAgain, sharing, onPayAgain, onWallet, onHistory, onShare,
}: {
  canPayAgain: boolean;
  sharing: boolean;
  onPayAgain: () => void;
  onWallet: () => void;
  onHistory: () => void;
  onShare: () => void;
}) {
  return (
    <>
      <View style={styles.divider} />
      <View style={styles.row}>
        {canPayAgain && (
          <Action label="Pay again" onPress={onPayAgain}>
            <ArrowGlyph size={13} color={WalletColors.orange} stroke={2.2} />
          </Action>
        )}
        <Action label="Wallet" onPress={onWallet}>
          <Ionicons name="wallet-outline" size={17} color={WalletColors.orange} />
        </Action>
        <Action label="View History" onPress={onHistory}>
          <Ionicons name="time-outline" size={17.5} color={WalletColors.orange} />
        </Action>
        <Action label="Share Receipt" onPress={onShare} disabled={sharing}>
          <Ionicons name="share-social-outline" size={17.5} color={WalletColors.orange} />
        </Action>
      </View>
    </>
  );
}

function Action({
  label, onPress, disabled = false, children,
}: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.action, disabled && styles.disabled]}
      android_ripple={{ color: DetailColors.actionRipple, borderless: true, radius: 28 }}
    >
      <View style={styles.circle}>{children}</View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: DetailLayout.divider,
    marginHorizontal: DetailLayout.dividerInset,
    marginTop: DetailLayout.actionsDividerTop,
    backgroundColor: DetailColors.divider,
  },
  row: {
    flexDirection: 'row',
    marginTop: DetailLayout.actionsTop,
    marginLeft: DetailLayout.avatarLeft,
    marginRight: DetailLayout.cardInset,
  },
  action: { flex: 1, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  circle: {
    width: DetailLayout.circle,
    height: DetailLayout.circle,
    borderRadius: DetailLayout.circle / 2,
    backgroundColor: WalletColors.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...DetailType.action,
    marginTop: DetailLayout.actionLabelTop,
    color: DetailColors.section,
  },
});
