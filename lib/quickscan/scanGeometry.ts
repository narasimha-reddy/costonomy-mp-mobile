import { WalletLayout } from '@/theme/walletScreen';

export interface ScanGeometry {
  /** The clear window: left/top/size, in dp, relative to the screen. */
  window: { left: number; top: number; size: number };
  /** Top of the Upload / Torch row. */
  chipsTop: number;
  /** Top of the "Or enter a UPI ID" text. */
  linkTop: number;
}

/** The window is 69.7% of the screen's width (251 dp on a 360 dp phone) and never wider than this. */
const MAX_WINDOW = 300;
/** Where the window starts: 18.1% of the screen's height (146 dp of 805), kept proportional on taller phones. */
const WINDOW_TOP_RATIO = 0.181;
/** Distance from the top of the chip row to the top of the link text (measured). */
const CHIPS_TO_LINK = 89;

/**
 * Where everything on the scan screen sits for a screen of this size, so the layout keeps the
 * proportions of the reference on a phone of any height. Never above the header: the window
 * starts at least 111 dp under the status bar.
 */
export function scanGeometry(width: number, height: number, topInset: number): ScanGeometry {
  const size = Math.min(MAX_WINDOW, Math.round(width * 0.697));
  const top = Math.max(Math.round(height * WINDOW_TOP_RATIO), topInset + 111);
  const chipsTop = top + size + WalletLayout.scanChipTop;
  return {
    window: { left: Math.floor((width - size) / 2), top, size },
    chipsTop,
    linkTop: chipsTop + CHIPS_TO_LINK,
  };
}
