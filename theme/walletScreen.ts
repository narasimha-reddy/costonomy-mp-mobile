/**
 * Tokens for the wallet's "clone" screens: History, the QuickScan camera screen and
 * (next) the transaction detail screen.
 *
 * <p>Every number here was measured from a reference render (see the PR notes) at
 * 1 dp = 620/360 px on a 360 dp phone, so the sizes are the measured sizes scaled
 * by SANS_SCALE and set in the app's Source Sans 3 (FontFamily). Keep the values
 * in this file; a screen that needs one writes `WalletScreen.x`, never a literal.
 */

import { FontFamily } from './typography';

export const WalletFont = {
  regular: FontFamily.regular,
  medium: FontFamily.medium,
  semibold: FontFamily.semibold,
  bold: FontFamily.bold,
} as const;

/**
 * The reference render's typeface has a cap height of 0.73 em; the app's Source Sans 3 has a cap
 * height of about 0.66 em, so every size below is the measured size times this ratio to keep
 * the same visual size. Line heights, tracking-free layout and dp structure are unchanged.
 */
export const SANS_SCALE = 1.1;

export const WalletColors = {
  white: '#FFFFFF',
  ink: '#000000',
  background: '#FFFFFF',
  bandBackground: '#FAFAFA',
  bandHairline: '#ECECEC',
  divider: '#EBEBEB',
  pillBorder: '#E9E9E9',
  avatarCircle: '#F6F6F6',
  rowPressed: '#F6F6F6',
  label: '#333333',
  bandLabel: '#474747',
  meta: '#8F8F8F',
  account: '#8A8A8A',
  placeholder: '#919191',
  chevron: '#9B9B9B',
  credit: '#0A782C',
  /** Brand orange (same value as `Colors.primary`) and its tint. */
  orange: '#FF6000',
  orangeDark: '#CC4D00',
  orangeTint: '#FFF1E6',
  orangePale: '#FFE8D6',
  searchSeparator: '#F0D9C6',
  /** Scan screen */
  scanDim: 'rgba(0, 0, 0, 0.41)',
  scanChip: 'rgba(255, 255, 255, 0.15)',
  scanChipPressed: 'rgba(255, 255, 255, 0.28)',
  scanChipTorchOn: 'rgba(255, 96, 0, 0.9)',
  scanSubtitle: 'rgba(255, 255, 255, 0.96)',
  scanBackdrop: '#1F2937',
  scanInk: '#1F2937',
  scanStatusInk: '#141210',
} as const;

/** Font size, tracking and line height in dp/sp, per text role. */
export const WalletType = {
  // History
  title: { fontFamily: WalletFont.bold, fontSize: 17.5, letterSpacing: 0, lineHeight: 20 },
  pill: { fontFamily: WalletFont.semibold, fontSize: 11.5, letterSpacing: 0, lineHeight: 14 },
  search: { fontFamily: WalletFont.regular, fontSize: 13, letterSpacing: 0, lineHeight: 16 },
  bandLabel: { fontFamily: WalletFont.regular, fontSize: 12, letterSpacing: 0, lineHeight: 14 },
  bandAmount: { fontFamily: WalletFont.medium, fontSize: 14, letterSpacing: 0, lineHeight: 16 },
  rowLabel: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 12 },
  rowName: { fontFamily: WalletFont.regular, fontSize: 14.5, letterSpacing: 0, lineHeight: 16 },
  rowAmount: { fontFamily: WalletFont.semibold, fontSize: 14.5, letterSpacing: 0, lineHeight: 16 },
  rowMeta: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 12 },
  rowAccount: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 12 },
  // Scan screen
  scanTitle: { fontFamily: WalletFont.semibold, fontSize: 13, letterSpacing: 0.1, lineHeight: 12 },
  scanSubtitle: { fontFamily: WalletFont.regular, fontSize: 10.5, letterSpacing: 0, lineHeight: 9.5 },
  scanChipLabel: { fontFamily: WalletFont.medium, fontSize: 10, letterSpacing: 0, lineHeight: 9 },
  scanLink: { fontFamily: WalletFont.semibold, fontSize: 10, letterSpacing: 0, lineHeight: 9 },
} as const;

/** Layout measures, dp. */
export const WalletLayout = {
  // History
  /** Under the status bar, down to the top of the title row (pill top at 99.5 dp, status bar 24). */
  historyTopBar: 75.5,
  /** Top of the 44 dp help/back targets under the status bar: centred on the glyph at y 64.5. */
  historyIconTop: 18.5,
  historyHelpRight: 2.5,
  /** Pill bottom (134.5) to search top (151.5). */
  historySearchGap: 17,
  titleLeft: 21.5,
  pillHeight: 35,
  pillRadius: 17.5,
  pillBorder: 1,
  pillPadLeft: 13.8,
  pillPadRight: 13.9,
  pillIcon: 14,
  pillIconGap: 6.8,
  pillRight: 20.5,
  helpIcon: 22,
  searchHeight: 48,
  searchRadius: 24,
  searchMargin: 14,
  searchTop: 14,
  searchPadLeft: 13.3,
  searchPadRight: 13.3,
  searchIcon: 21,
  searchIconGap: 14.7,
  searchSeparatorHeight: 21.5,
  searchSeparatorGap: 13.3,
  listTop: 28,
  bandHeight: 44,
  bandLeft: 21,
  bandRight: 20.5,
  bandAmountGap: 5.9,
  chevron: 11,
  rowHeight: 90,
  rowLeft: 20,
  rowRight: 21,
  rowTop: 20.5,
  avatar: 35,
  avatarMoneyInRadius: 9,
  avatarArrow: 25,
  textColumn: 70,
  textGap: 15,
  /**
   * Row text is placed by cap height, not line box: label cap 22, name and amount cap 36.5,
   * meta/account cap 59 dp from the row top. For a font with cap ratio ~0.7, cap top sits at lineHeight/2 - 0.363 x size
   * under the top of the line box, which gives these line-box tops.
   */
  labelTop: 19.5,
  nameTop: 1.7,
  nameAmountGap: 18,
  amountTop: 33.2,
  metaTop: 7.3,
  accountGap: 6.5,
  accountIcon: 12,
  dividerInset: 70,
  // Scan screen
  scanWindow: 251,
  scanWindowRadius: 12,
  scanWindowTop: 146,
  scanBracketInset: 15.5,
  scanBracketInsetTop: 15,
  scanBracketInsetBottom: 17,
  scanBracketStroke: 3.5,
  scanBracketArm: 31.5,
  scanBracketRadius: 8,
  scanHeaderTop: 12,
  scanHeaderHeight: 35,
  scanBackLeft: 6.7,
  scanTitleLeft: 3.5,
  scanSubtitleGap: 1.9,
  scanHelpRight: 6,
  scanHelpRing: 17.5,
  scanChip: 40.5,
  /** Chip columns are 60.5 wide with 29 between, so the discs' centres are 89.5 apart. */
  scanChipColumn: 60.5,
  scanChipColumnGap: 29,
  scanChipTop: 31.5,
  scanChipLabelGap: 8.6,
  scanLinkUnderline: 1.2,
  scanLinkUnderlineGap: 0.3,
  tap: 44,
} as const;
