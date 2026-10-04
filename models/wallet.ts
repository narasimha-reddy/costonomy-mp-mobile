import type { Money } from '@/utils/money';

/**
 * An outlet's prepaid balance. The third way to fund an order, alongside a card
 * and a supplier's credit.
 *
 * <p>The difference that matters to the screen: a wallet settles inside the
 * order's own creation, so there is no checkout to complete afterwards. What it
 * shares with credit is that it can be short — and unlike a declined card,
 * being short is something the restaurant can do something about.
 */
export interface Wallet {
  outletId: number;
  balance: Money;
  currency: string;
  status: string;
  recent: WalletEntry[];
  /**
   * What the outlet may add, and how much of it is left. Absent on an older API,
   * and then the screens simply do not show a meter or pre-check an amount — the
   * server still enforces every one of these.
   */
  limits?: WalletLimits;
}

/**
 * The server's top-up rules for this outlet, as decimal strings.
 *
 * <p>Read for display and for a hint before a tap. They are never the authority:
 * the server checks every top-up against its own copy, at that moment.
 */
export interface WalletLimits {
  /** The most the wallet may hold. */
  maxBalance: Money;
  monthlyTopUpLimit: Money;
  addedThisMonth: Money;
  remainingThisMonth: Money;
  minTopUp: Money;
  maxTopUp: Money;
}

export type WalletDirection = 'DEBIT' | 'CREDIT';

/**
 * One movement, from the wallet's point of view.
 *
 * <p>`DEBIT` is money leaving to pay for an order — the opposite of how a
 * restaurant would say it, and not the same "credit" as a supplier's terms.
 */
export interface WalletEntry {
  id: number;
  /**
   * What tells one history row from another: `L18` for ledger row 18. The history
   * feed can carry rows from more than one table, so `id` alone may repeat; absent
   * on the wallet screen's `recent`, where `id` is unique.
   */
  key?: string;
  direction: WalletDirection;
  /** Why it moved (API D-104). */
  kind: WalletEntryKind;
  amount: Money;
  /** What the balance became, so a statement reads without arithmetic. */
  balanceAfter: Money | null;
  supplierOrderId: number | null;
  reason: string | null;
  /**
   * For a withdrawal: where its refund to the card has got to. `NEEDS_REVIEW`
   * means it could not finish and Mandi's team has it. Null for other kinds.
   */
  refundStatus: WithdrawalRefundStatus | string | null;
  /**
   * Where the movement stands, for the history screen. Absent on an older API,
   * and then a row is simply a completed one.
   */
  status?: WalletEntryStatus;
  /** What the money was paid with or sent to — "Card •1007", "UPI". Absent when unknown. */
  instrument?: string | null;
  /**
   * Where this payment's bill stands, or null when it takes no bill. Absent on an older API,
   * and then a row simply shows no bill chip.
   */
  bill?: { status: WalletBillStatus } | null;
  at: string;
}

/** Where a payment's bill has got to, in the server's words. */
export type WalletBillStatus = 'PENDING' | 'READING' | 'ADDED' | 'REVIEWED' | 'UNREADABLE';

/** Every bill status, in the order the Bill filter lists them. */
export const BILL_STATUSES: readonly WalletBillStatus[] = ['PENDING', 'READING', 'ADDED', 'REVIEWED', 'UNREADABLE'];

/** How many bills are waiting on the restaurant, across all months and whatever the filters say. */
export interface WalletBillSummary {
  pending: number;
  reading: number;
  unreadable: number;
}

/**
 * `RETURNED` is money that left the wallet and came back to the bank or card
 * (a withdrawal the bank bounced); it is neither a spend nor a top-up.
 */
export type WalletEntryStatus = 'COMPLETED' | 'IN_PROGRESS' | 'FAILED' | 'RETURNED';

/** One month's totals, from the server: the client never adds up money. */
export interface WalletMonthTotal {
  /** `yyyy-MM`, in India time. */
  month: string;
  added: Money;
  spent: Money;
  /** Payments that month still waiting for a bill. Absent on an older API. */
  billsPending?: number;
}

/** One page of the wallet's full history (`GET .../wallet/transactions`). */
export interface WalletTransactionsPage {
  items: WalletEntry[];
  /** Absent on an older API; the screen then shows no month totals. */
  monthTotals: WalletMonthTotal[];
  /** Months that have any movement, newest first, for the filter's month list. */
  availableMonths: string[];
  nextCursor: string | null;
  /** Absent on an older API; the screen then shows no banner. */
  billSummary: WalletBillSummary | null;
}

/** The choices behind the History screen's "Filters", in the server's words where it has them. */
export type WalletCategory = 'TOP_UP' | 'ORDER_PAYMENT' | 'REFUND' | 'WITHDRAWAL' | 'SHOP_PAYMENT';
export type WalletInstrument = 'CARD' | 'UPI' | 'NETBANKING' | 'WALLET';
export type WalletStatusFilter = 'COMPLETED' | 'IN_PROGRESS' | 'RETURNED';

