/**
 * Tokens for the wallet's "clone" screens: History, the QuickScan camera screen and
 * (next) the transaction detail screen.
 *
 * <p>Every number here was measured from a reference render (see the PR notes) at
 * 1 dp = 620/360 px on a 360 dp phone, so the sizes are the measured Inter sizes scaled
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
 * The reference render is set in Inter (cap height 0.73 em); the app's Source Sans 3 has a cap
 * height of about 0.66 em, so every size below is the measured Inter size times this ratio to keep
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

// ── Transaction details and the shared receipt ────────────────────────
// Measured from the detail reference (plan2/detail/spec.md), 1 dp = 620/360 px (sizes scaled for Source Sans 3).

/** Header colour and wording per entry status; the system status bar is painted the same colour. */
export const DetailStatusColors = {
  success: '#0B7A2D',
  inProgress: '#B45309',
  failed: '#B91C1C',
  returned: '#9A3412',
} as const;

export const DetailColors = {
  page: '#F6F6F6',
  card: '#FFFFFF',
  divider: '#E9E9E9',
  title: '#000000',
  name: '#1A1A1A',
  text: '#141414',
  value: '#171717',
  wallet: '#131313',
  secondary: '#666666',
  section: '#1B1B1B',
  support: '#1D1D1D',
  icon: '#111111',
  bandTitle: '#1D1D1D',
  bandTime: '#444444',
  actionRipple: '#FFE2CC',
  snackbar: '#323232',
  skeleton: '#EAEAEA',
  shadow: '#000000',
  headerRipple: 'rgba(255, 255, 255, 0.2)',
} as const;

export const DetailType = {
  headerTitle: { fontFamily: WalletFont.semibold, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  headerTime: { fontFamily: WalletFont.regular, fontSize: 10.5, lineHeight: 11.5, letterSpacing: 0 },
  cardTitle: { fontFamily: WalletFont.semibold, fontSize: 13, lineHeight: 14.5, letterSpacing: 0 },
  name: { fontFamily: WalletFont.regular, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  amountBold: { fontFamily: WalletFont.semibold, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  sub: { fontFamily: WalletFont.regular, fontSize: 12.5, lineHeight: 14, letterSpacing: 0 },
  section: { fontFamily: WalletFont.medium, fontSize: 12.5, lineHeight: 14, letterSpacing: 0 },
  label: { fontFamily: WalletFont.regular, fontSize: 11, lineHeight: 12, letterSpacing: 0 },
  value: { fontFamily: WalletFont.regular, fontSize: 12.5, lineHeight: 14, letterSpacing: 0 },
  action: { fontFamily: WalletFont.regular, fontSize: 10.5, lineHeight: 11.5, letterSpacing: 0 },
  bandTitle: { fontFamily: WalletFont.regular, fontSize: 15, lineHeight: 16.5, letterSpacing: 0 },
  bandTime: { fontFamily: WalletFont.regular, fontSize: 10.5, lineHeight: 11.5, letterSpacing: 0 },
} as const;

export const DetailLayout = {
  headerBar: 56,
  back: 48,
  backLeft: 0,
  titleLeft: 62,
  headerTimeGap: 0.1,
  /** Back arrow and titles sit 4 dp under the bar's centre, as measured. */
  headerShift: 8,
  backGlyph: 17,
  cardMargin: 7,
  cardTop: 8,
  cardRadius: 8,
  cardPadTop: 11.5,
  cardPadBottom: 15.5,
  cardInset: 14,
  titleToAvatar: 12,
  avatar: 35,
  avatarRadius: 13,
  avatarArrow: 17.5,
  avatarLeft: 13.5,
  textGap: 14.5,
  nameTop: 4,
  subTop: 2,
  dividerInset: 21,
  dividerTop: 14.5,
  divider: 0.6,
  sectionHeight: 48,
  sectionLeft: 15.5,
  sectionRight: 16,
  sectionTop: -0.6,
  sectionBottom: -7.5,
  sectionIcon: 16.5,
  sectionTextGap: 15.8,
  chevron: 16,
  labelTop: 8,
  labelNext: 13.2,
  valueTop: 4.5,
  walletTop: 10.6,
  walletRow: 17.5,
  walletIcon: 20,
  walletLeft: 17,
  walletNameGap: 26,
  /** The copy button is 48 wide; its 12 dp glyph then ends 21 dp from the card edge. */
  copyRowRight: 3,
  refTop: 11,
  refLeft: 62,
  copyTap: 48,
  copyIcon: 17,
  copyWidth: 11.5,
  copyHeight: 15,
  actionsTop: 16.9,
  actionsDividerTop: 14.3,
  circle: 40.5,
  actionLabelTop: 8.3,
  actionColumnWidth: 80,
  supportTop: 7.5,
  supportHeight: 48,
  supportLeft: 19,
  supportRight: 16.3,
  supportTextGap: 25.3,
  supportIcon: 17,
  pageBottom: 16,
  // Receipt picture
  receiptWidth: 360,
  receiptBand: 48,
  receiptLogoLeft: 21,
  receiptLogoHeight: 17.5,
  receiptLogoWidth: 77.5,
  receiptTitleLeft: 111,
  receiptCardTop: 6,
  receiptBottom: 14,
  receiptScale: 3,
  receiptPixelWidth: 1080,
  snackbarHeight: 40,
} as const;
