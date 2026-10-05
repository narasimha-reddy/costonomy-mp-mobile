# Changelog

All notable changes to the Costonomy MP (Mandi) Mobile Application across all feature PRs are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Credit]

### [feat/credit-m1-foundation-and-home-tile]
#### Added
- Home "Credit" tile after Quick Scan and Wallet (shown with CREDIT_VIEW), with a red dot and "Credit, payment overdue" label when `GET /outlets/{id}/credit/attention` reports overdue (`hooks/useCreditAttention.ts`).
- Credit data layer: invoice detail, statement and wallet-repayment types and services, `isShortBalanceError` / `isOverpaymentError` helpers, and `dueChip` (`lib/credit/dueChip.ts`) for the server's due state.
- `MoneyAction.badge` on the Money Transfers tiles.

---

## [Procurement & Open Requests]

### [PR #17] [feat/edit-open-request-quantities]
#### Added
- Restaurant item quantity editor on open requests screen (`app/restaurant/requests/[id].tsx`).
- Real-time catalog price estimation updates before submitting modified procurement orders.

---

## [Wallet & QuickScan Payments]

### [feat/transaction-detail-and-receipt] - Transaction details & Share Receipt
#### Added
- Transaction details screen (`app/restaurant/wallet/transaction/[id].tsx`), opened from a History row: status-coloured header and status bar (success, in progress, failed, money returned), the payee card, collapsible "Transfer Details" (Costonomy Transaction ID, wallet row, references, copy icons), round actions (Pay again, Wallet, View History, Share Receipt) and a Contact Support row that says it is coming soon.
- Share Receipt: `ReceiptCard` is captured off-screen with `react-native-view-shot` (1080 px wide PNG) and opened with `expo-sharing`; on the web `navigator.share` with a file, else a download (`lib/wallet/shareReceipt.ts`). File name `costonomy-receipt-<id>.png`.
- `fetchWalletTransaction`, `useWalletTransaction`, `walletTransactionKey`, `WalletTransactionDetail` model, pure helpers in `lib/wallet/detail.ts`, detail tokens in `theme/walletScreen.ts`, Costonomy logo asset.
- New native modules: `react-native-view-shot`, `expo-sharing`, `expo-clipboard`, `expo-file-system` (a new APK build is needed).

### [feat/scan-screen-and-history-redesign] - Full-page QuickScan camera & History redesign
#### Changed
- QuickScan (`app/restaurant/quickscan/index.tsx`) is now a full-page camera: dimmed overlay, rounded window with orange corner brackets, round Upload QR and Torch buttons, help sheet, and an "Or enter a UPI ID" link that opens the typed-ID sheet.
- Wallet History (`app/restaurant/wallet/history.tsx`) is redesigned: My Statements pill, tinted search box with the filter button, sticky month bands with the month's net, and new rows (avatar, label, title, "4 hours ago", amount, "Debited from wallet").
- New QuickScan glyph (`components/icons/ScanQrIcon.tsx`) replaces the stock QR icon on Home, the wallet tip and the scan screen.
#### Added
- `theme/walletScreen.ts` tokens for the wallet screens, set in the app's Source Sans 3.
- Tapping a month band on History opens a sheet with that month's money in, money out and net; a month that ended behind shows a minus sign.
- Client-side History search (`lib/wallet/search.ts`) and relative-time helper (`lib/wallet/relativeTime.ts`).

### [PR #15] [feat/wallet-2-history-statements] - Wallet History & Statements (D-108)
#### Added
- Comprehensive wallet transaction history view in `app/restaurant/wallet.tsx`:
  - Filter transactions by month, transaction kind (top-up, order payment, refund, withdrawal), and settlement status.
  - Interactive pagination with infinite scroll.
- Download statement modal:
  - Range presets (Last 30 days, 90 days, Current Financial Year, Custom date range).
  - Format selection (PDF or CSV export) with native file sharing/saving handlers.

### [PR #14] [feat/wallet-1-home-and-wallet-ui] - Wallet Dashboard & Razorpay Top-Up (D-107)
#### Added
- Restaurant Home Dashboard Wallet Card:
  - Displays real-time spendable wallet balance and tiered monthly limit progress bars.
- Wallet Top-Up Modal:
  - Pre-set quick amount chips (₹1,000, ₹5,000, ₹10,000) and custom input.
  - Razorpay Checkout mobile SDK bridge (`lib/payments/razorpayCheckout.ts`) opening secure gateway payment sheets.
  - Dynamic polling and receipt confirmation state machine.