export interface WalletFilters {
  /** `yyyy-MM`. */
  months: string[];
  categories: WalletCategory[];
  instruments: WalletInstrument[];
  statuses: WalletStatusFilter[];
  bills: WalletBillStatus[];
}

export type StatementRange = 'LAST_30' | 'LAST_90' | 'LAST_180' | 'LAST_365' | 'CUSTOM';
export type StatementFormat = 'PDF' | 'CSV';

/** What "My Statement" asks the server for. Dates are `yyyy-MM-dd`. */
export type StatementRequest =
  | { kind: 'range'; range: Exclude<StatementRange, 'CUSTOM'>; format: StatementFormat }
  | { kind: 'custom'; from: string; to: string; format: StatementFormat }
  | { kind: 'financialYear'; financialYear: string; format: StatementFormat };

/**
 * The kinds this app knows. A newer API may send others: every reader must cope
 * with a value that is not listed (see `entryLabel`).
 */
export type WalletEntryKind =
  | 'TOP_UP' | 'ORDER_PAYMENT' | 'ORDER_REFUND' | 'REFUND' | 'WITHDRAWAL' | 'DISPUTE_REFUND'
  /** A withdrawal the provider refused, put back in the wallet (API D-110). A credit. */
  | 'WITHDRAWAL_REVERSAL'
  | 'QUICKSCAN_PAYMENT' | 'QUICKSCAN_RETURN';

/** Where a withdrawal's refund has got to. `REJECTED`/`REVERSED` need API D-110. */
export type WithdrawalRefundStatus =
  | 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW' | 'REJECTED' | 'REVERSED';

/** Why a withdrawal above what can go back was refused (API D-110). */
export type WithdrawalRefusalReason = 'SOURCE_BLOCKED' | 'PROVIDER_UNREACHABLE' | 'NO_REFUND_MONEY';

/** One payment's share of a withdrawal: a refund to that payment's card. */
export interface WithdrawalPart {
  refundId: number;
  paymentId: number;
  amount: Money;
  status: string;
}

export interface Withdrawal {
  outletId: number;
  amount: Money;
  balance: Money;
  parts: WithdrawalPart[];
}

/**
 * A top-up the server has opened and is waiting to be paid at the provider's
 * checkout. Named for what checkout needs; `services/wallet.ts` maps the wire names.
 */
export interface WalletTopUp {
  topUpId: string;
  providerOrderId: string;
  /** The provider's publishable key. Never a secret. */
  publicKey: string;
  amount: Money;
  currency: string;
}

/** Where a top-up has got to. Only `CREDITED` means the money is in the wallet. */
export type TopUpStatus = 'CREATED' | 'CREDITED' | 'REFUNDED' | 'FAILED' | 'EXPIRED';

/**
 * The server's answer to "the customer paid".
 *
 * <p>`pending` is not a failure: the payment is being verified and the server's
 * own job will credit it. The wallet is only present once it has been credited.
 */
export interface TopUpConfirmation {
  pending: boolean;
  wallet: Wallet | null;
}

/** One line under "Transfer Details": the label, the value and whether it can be copied. */
export interface WalletReference {
  label: string;
  value: string;
  copyable: boolean;
}

/** What the detail screen may offer next. `payeeVpa` comes only with `canPayAgain`. */
export interface WalletTransactionActions {
  canPayAgain: boolean;
  payeeVpa?: string;
  /** True only for shop (QuickScan) and order payments made from the wallet. Absent on an older server. */
  canAddBill?: boolean;
  /** The payment may be marked "no bill needed". Absent on an older server. */
  canWaiveBill?: boolean;
  /** A "no bill needed" mark may be taken back. Absent on an older server. */
  canUndoWaiver?: boolean;
}

/** A bill's status on the details page, which can also say none is needed. */
export type DetailBillStatus = WalletBillStatus | 'NOT_REQUIRED';

export type InvoiceStatus = 'READING' | 'READ' | 'UNREADABLE';

/** The bill as the details screen sees it: just enough for the Invoice row. */
export interface WalletInvoiceSummary {
  status: InvoiceStatus;
  vendorName: string | null;
  total: number | null;
  thumbnailUrl: string | null;
}

export interface InvoicePage {
  page: number;
  contentType: string;
  sizeBytes: number;
  /** A short-lived link (about five minutes): refetch the invoice when it has expired. */
  url: string;
  expiresAt: string;
}

export interface InvoiceItem {
  name: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  total: number | null;
  /** The SKU the server matched this line to, or null. Absent on an older server. */
  skuMatch?: SkuOption | null;
}

/** A SKU as the lookups and the server's matching name it. Money as sent (string or number). */
export interface SkuOption {
  id: number;
  name: string;
  unit: string | null;
  unitPrice: string | null;
  categoryName: string | null;
}

/** A supplier from the lookup. */
export interface SupplierOption {
  id: number;
  name: string;
}

