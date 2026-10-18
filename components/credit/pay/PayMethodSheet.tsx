import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MandiBottomSheet, MandiButton, MandiText } from '@/components/common';
import {
  DECLINED_TEXT, feeText, methodSheetTitle, unavailableText, walletBalanceText,
} from '@/lib/credit/pay/copy';
import type { CreditPayPhase } from '@/lib/credit/pay/payFlow';
import { radioProps } from '@/lib/a11y';
import type { CreditPayMethod, CreditPayQuote, MethodQuote } from '@/models/creditPay';
import { Colors, Radius, Spacing, TouchTarget } from '@/theme';

const TITLES: Record<CreditPayMethod, { label: string; hint: string | null }> = {
  UPI: { label: 'UPI', hint: 'Pay with any UPI app' },
  CARD: { label: 'Card', hint: 'Debit or credit card' },
  WALLET: { label: 'Wallet', hint: null },
};

/** REST-CREDIT-PAY-02. The quote's options as the server sent them; the person picks one and continues. */
export function PayMethodSheet({
  visible, onClose, quote, phase, message, onContinue, onAddMoney,
}: {
  visible: boolean;
  onClose: () => void;
  quote: CreditPayQuote | null;
  phase: CreditPayPhase;
  /** Why the last try ended without paying (declined, short, error); null otherwise. */
  message: string | null;
  onContinue: (method: CreditPayMethod) => void;
  onAddMoney: () => void;
}) {
  const [chosen, setChosen] = useState<CreditPayMethod | null>(null);
  const firstAvailable = quote?.methods.find((m) => m.available)?.method ?? null;
  const selected = chosen != null && quote?.methods.some((m) => m.method === chosen && m.available) ? chosen : firstAvailable;
  useEffect(() => { if (!visible) setChosen(null); }, [visible]);

  const busy = phase === 'creating' || phase === 'checkout' || phase === 'verifying';
  const current = quote?.methods.find((m) => m.method === selected);
  const fee = current != null && Number(current.feeAmount) > 0 ? current.feeAmount : null;
  const label = phase === 'creating' || phase === 'checkout' ? 'Opening payment…'
    : phase === 'verifying' ? 'Confirming…' : phase === 'declined' ? 'Try again' : 'Continue';

  return (
    <MandiBottomSheet
      visible={visible && quote != null}
      onClose={busy ? () => undefined : onClose}
      title={quote != null ? methodSheetTitle(quote.amount) : undefined}
      closeLabel="Close"
      testID="pay-method-sheet"
    >
      {quote != null && (
        <View style={styles.body}>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {quote.methods.map((m) => (
              <MethodOption
                key={m.method}
                quote={m}
                walletBalance={quote.walletBalance}
                active={m.method === selected}
                disabled={busy}
                onPick={() => setChosen(m.method)}
                onAddMoney={onAddMoney}
              />
            ))}
          </View>

          {fee != null && <MandiText variant="caption" color={Colors.textSecondary}>{feeText(fee)}</MandiText>}

          {message != null && phase !== 'creating' && phase !== 'checkout' && phase !== 'verifying' && (
            <MandiText variant="body" color={Colors.danger} accessibilityLiveRegion="polite" testID="pay-method-message">
              {phase === 'declined' ? DECLINED_TEXT : message}
            </MandiText>
          )}

          <MandiButton
            testID="pay-method-continue"
            label={label}
            loading={busy}
            disabled={selected == null}
            onPress={() => { if (selected != null) onContinue(selected); }}
          />
        </View>
      )}
    </MandiBottomSheet>
  );
}

function MethodOption({
  quote, walletBalance, active, disabled, onPick, onAddMoney,
}: {
  quote: MethodQuote;
  walletBalance: string | null;
  active: boolean;
  disabled: boolean;
  onPick: () => void;
  onAddMoney: () => void;
}) {
  const t = TITLES[quote.method];
  const hint = quote.method === 'WALLET' ? walletBalanceText(walletBalance) : t.hint;
  const reason = quote.available ? null : unavailableText(quote.unavailableReason, quote.shortBy);
  const off = !quote.available;
  return (
    <View>
      <Pressable
        testID={`pay-method-${quote.method}`}
        onPress={onPick}
        disabled={disabled || off}
        accessibilityRole="radio"
        accessibilityLabel={[t.label, hint, reason].filter(Boolean).join(', ')}
        {...radioProps(active, disabled || off)}
        style={[styles.option, active && styles.optionSelected, off && styles.off]}
      >
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={20}
          color={active ? Colors.primary : Colors.textTertiary}
        />
        <View style={styles.text}>
          <MandiText variant="bodyEmphasis">{t.label}</MandiText>
          {hint != null && <MandiText variant="caption" color={Colors.textSecondary}>{hint}</MandiText>}
        </View>
      </Pressable>
      {reason != null && (
        <View style={styles.reason}>
          <MandiText
            variant="caption"
            color={Colors.danger}
            testID={quote.unavailableReason === 'WALLET_SHORT' ? 'pay-method-wallet-short' : undefined}
          >
            {reason}
          </MandiText>
          {quote.unavailableReason === 'WALLET_SHORT' && (
            <MandiButton testID="pay-method-add-money" variant="secondary" size="sm" label="Add money" onPress={onAddMoney} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md, paddingTop: Spacing.sm },
  options: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  off: { opacity: 0.6 },
  text: { flex: 1 },
  reason: { gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingTop: Spacing.xs, alignItems: 'flex-start' },
});
