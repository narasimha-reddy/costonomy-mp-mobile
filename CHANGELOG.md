# Changelog

All notable changes to the Costonomy MP (Mandi) Mobile Application across all feature PRs are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Money paths and the API's later phases]

### [phase6/mobile-delivery-offer] - Free delivery, and the supplier's delivery choice (API D-141)
#### Added
- **Supplier answer:** a "How will this be delivered?" choice (I deliver free, I deliver at my fee, Costonomy delivery), limited to what the store's settings allow. At a fee, the supplier can enter a lower charge for that order (never above their store fee).
- **Buyer:** the delivery picker says "Free delivery by the supplier" when it is free and shows the supplier's own fee as money (it showed "Free" for any supplier delivery); the order screen shows a "Delivery  Free" line when delivery was free.

### [phase6/mobile-delivery-day] - Immediate or a day, when sending (API D-140)
#### Added
- The cart has a Delivery choice for the whole basket (Immediate, Today, Tomorrow, In 2 days), sent with every request. Immediate is the default. Days are India's, not UTC's.
- The supplier's request screen shows "Wanted immediately" or the day; the buyer's slot picker starts on the day they asked for.

### [phase6/mobile-suppliers] - Paged supplier directory, honest empty state (API D-138, D-139)
#### Changed
- **Supplier search** loads the next page on "Load more" (the API now returns the nearest 50 and a `nextOffset`), and the count is the server's total.
- **Credit request** supplier search sends `reach=all`, so a supplier who does not deliver to the outlet can still be asked for credit.
- **Suppliers screen** with no suppliers says "Nobody delivers here yet" instead of "No suppliers yet".

### [phase6/mobile-cart] - The cart no longer loses lines (API D-137)
#### Fixed
- **Quantity taps** in the cart are held briefly and sent as one write of the last value, in order per line; a tap still waiting is sent when the screen is left, and sending or ordering waits for it first.
- **Minus at one** removes the line and offers Undo (a toast action), instead of writing a zero.

### [phase5/mobile] - Catch-weight, receiving, subscriptions, cold chain (API D-128 to D-134)
#### Fixed
- **Weight adjustment sign.** Positive is a refund to the buyer ("Weighed less: the buyer pays ₹42.00 less"), as the server defines it; the supplier screen had it inverted.
- **Weigh sheet.** Offered only in CONFIRMED and PREPARING (the API refuses it from READY); fields start empty (or with the reading already taken) instead of the accepted quantity; an empty field is refused instead of sending the ordered quantity as if weighed; the API's refusals (band, decimals, unit) show inside the sheet; the reading is shown beside the billed quantity; "Mark ready" is disabled with the server's sentence until every catch-weight line is weighed.
- **Minimum order value** is compared on the goods before GST (`agreedValue`), as the server does; the "Add ₹X more" client arithmetic is gone.
- **Receiving.** The three counts add up to the billed quantity on a weighed line; the client refund estimate and the invented `CN-…` number are gone; only the server's refund, where it went (by how the order was paid), and a credit note number if one exists are shown; a card refund still waiting on capture says so; the idempotency key is per attempt, so a retry after one refusal no longer fails. Steppers accept decimals.
- **Subscriptions.** The payment method (wallet or credit) is sent and shown; Costonomy delivery is no longer offered; an invalid quantity is refused instead of becoming 1; "tomorrow" is India's; the supplier's generate-orders button and client code are removed (orders are created by the platform each evening); subscription notifications open the list.
- **Record payment.** One idempotency key per attempt (a retry cannot record the repayment twice).
- **Billing.** Tax invoice failures show the server's reason (a missing GSTIN, HSN code or address in words; "not available" while the feature is off).
- **Chilled goods.** The delivery picker shows the server's "no carrier can carry chilled goods" sentence, and a fee quoted for ordinary goods that meets a chilled order asks for the fee again.
- **Accessibility and theme.** Payment, rejection, frequency, delivery and slot chips announce role, state and label; the weight input is labelled; cold-chain banners use theme tokens (one `ColdChainBanner`), and no longer claim 3-wheelers are insulated.

#### Added
- Wallet copy for `ORDER_ADJUSTMENT` (credit "Order adjusted · money back", debit "Order adjusted · extra charge") and the two bank-payout kinds, matching the API's `WalletEntryCopy`.
- "Estimated. The final price follows the scale weight and will never be more than this." on cart, checkout and order lines sold by weight (from `isCatchWeight` on the SKU descriptor and preview lines, added to the API in `phase5/api-flags`); after weighing the line says what was billed.
- Contract fixtures with the API's real JSON (money as numbers) in `tests/fixtures/catchWeightContract.ts`, and tests built from them.

## [Discovery & Multi-Brand Fulfillment]

### [feat/item-multi-brand-options] - Multi-Brand Options with Lowest Priced First
#### Added
- **Multi-Brand Models (`models/discovery.ts`, `models/catalog.ts`)**:
  - `BrandOption` interface with pack dimensions, selling price, GST-inclusive price, and stock availability.
  - Attached `brandOptions` to `RecommendedOffer`, `StorefrontSku`, and `SkuDetail`.
  - Added `brandName`, `gstRate`, `unitPriceInclusiveGst`, and `offerId` to `SkuSibling`.
- **Offer Comparison Card (`components/supplier/OfferCard.tsx`)**:
  - Horizontal brand options rail rendered under the item when an item from a supplier has multiple brand options.
  - Lists options sorted with lowest priced first, badged with "Lowest Price".
  - Interactive selection updates the active brand variant, pack size, unit price, and stepper cart actions dynamically.
- **Storefront & Catalog (`components/product/SkuRow.tsx`)**:
  - Added brand options rail under the item row displaying all fulfilling brands sorted lowest price first.
- **SKU Details (`app/restaurant/sku/[id].tsx`)**:
  - Added "Brand Options from [Store]" section highlighting "Lowest Price" and "Viewing" badges with lowest priced option listed first.
- **Unit Tests (`tests/brandOptions.test.ts`)**:
  - Tests verifying model contracts and lowest-price-first ordering.

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