export type ReviewPaymentStatus = 'PENDING' | 'COMPLETED';

/** The SKU a review line is resolved to. `id` null: a new SKU typed in by the owner, saved only in this review. */
export interface ReviewSku {
  id: number | null;
  name: string;
  unit: string | null;
  unitPrice: string | null;
}

/** What the bill said for this line; null on a line the owner added. */
export interface ReviewFromInvoice {
  name: string | null;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  total: string | null;
}

export interface ReviewLine {
  /**
   * The bill line this came from (1..N, each at most once), or null for a line the owner added. The
   * server checks it against the reading, so it is never invented on the phone.
   */
  lineNo: number | null;
  /** What the bill said; null on an added line. Read from responses only, never sent. */
  fromInvoice: ReviewFromInvoice | null;
  sku: ReviewSku | null;
  quantity: string | null;
  unit: string | null;
  amount: string | null;
  tax: string | null;
  ignoredDeviation: boolean;
}

/**
 * The review of a bill: the server's draft (its starting point) or the owner's saved review.
 * Money is a decimal string. `subtotal`, `tax` and `total` are the server's; the app never sends them.
 */
export interface InvoiceReview {
  supplier: { id: number | null; name: string };
  invoiceNumber: string | null;
  /** The draft carries the date as read off the bill; a saved review carries what the owner chose. */
  invoiceDate: string | null;
  /** ISO day. */
  stockInDate: string | null;
  paymentStatus: ReviewPaymentStatus;
  items: ReviewLine[];
  delivery: string | null;
  /** Worked out by the server (delivery differs from the bill's); read, never sent. */
  deliveryOverridden: boolean;
  /**
   * The bill-level tax, when it replaces the sum of the line taxes (null: tax is the sum of the lines).
   * The draft fills it from the bill when the lines carry no tax but the bill does.
   */
  taxOverride: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  /** Only on a saved review. */
  reviewedAt?: string | null;
  /** The user id (a number) who saved the review. Only on a saved review. */
  reviewedBy?: number | null;
}

/** One line as it is sent: what the server reads, nothing it works out itself. */
export interface ReviewLinePayload {
  lineNo: number | null;
  sku: ReviewSku | null;
  quantity: string | null;
  unit: string | null;
  amount: string | null;
  tax: string | null;
  ignoredDeviation: boolean;
}

/** What is sent to save a review: the review without the server's totals, plus the version it was based on. */
export interface InvoiceReviewPayload {
  version: number;
  supplier: { id: number | null; name: string };
  invoiceNumber: string | null;
  invoiceDate: string | null;
  stockInDate: string | null;
  paymentStatus: ReviewPaymentStatus;
  items: ReviewLinePayload[];
  delivery: string | null;
  taxOverride: string | null;
}

/** What was read off the bill. Dates stay as the text read; money stays as the server sent it. */
export interface InvoiceReading {
  vendorName: string | null;
  vendorAddress: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customerName: string | null;
  currency: string | null;
  items: InvoiceItem[];
  subtotal: number | null;
  tax: number | null;
  delivery: number | null;
  total: number | null;
  /** The supplier the server matched the shop to, or null. Absent on an older server. */
  supplierMatch?: { id: number; name: string } | null;
}

/** The server's comparison of the bill total with the payment. The app never recomputes it. */
export interface InvoiceCheck {
  paid: number;
  billTotal: number | null;
  matches: boolean | null;
  difference: number | null;
  /** The total as read off the bill, and whether that matched the payment (not shown yet). */
  readingTotal?: number | null;
  matchesReading?: boolean | null;
}

export interface WalletInvoice {
  status: InvoiceStatus;
  createdAt: string;
  uploadedBy?: unknown;
  pageCount: number;
  pages: InvoicePage[];
  reading: InvoiceReading | null;
  check: InvoiceCheck | null;
  error: string | null;
  attempts: number;
  /** Bumped on every change; sent back with a review so a stale save is refused (409 INVOICE_CHANGED). */
  version?: number;
  /** The server's starting point for a review: always sent once the bill is READ or UNREADABLE. */
  draft?: InvoiceReview | null;
  /** The owner's saved review, or null. */
  review?: InvoiceReview | null;
}

/** One file ready to upload as a `file` part. */
export interface BillFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * One wallet movement in full, for the Transaction details screen
 * (GET /outlets/{id}/wallet/transactions/{entryId}). The History row's fields plus
 * who it was with (`counterpartyDetail` is already masked by the server), our own
 * transaction id and the reference lines.
 */
export interface WalletTransactionDetail extends WalletEntry {
  transactionId: string;
  status: WalletEntryStatus;
  counterpartyName: string | null;
  counterpartyDetail: string | null;
  references: WalletReference[];
  actions: WalletTransactionActions;
  /** The bill the restaurant added, or null. Absent on an older server. */
  invoice?: WalletInvoiceSummary | null;
  /** Where the bill stands; null when the payment takes none. Absent on an older server. */
  billStatus?: DetailBillStatus | null;
}
