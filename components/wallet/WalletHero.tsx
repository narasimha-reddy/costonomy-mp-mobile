import React from 'react';
import { GradientHero } from '@/components/common/GradientHero';
import { limitMeter, splitBalance } from '@/lib/wallet/display';
import type { Wallet } from '@/models/wallet';

/**
 * The wallet's balance, big, with a thin bar for how much of the month's top-up
 * allowance is used.
 *
 * <p>The ₹ is small, the rupees large and the paise smaller, so the figure reads
 * at a glance and the paise do not shout. The bar and its two labels appear only
 * when the server sent limits; on an older API there is simply no meter, never an
 * invented one. The look is the shared `GradientHero`, which Credit uses too.
 */
export function WalletHero({ wallet }: { wallet: Wallet }) {
  const split = splitBalance(wallet.balance);
  const meter = limitMeter(wallet.limits);

  return (
    <GradientHero
      label="Wallet balance"
      split={split}
      amountAccessibilityLabel={split == null ? undefined
        : `Wallet balance ${split.negative ? 'minus ' : ''}${split.rupees} rupees ${split.paise} paise`}
      meter={meter == null ? null : {
        percent: meter.percent,
        leftLabel: `Added this month ${meter.added}`,
        rightLabel: `Monthly limit ${meter.limit}`,
        accessibilityLabel: `Added this month ${meter.added} of ${meter.limit} limit`,
      }}
    />
  );
}