### [PR #13] [feat/quickscan-1-scan-pay] - QuickScan Merchant Payments (D-106)
#### Added
- Integrated camera QR scanner screen (`app/restaurant/quickscan.tsx`).
- BharatQR and UPI QR code payload parser extracting payee VPA, merchant name, and invoice amount.
- Direct wallet debit payment confirmation sheet with PIN verification and instant receipt generation.

---

## [Razorpay Core Payments]

### [PR #12 / Step 17] [feat/razorpay-17-withdrawal-reversal-copy]
#### Added
- Enhanced wallet failure handling in `app/restaurant/wallet.tsx`: renders clear explanations and recovery steps when bank payouts fail.
- `lib/wallet/withdrawError.ts`: maps banking and provider error codes to intuitive user-facing messaging.
- Unit test suite `tests/withdrawalReversal.test.tsx` verifying failure card rendering and retry behaviors.

### [PR #11 / Step 16] [feat/razorpay-16-upi-cancel-copy]
#### Added
- Accurate post-debit cancellation copy in `app/restaurant/orders/[id].tsx` and `app/supplier/orders/[id].tsx`.
- Central toast and banner constants in `lib/payments/statusLabel.ts` (`SUPPLIER_CANCEL_TOAST`, `SUPPLIER_CANCELLED_LINE`) explaining whether an order's funds were refunded or simply unreserved.

### [PR #10 / Step 15] [feat/razorpay-15-order-payment-status]
#### Added
- `components/order/PaymentMethodPill.tsx`: dynamic badge showing the order's funding mechanism (Credit Line, Razorpay, or Wallet).
- `lib/payments/statusLabel.ts`: user-friendly status copy indicating payment settlement states and where money currently resides.

### [PR #9 / Step 14] [feat/razorpay-14-dispute-refund-e2e]
#### Added
- E2E automated test scenarios in `tools/razorpay-e2e/suite.js` covering full customer dispute lifecycle: raising dispute, supplier approval, wallet balance crediting, and bank withdrawal initiation.

### [PR #8 / Step 13] [feat/razorpay-13-disputes-section]
#### Added
- Complete mobile UI for Disputes and Restaurant Wallet:
  - Restaurant Wallet screen: `app/restaurant/wallet.tsx` with transaction ledger and payout requests.
  - Dispute resolution threads: `app/restaurant/disputes/[id].tsx`, `app/supplier/disputes/[id].tsx`, and `components/dispute/DisputeThread.tsx`.
  - Dispute listing tabs and navigation entries in Restaurant Account and Supplier More menus.
- Unit test coverage in `tests/disputeRefund.test.ts`.

### [PR #7 / Step 10] [feat/razorpay-10-capture-at-dispatch]
#### Added
- E2E test assertions in `tools/razorpay-e2e/suite.js` validating two-phase payment authorization: asserts that funds are placed on hold and captured only after order status moves to dispatch.

### [PR #6 / Step 9] [feat/razorpay-9-pay-screen-fixes]
#### Added
- Server-authoritative outcome handling in `app/restaurant/pay/[orderId].tsx`: replaces reliance on client SDK callback hooks with backend verification polling.
- `lib/payments/outcome.ts` outcome state machine and unit tests in `tests/payOutcome.test.ts`.

### [PR #5 / Step 6] [feat/razorpay-6-e2e-suite]
#### Added
- Standalone autonomous E2E test runner under `tools/razorpay-e2e/` testing live order creation, payment checkout, card decline handling, and webhook confirmations.

### [PR #4 / Step 5] [feat/razorpay-5-order-double-tap]
#### Added
- Double-tap and rapid submission debounce prevention in `app/restaurant/requests/[id].tsx` and `services/intent.ts`, guaranteeing in-flight requests bind to a single order instance.

### [PR #3 / Step 4] [feat/razorpay-4-checkout]
#### Added
- Seamless Razorpay checkout modal integration:
  - `lib/payments/checkout.ts`, `lib/payments/razorpayCheckout.ts`, and web driver `lib/payments/razorpayCheckout.web.ts`.
  - Embedded into the restaurant payment screen `app/restaurant/pay/[orderId].tsx`.
- Unit test suite `tests/checkout.test.ts`.

---

## [Delivery & Logistics Platform Integrations]

### [feat/delivery-tracking-ui]
#### Added
- Supplier delivery partner dispatch controls, live tracking map/webview integration, and safe navigation handling.
- Arrival Radar situational widgets for restaurant kitchens: real-time driver ETA, vehicle type badge, and delivery issue notification alerts.
