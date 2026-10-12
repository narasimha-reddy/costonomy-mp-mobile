import React, { useEffect, useRef } from 'react';
import { Animated, Easing, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ArrowGlyph, CopyGlyph, ListGlyph } from '@/components/wallet/detail/DetailIcons';
import {
  creditRepaymentInfo, detailAvatar, detailLabel, detailName, referenceLines, spokenAmount, walletSideLabel,
} from '@/lib/wallet/detail';
import { entryLabel } from '@/lib/wallet/entryCopy';
import { formatRupees } from '@/lib/wallet/history';
import type { WalletTransactionDetail } from '@/models/wallet';
import { DetailColors, DetailLayout, DetailType, WalletColors } from '@/theme';

/**
 * The white card of the Transaction details screen and of the receipt picture: who the
 * money went to or came from, the amount, and the collapsible "Transfer details".
 *
 * <p>On the screen (`variant="screen"`) the section header is a button, copy icons show on
 * the ids that can be copied, and `footer` carries the action row. In the receipt picture
 * there is none of that: the section is always open and nothing in it can be pressed.
 */
export function TransactionCard({
  entry, variant = 'screen', expanded = true, onToggle, onCopy, onViewCredit, footer, invoiceRow,
}: {
  entry: WalletTransactionDetail;
  variant?: 'screen' | 'receipt';
  expanded?: boolean;
  onToggle?: () => void;
  onCopy?: (value: string, what: string) => void;
  /** "View in Credit" on a credit repayment (screen only). */
  onViewCredit?: (agreementId: string) => void;
  footer?: React.ReactNode;
  /** The Invoice row, shown under the transfer details (screen only). */
  invoiceRow?: React.ReactNode;
}) {
  const screen = variant === 'screen';
  const avatar = detailAvatar(entry.direction);
  const name = detailName(entry);
  const amount = formatRupees(entry.amount);
  const refs = referenceLines(entry.references);
  const credit = creditRepaymentInfo(entry);

  const turn = useRef(new Animated.Value(expanded ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(turn, {
      toValue: expanded ? 0 : 1,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [expanded, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const header = (
    <>
      <ListGlyph size={DetailLayout.sectionIcon} color={DetailColors.icon} />
      <Text style={styles.sectionTitle}>Transfer details</Text>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Ionicons name="chevron-up" size={DetailLayout.chevron} color={DetailColors.icon} />
      </Animated.View>
    </>
  );

  return (
    <View style={[styles.card, !screen && styles.cardReceipt]} testID={screen ? 'detail-card' : 'receipt-card'}>
      <Text style={styles.title}>{detailLabel(entry)}</Text>

      <View style={styles.payeeRow}>
        <View
          style={[styles.avatar, avatar === 'in' && styles.avatarIn]}
          testID={avatar === 'in' ? 'detail-avatar-in' : 'detail-avatar-out'}
        >
          <ArrowGlyph
            size={DetailLayout.avatarArrow}
            direction={avatar}
            color={avatar === 'in' ? WalletColors.white : WalletColors.orange}
          />
        </View>
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {credit != null ? (
            <Text style={styles.sub} numberOfLines={1}>{entryLabel(entry)}</Text>
          ) : entry.counterpartyDetail ? (
            <Text style={styles.sub} numberOfLines={1}>{entry.counterpartyDetail}</Text>
          ) : null}
        </View>
        <Text style={styles.amountBold} accessibilityLabel={spokenAmount(entry.amount)}>{amount}</Text>
      </View>

      <View style={styles.divider} />

      {screen ? (
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            onToggle?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Transfer details"
          accessibilityState={{ expanded }}
          style={styles.sectionHeader}
          testID="transfer-details-toggle"
        >
          {header}
        </Pressable>
      ) : (
        <View style={styles.sectionHeader}>{header}</View>
      )}

      {expanded && (
        <View testID="transfer-details-body">
          <Text style={styles.label}>Costonomy transaction ID</Text>
          <View style={[styles.valueRow, screen && credit != null && styles.valueRowContained]} testID="detail-id-row">
            <Text style={styles.value} selectable>{entry.transactionId}</Text>
            {screen && (
              <CopyButton
                label="Copy transaction ID"
                contained={credit != null}
                onPress={() => onCopy?.(entry.transactionId, 'Transaction ID')}
              />
            )}
          </View>

          <Text style={[styles.label, styles.labelNext]}>{walletSideLabel(entry.direction)}</Text>
          <View style={styles.walletRow}>
            <Ionicons name="wallet-outline" size={DetailLayout.walletIcon} color={WalletColors.orange} />
            <Text style={styles.walletName}>Costonomy wallet</Text>
            <Text style={styles.amount} accessibilityLabel={spokenAmount(entry.amount)}>{amount}</Text>
          </View>

          {refs.map((r) => (
            <View
              key={r.key}
              style={[styles.refRow, screen && credit != null && styles.refRowContained]}
              testID="detail-ref-row"
            >
              <Text style={styles.refText} selectable>{r.text}</Text>
              {screen && r.copyable && (
                <CopyButton
                  label="Copy reference"
                  contained={credit != null}
                  onPress={() => onCopy?.(r.value, 'Reference')}
                />
              )}
            </View>
          ))}
        </View>
      )}

      {credit != null && (
        <View testID="credit-repayment-block">
          <Text style={[styles.label, screen && expanded && refs.some((r) => r.copyable) ? styles.labelAfterCopy : styles.labelNext]}>Invoices settled</Text>
          {credit.invoices.map((number) => (
            <Text key={number} style={[styles.value, styles.invoiceLine]} selectable>{number}</Text>
          ))}
          {screen && credit.agreementId != null && (
            <Pressable
              onPress={() => onViewCredit?.(credit.agreementId as string)}
              accessibilityRole="link"
              accessibilityLabel="View in Credit"
              style={styles.walletRow}
              testID="view-in-credit"
            >
              <Ionicons name="card-outline" size={DetailLayout.walletIcon} color={WalletColors.orange} />
              <Text style={styles.walletName}>View in Credit</Text>
              <Ionicons name="chevron-forward" size={DetailLayout.chevron} color={DetailColors.icon} />
            </Pressable>
          )}
        </View>
      )}

      {/* A credit repayment never takes a bill. */}
      {screen && credit == null ? invoiceRow : null}

      {footer}
    </View>
  );
}

/**
 * `contained` keeps the 48 dp tap area inside its own row. The default sits a 48 dp box
 * on a 14 dp row with negative margins, which is invisible until something is directly
 * above or below it: on a credit repayment it then covered the amount and the "Invoices
 * settled" block. The credit layout gives the row the full 48 dp instead.
 */
function CopyButton({ label, onPress, contained = false }: { label: string; onPress: () => void; contained?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.copy, contained && styles.copyContained]}
      android_ripple={{ color: WalletColors.orangePale, radius: 24, borderless: true }}
    >
      <CopyGlyph width={DetailLayout.copyWidth} height={DetailLayout.copyHeight} color={WalletColors.orange} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: DetailLayout.cardMargin,
    backgroundColor: DetailColors.card,
    borderRadius: DetailLayout.cardRadius,
    paddingTop: DetailLayout.cardPadTop,
    paddingBottom: DetailLayout.cardPadBottom,
    shadowColor: DetailColors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardReceipt: { marginTop: DetailLayout.receiptCardTop, elevation: 0, shadowOpacity: 0 },
  title: { ...DetailType.cardTitle, marginLeft: DetailLayout.cardInset, color: DetailColors.title },
  payeeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: DetailLayout.titleToAvatar,
    marginLeft: DetailLayout.avatarLeft,
    marginRight: DetailLayout.cardInset,
  },
  avatar: {
    width: DetailLayout.avatar,
    height: DetailLayout.avatar,
    borderRadius: DetailLayout.avatarRadius,
    backgroundColor: WalletColors.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIn: { backgroundColor: WalletColors.orange },
  names: { flex: 1, marginLeft: DetailLayout.textGap, marginRight: 8 },
  name: { ...DetailType.name, marginTop: DetailLayout.nameTop, color: DetailColors.name },
  sub: { ...DetailType.sub, marginTop: DetailLayout.subTop, color: DetailColors.secondary },
  amountBold: { ...DetailType.amountBold, marginTop: DetailLayout.nameTop, color: DetailColors.title },
  divider: {
    height: DetailLayout.divider,
    marginHorizontal: DetailLayout.dividerInset,
    marginTop: DetailLayout.dividerTop,
    backgroundColor: DetailColors.divider,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DetailLayout.sectionHeight,
    marginLeft: DetailLayout.sectionLeft,
    marginRight: DetailLayout.sectionRight,
    marginTop: DetailLayout.sectionTop,
    marginBottom: DetailLayout.sectionBottom,
  },
  sectionTitle: {
    ...DetailType.section,
    flex: 1,
    marginLeft: DetailLayout.sectionTextGap,
    color: DetailColors.section,
  },
  label: {
    ...DetailType.label,
    marginLeft: DetailLayout.cardInset,
    marginTop: DetailLayout.labelTop,
    color: DetailColors.secondary,
  },
  labelNext: { marginTop: DetailLayout.labelNext },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: DetailLayout.cardInset,
    marginRight: DetailLayout.copyRowRight,
    marginTop: DetailLayout.valueTop,
    minHeight: 14,
  },
  value: { ...DetailType.value, flex: 1, color: DetailColors.value },
  copy: {
    width: DetailLayout.copyTap,
    height: DetailLayout.copyTap,
    marginVertical: -17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: DetailLayout.walletLeft,
    marginRight: DetailLayout.cardInset,
    marginTop: DetailLayout.walletTop,
    height: DetailLayout.walletRow,
  },
  walletName: {
    ...DetailType.name,
    flex: 1,
    marginLeft: DetailLayout.walletNameGap,
    color: DetailColors.wallet,
  },
  amount: { ...DetailType.name, color: DetailColors.text },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: DetailLayout.refLeft,
    marginRight: DetailLayout.copyRowRight,
    marginTop: DetailLayout.refTop,
    minHeight: 14,
  },
  // The 48 dp copy button is the row: no negative margins, so nothing above or below it is covered.
  valueRowContained: { marginTop: 0, minHeight: DetailLayout.copyTap },
  refRowContained: { marginTop: 0, minHeight: DetailLayout.copyTap },
  copyContained: { marginVertical: 0 },
  labelAfterCopy: { marginTop: 0 },
  invoiceLine: { marginLeft: DetailLayout.cardInset, marginTop: DetailLayout.valueTop, color: DetailColors.value },
  refText: { ...DetailType.value, flex: 1, color: DetailColors.secondary },
});
