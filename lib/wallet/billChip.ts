import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { WalletBillStatus, WalletEntry } from '@/models/wallet';
import { BillChipLayout, BillChipType, BillStatusColors, WalletLayout, WalletType } from '@/theme';

/**
 * Pure rules for the bill chip on a History row: its words, its colours, and which of three
 * shapes fits the room left on the row's time line. No React and no measuring: the width is
 * estimated, conservatively, so a chip is never cut off or wrapped at any text size.
 */

export type BillChipStatus = WalletBillStatus;
export type ChipVariant = 'full' | 'short' | 'icon';

export interface BillChipCopy {
  /** "Bill pending". */
  full: string;
  /** "Pending", for a tight row. */
  short: string;
  /** What a screen reader says: the full words. */
  a11y: string;
}

/** READING's trailing dots are drawn after the words and are its ellipsis. */
export function billChipCopy(status: BillChipStatus): BillChipCopy {
  switch (status) {
    case 'PENDING': return { full: 'Bill pending', short: 'Pending', a11y: 'Bill pending' };
    case 'READING': return { full: 'Reading bill', short: 'Reading', a11y: 'Reading bill' };
    case 'ADDED': return { full: 'Bill added', short: 'Added', a11y: 'Bill added' };
    case 'REVIEWED': return { full: 'Bill reviewed', short: 'Reviewed', a11y: 'Bill reviewed' };
    case 'UNREADABLE': return { full: 'Check bill', short: 'Check', a11y: 'Check bill' };
  }
}

export type BillStatusColorKey = keyof typeof BillStatusColors;

export interface BillChipTone {
  bg: BillStatusColorKey;
  text: BillStatusColorKey;
  border: BillStatusColorKey | null;
  icon: 'dot' | 'dots' | { name: ComponentProps<typeof Ionicons>['name'] };
}

export function billChipTone(status: BillChipStatus): BillChipTone {
  switch (status) {
    case 'PENDING': return { bg: 'pendingBg', text: 'pendingText', border: 'pendingBorder', icon: 'dot' };
    case 'READING': return { bg: 'readingBg', text: 'readingText', border: null, icon: 'dots' };
    case 'ADDED': return { bg: 'addedBg', text: 'addedText', border: null, icon: { name: 'checkmark' } };
    case 'REVIEWED': return { bg: 'reviewedBg', text: 'reviewedText', border: null, icon: { name: 'checkmark-done' } };
    case 'UNREADABLE': return { bg: 'checkBg', text: 'checkText', border: null, icon: { name: 'alert' } };
  }
}

/** Where a chip tap goes: Add bill while pending, otherwise the bill that is there. */
export function billChipRoute(entry: WalletEntry) {
  return {
    pathname: entry.bill?.status === 'PENDING'
      ? '/restaurant/wallet/transaction/bill' as const
      : '/restaurant/wallet/transaction/invoice' as const,
    params: { id: String(entry.id) },
  };
}

// ── Estimating widths ─────────────────────────────────────────────────

/** The chip label stops growing at this font scale, so the chip stays 22 dp high. */
export const CHIP_TEXT_MAX_SCALE = 1.3;
/** Between the time text and the chip. */
export const TIME_CHIP_GAP = BillChipLayout.timeGap;

const SAFETY = 1.08;

/** Source Sans 3's width of one character, in em. Generous: a wrong guess must be too wide. */
function charEm(ch: string): number {
  if (ch === ' ') return 0.22;
  if ("ilj.,'!|".includes(ch)) return 0.27;
  if ('frt'.includes(ch)) return 0.36;
  if (ch === 'm' || ch === 'w') return 0.8;
  if (ch === 'M' || ch === 'W') return 0.9;
  if (ch === '…') return 0.8;
  if (ch >= '0' && ch <= '9') return 0.52;
  if (ch >= 'A' && ch <= 'Z') return 0.62;
  if (ch >= 'a' && ch <= 'z') return 0.52;
  return 0.55;
}

/** A text's width in dp, estimated and rounded up by a safety margin, so a chip is never too tight. */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  weight: 'regular' | 'semibold',
): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * fontSize * (weight === 'semibold' ? 1.04 : 1) * SAFETY;
}

/** The width the chip takes in a variant, at the user's font scale (the label's growth is capped). */
export function chipWidth(variant: ChipVariant, status: BillChipStatus, fontScale: number): number {
  if (variant === 'icon') return BillChipLayout.height;
  const copy = billChipCopy(status);
  const label = variant === 'full' ? copy.full : copy.short;
  const border = billChipTone(status).border != null ? 2 : 0;
  return 2 * BillChipLayout.padX + BillChipLayout.icon + BillChipLayout.gap
    + estimateTextWidth(label, BillChipType.label.fontSize * Math.min(fontScale, CHIP_TEXT_MAX_SCALE), 'semibold')
    + border;
}

/**
 * The widest shape that fits. `availableWidth` is what is left for the chip after the time at its
 * natural width and the gap; `squeezable` is how much the time may give up by ending in "…".
 * Past 1.3x text the time is never squeezed: a big-text reader gets the icon instead.
 */
export function chipVariant(
  availableWidth: number,
  fontScale: number,
  status: BillChipStatus,
  squeezable = 0,
): ChipVariant {
  if (chipWidth('full', status, fontScale) <= availableWidth) return 'full';
  const short = chipWidth('short', status, fontScale);
  if (short <= availableWidth) return 'short';
  if (fontScale <= CHIP_TEXT_MAX_SCALE && short <= availableWidth + squeezable) return 'short';
  return 'icon';
}

/**
 * Pick the chip's shape from the time line's width and the time it has to hold. The time is never
 * cut for the chip: the visual check at 320 dp showed "2 min…" and "30 Sept…", which hide what the
 * row is for, so a tight row gets the shorter chip or the icon instead.
 */
export function chooseBillChip(args: {
  lineWidth: number;
  timeText: string;
  fontScale: number;
  status: BillChipStatus;
}): ChipVariant {
  const { lineWidth, timeText, fontScale, status } = args;
  const timeW = estimateTextWidth(timeText, WalletType.rowMeta.fontSize * fontScale, 'regular');
  return chipVariant(
    lineWidth - timeW - TIME_CHIP_GAP,
    fontScale,
    status,
  );
}

/**
 * The time line's width before the row has been measured: the window less the row's padding,
 * avatar, gaps and the account text beside it ("Debited from wallet" is the longest it says).
 */
export function initialTimeLineWidth(windowWidth: number, fontScale: number): number {
  const account = estimateTextWidth('Debited from wallet', WalletType.rowAccount.fontSize * fontScale, 'regular')
    + WalletLayout.accountGap + WalletLayout.accountIcon;
  return windowWidth - WalletLayout.rowLeft - WalletLayout.avatar - WalletLayout.textGap
    - WalletLayout.rowRight - account - 8;
}
