# Credit end-to-end suite (local only)

Drives the whole Credit lifecycle through the real HTTP API of the **local** stack and checks the server's numbers,
side effects and refusals, not just status codes. It also reads the local MySQL (read-mostly) to cross-check
wallet, payment, payout and settlement rows.

```
export PATH=$HOME/.local/opt/node/bin:$PATH
node tools/credit-e2e/suite.js          # everything (S1..S15)
node tools/credit-e2e/suite.js S1 S2    # a subset (S5..S9 need the ids of S1, S2, S4, S5; S10..S15 are self-contained)
SWEEP_WAIT_S=300 node tools/credit-e2e/suite.js
```

Every assertion prints `PASS`/`FAIL` with expected and actual values; a table per scenario closes the run and the
exit code is non-zero if anything failed (`2` for a crash before the table). Plain Node 20+, built-in `fetch`, no
dependencies.

## Prerequisites

* API on `http://localhost:7070/costonomy-mp-api` built from the credit stack, with the pay-from-wallet switch ON
  (`costonomy.mp.credit.wallet-repay.enabled=true`). The suite refuses to run against a non-local host (`API=` may
  point at another local port).
* Local MySQL `costonomy_mp` on 127.0.0.1:3306 and the `mysql` client at `~/.local/opt/mysql/bin/mysql`
  (or `MYSQL_BIN`). The DB user and password are read at run time from the API repo's gitignored
  `src/main/resources/application-local.properties` (found via `API_REPO`, the sibling directory, or
  `~/Documents/costonomyprojects/costonomy-mp-api`) and handed to `mysql` through `MYSQL_PWD` only; they are never
  printed or written.
* Seed data: restaurant `+919876500004` (outlet 1), other tenant `+919876500007` (outlet 2), suppliers
  `+919876511001/2/3` (stores 1/2/3, each the SUP_OWNER of its organisation), `supplier_credit_policy.credit_enabled=1`
  for stores 1 to 3. Login is OTP `123456`; the helper waits out `OTP_RESEND_TOO_SOON` and caches tokens (and the
  refresh token) in `tools/credit-e2e/.sessions.json` (gitignored, mode 600).

## Scenarios

| | covers |
|---|---|
| S0 | preconditions: API up, wallet-repay switch on, policies, supplier roles |
| S1 | store 2, "as asked": request, duplicate refused, supplier inbox + notification, restaurant cannot approve, approve with an empty body -> ACTIVE, summary figures, re-request while ACTIVE refused |
| S2 | store 3, supplier's own terms (12000 / 15 days / grace 3 / cap 5000 / max overdue 1500): request MODIFIED, agreement APPROVED and unusable (order refused), re-request refused (409), supplier cannot accept, restaurant accepts -> ACTIVE with those terms, limit history row |
| S3 | rejection with outlet 2 (Tandoor House) on store 3: reason required, wrong supplier 404, verbatim reason + `CreditRejected` notification, REJECTED line re-requested, rejected again so no request is left pending |
| S4 | orders on credit through the real intent flow (draft, send, supplier answers, `POST /intents/{id}/orders` with `paymentMethod=CREDIT`) on stores 2 and 3: CONFIRMED / ON_CREDIT, invoice number, amount, due and overdue dates, exact exposure movement, reservation row, ledger and statement ("Order on credit"), `Credit invoice issued` notification, order-key replay; refusals (CREDIT_LIMIT_EXCEEDED on both stores, CREDIT_SINGLE_ORDER_CAP_EXCEEDED, APPROVED line) create nothing; modify rules; due dates are then set by SQL |
| S5 | store 2 invoices: wallet repayment (due-date-first allocation, wallet debited once, `CREDIT_REPAYMENT` wallet row, `credit_payment` source WALLET, pending payout with commission snapshot, supplier notified), replay, key reuse, overpay, validation, shortfall (outlet 2's tiny wallet), "I paid" claims (reportable amount, duplicate over reportable, reject with reason, confirm once, partial confirm, withdraw), supplier-recorded payment (replay, validation, status rules), full payment restores utilized and available exactly |
| S6 | an open invoice is backdated by SQL, the overdue sweep must mark it (poll up to `SWEEP_WAIT_S`, default 120 s; otherwise `SKIPPED-NEEDS-FASTER-SWEEP`): OVERDUE, attention flag, one `CreditOverdue`, SYSTEM suspension above `max_overdue_amount`, no re-request (409), orders refused, part payment keeps OVERDUE and sends no second notice, wallet repayment below the maximum auto-reinstates (`CreditReinstated`); a supplier suspension is not auto-lifted by repayments and only the supplier can reinstate |
| S7 | outlet totals vs the agreements (due, overdue, utilized, claims, reportable), attention flags vs SQL, per-invoice `dueState`/`daysToDue` vs an independent India-date implementation, statement identity (`opening + sum = closing`, each `owedAfter` chained) for restaurant and supplier, statement window validation |
| S8 | credit orders never in `commission_calculation`/settlement adjustments/statements; pending payouts match the repayments (amount, commission); applied payouts (if a settlement run already happened) have exactly one CREDIT_REPAYMENT credit and CREDIT_COMMISSION debit |
| S9 | other tenant, other store's supplier and wrong-side callers get 404 on every credit read and write; unauthenticated calls 401; key reuse on payments, claims, confirms |
| S10 | supplier Receivables (store 1, fixtures on line 6 dated 40/10/3 days late, due today, +3, +6, +7): `receivables` totals (total, overdue, in grace, due today, "due this week" = today..today+6 in India, collected this month, exposure, counts, pendingActions) and the four ageing buckets with their top restaurants, each checked against SQL on `credit_invoice` / `credit_agreement` and as movements from before the fixtures; restaurant rows (owed, overdue, next due, worst state, claims, utilization), sort `overdue` / `owed` / `nextDue`, status filter, `q`, paging and page caps; the payment feed against `credit_payment` (source / day filters); other store, both restaurants 404, no token 401; stores 2 and 3 checked against SQL too |
| S11 | agreement-level receipts on line 6: preview == actual allocation (oldest due first, tie by id, partial, claim warning), receipt / payment / ledger / statement / audit rows, no payout and no wallet movement, replay and key reuse (`IDEMPOTENCY_KEY_REUSE`), duplicate UTR 409 and `allowDuplicateReference`, overpay 422, validation, permission (restaurant, other tenant, other store 404; no token 401); reversal: a typo receipt undone restores invoice and line exactly, `collectedThisMonth` excludes it, double reversal 409, replay, a payment of a receipt refused (details name the receipt), a single payment and a confirmed claim (goes back to REJECTED), the 7-day window refused and the 30-day cheque window (rows moved back in time by SQL), no headroom 422 (limit tightened through the supplier's modify and restored), a WALLET payment refused, statement identity |
| S12 | credit notes, cancel, refunds due, write-off: a manual note (cap, refusals, replay, outstanding lower in invoice, line, restaurant summary, receivables, ageing, restaurant row and statement; not a payment), a note for exactly what is owed (PAID, claim SUPERSEDED, then 409 settled); a credit order cancelled after the draw gets the automatic SYSTEM_CANCEL note and exposure is back exactly; a part-paid cancelled order leaves an OFF_PLATFORM refund due (list, mark refunded, again, permission), a wallet-paid part a WALLET refund that only ops can settle (409); write-off of an invoice (partial with `keepLineOpen` true, then the rest with the default: WRITTEN_OFF, claim superseded, line suspended by the supplier with reason "Written off", the dead invoice refuses every verb) and of a whole line on store 3 / outlet 2 (stated amount spread oldest first, then everything), statement identity after all of it |
| S13 | permission matrix: every supplier verb (24 reads and writes, plus the payout by id) is called by the restaurant of the line, the other tenant's restaurant and two other stores' owners (all 404, nothing moves, checked on 12 counters), without a token (401), and then by the owner (allowed with the documented status); the either-side reads (credit notes, statement, statement.csv, ledger, invoices, payments) |
| S14 | reminders: preview, send, text == preview, claim-covered and not-due skips, history, replay, key reuse, 24-hour gate (429 `CREDIT_REMINDER_TOO_SOON`, `nextAllowedAt`), 3 per 7 days (429 `CREDIT_REMINDER_LIMIT`), `CREDIT_REMINDER_NOT_NEEDED`; extend-due (later only, 60 days past the ORIGINAL date, OVERDUE back to ISSUED, replay, PAID refused); close a line (refused while owed, closes after payoff, again, asking again); offer approved on the supplier's own terms shows `offerExpiresOn` (14 India days) and is withdrawn; request context for a restaurant asking (orders with THIS store only, checked against SQL, nothing about other suppliers, other store 404) |
| S15 | payouts against `credit_repayment_payout` for all three stores (gross, commission snapshot, net, status, settlement, invoice shares, summary, filters, paging, one payout, 404s), a fresh wallet repayment makes one PENDING payout and a supplier receipt none; `collections.csv` and `statement.csv` against the JSON (every cell, row counts, headers, quoting, formula-injection guard on references starting `= + - @`, content type, attachment name, no BOM, `CREDIT_EXPORT` audit row with the row count, refusals) |

## Re-running

The suite is re-runnable and adapts to what earlier runs left: lines for stores 2 and 3 that are already ACTIVE skip
the request/approve steps (they are still asserted), idempotency keys carry a per-run id, notifications are matched
by id after a per-run marker, and when a line has too little headroom (or was left suspended) the suite first fixes
it through the supplier's own API (`modify` / `reinstate`) and says so. Nothing is ever deleted; each run adds
invoices, payments, claims and wallet repayments for stores 2 and 3 (and one small order for outlet 2 / store 1 on
first use). Agreement 1 (demo data) is written to only by S7 (one small order on credit when store 1's line owes nothing, so the summary has three suppliers) and by the demo seed.

S10 to S15 are self-contained: each makes its own fresh invoices through the real order flow (agreement 6 = Tandoor House
with store 1, agreement 3 = Spice Garden with store 2 for the wallet cases, agreement 5 = Tandoor House with store 3 for the
whole-line cases), moves their due dates by SQL (test data only, as S4 does), and settles whatever it made at the end, so a
re-run on a used database starts clean and S5 / S6 / S7 see no stray open invoices. Other SQL fixtures, all on rows the
scenario itself made: payment rows moved 8 days back to reach the reversal window (S11), earlier manual reminders on line 6
aged to clear the 24-hour and 7-day limits (S14, before and after), an invoice marked OVERDUE as the sweep would (S14).
Left behind: payments, receipts, credit notes, write-offs, reversals and reminders as history (S12 also leaves one OPEN WALLET
refund due on store 2 per run, which only ops can clear), line 5 CLOSED then re-requested and rejected again as S3 leaves it,
and a limit raised through the supplier's own modify when a line is short of headroom. S7's statement label check accepts the
labels these scenarios create (Payment reversed, Credit note, Written off).

## Known limits

* Settlement generation (`SettlementJobs.generateForYesterday`, previous UTC day) cannot be triggered from outside;
  S8 asserts the pending payout rows and marks "applied once / generating twice" NOT-RUN until an applied payout exists.
* There is no restaurant user without CREDIT permission in the local data and no invite API, so that single S4 check
  is skipped; the other-tenant user is covered in S9.
* There is no local supplier user other than SUP_OWNER (no store manager, finance, salesperson or admin), so the rows of the
  S11 to S14 permission matrix for those roles are SKIPped (their grants are covered by the API integration tests). The 50 reminders
  per store per day limit, the 20,000-row export limit and a payout that has been APPLIED by a settlement run are also not reachable.
* S6 depends on the hourly `costonomy.mp.credit.overdue-interval`. Restart the API with a short interval
  (for example `COSTONOMY_MP_CREDIT_OVERDUE_INTERVAL=PT20S`) if the invoice is not marked within the wait.

## Demo seed (`seed-supplier-demo.js`)

```
export PATH=$HOME/.local/opt/node/bin:$PATH
node tools/credit-e2e/suite.js            # first, so the data is in a known state
node tools/credit-e2e/seed-supplier-demo.js
```

Local data only. Tidies Sri Balaji Traders (store 1, `+919876511001`) with Spice Garden (`+919876500004`, agreement 1) into a
showable state and prints what the supplier then sees (receivables, ageing, restaurant rows, claims, refunds, payouts, requests):
2 invoices overdue (20 and 8 days late, marked OVERDUE as the sweep would), 2 due this week (one partly paid), 1 due later,
1 fresh "Paid direct" claim and 1 stale one (older than 7 days; the API cannot make an old claim, so its date is moved back by
SQL), 1 payment recorded and then undone, 1 credit note, 1 refund due (an order cancelled after 150 was paid), 1 wallet repayment
whose payout is pending, 1 reminder sent, and a pending credit request from Tandoor House (`+919876500007`) to store 1 (its line
is paid off, closed and requested again). Money moves only through the API as the supplier or the restaurant; the SQL is limited to
due dates, the OVERDUE mark and the age of the stale claim. Nothing is deleted.

Safe to run twice: it withdraws waiting claims, settles what an earlier run left open on agreement 1 with one receipt
(`SEEDCLEAN-...`) and rebuilds the same open state; the refund due, the wallet payout and the reminder are created only when none is
waiting (a reminder sent in the last 24 hours is kept), so those do not pile up. Paid invoices, notes and reversals accumulate as history.

## UI walkthrough (`ui-walk.js`): every Credit screen in a real browser at phone size

`ui-walk.js` (steps and walkthrough) and `ui-core.js` (Chrome DevTools Protocol over the `ws` package, same idea as
`tools/webcheck/cdp.js`, plus the in-page layout checks) drive headless Chrome as a phone (390x844 at 2x with touch;
the read-only key screens again at 360x740 and 412x915). It signs in as the restaurant `+919876500004` and later the
supplier `+919876511001` with a session of its own (OTP 123456; an existing session in the browser is reused, because
OTP requests are rate limited per hour), then **taps** through Home, the Credit overview, the pay sheets, supplier lines,
invoices, the report form, the statement, wallet History, Request credit and the supplier's Credit tab. After every step
it saves a screenshot and runs automatic checks in the page:

| check | what it flags |
|---|---|
| overlap | two interactive elements, or an interactive element and a non-ancestor text block, intersecting by more than 2 px; an interactive element whose pixels are covered by something else (hit test at five points) |
| clipping | horizontal page scroll, text or controls outside the viewport, text cut by `overflow: hidden` (warning) |
| tap targets | interactive elements under 44x44 px (warning; `hitSlop` is not counted) |
| console | `console.error`, page errors, `/api` calls answered 4xx/5xx or failing (a message is reported once, on the step where it first appears) |
| raw | raw codes in the visible text (`CREDIT_OVERPAYMENT`, `undefined`, `NaN`, `[object Object]`, ...) |
| clearance | scrolled to the end, the last item must sit above the sticky bar |

It also hit-tests every tap (`TAP BLOCKED` if the element's centre is covered by something else), asserts what each screen
should show (totals, labels, button states, messages), and approximates a soft keyboard by shrinking the window to 62% height
with the field focused.

```
export PATH=$HOME/.local/opt/node/bin:$PATH
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9444 \
  --user-data-dir=<fresh temp dir> --window-size=390,844 about:blank &      # note the PID, kill only that PID afterwards
node tools/credit-e2e/ui-walk.js                       # everything (about 12 minutes)
ONLY=2,4a VIEWS=0 node tools/credit-e2e/ui-walk.js    # a subset, 390 only; the other steps' earlier results are kept
WEB=http://localhost:7073 SHOTS=/some/dir node tools/credit-e2e/ui-walk.js
node tools/credit-e2e/ui-walk.js --report              # rebuild REPORT-auto.md from results.json
```

Output goes to `SHOTS` (default `../../../ui-shots` relative to the repo, so outside it; never commit it): numbered PNGs
(`name.png`, `name-end.png` = scrolled to the end, `name@360.png` for the other phone sizes), `texts.json` (the visible text of
each screen, for wording review), `results.json` (every check with evidence) and `REPORT-auto.md`.

Notes
* Needs the web app (`WEB`, default `http://localhost:7072`) on a **fresh dev bundle**: a long-running Expo server that missed a
  branch switch serves old screens (check that "Pay from wallet" on the overview opens the "Pay overdue to" sheet).
* Some steps really move local test money: "Pay overdue" (only when something is overdue, or with `PAY_ANYWAY=1`, which pays the
  smallest supplier and so uses the data up) and a 1.00 Cash report that is then withdrawn. Never run it against anything but
  the local stack. It picks its invoices from what exists, so other testers or earlier runs changing the data do not break it.
* A desktop browser cannot show the Android soft keyboard (the shrunken-window step only approximates it), OS font scaling
  (130%), safe-area insets and the system navigation bar, or native touch/overscroll behaviour.

## Android emulator walk (`android-walk.py`)

A UI walkthrough of the restaurant Credit screens on a real Android emulator, to catch two defects seen on a phone:
cards that paint as empty white boxes while their text is in the accessibility tree, and the soft keyboard covering an
input or the primary button. Local only: the app talks to the local API; nothing is sent (the walk stops before every
"Send to supplier" / "Pay" / "Send Request" tap).

```
python3 tools/credit-e2e/android-walk.py <apk> [--no-install] [--keep-session] [--shots DIR]
```

Needs Python 3.9 (standard library only), macOS `sips`, the Android SDK `adb` (`$HOME/.local/opt/android-sdk`), and a
running emulator `emulator-5554` with the app's local API reachable. The script never starts or stops the emulator; it
installs the APK with `adb install -r` (uninstalls once on a signature mismatch), clears the app data for a fresh
sign-in (restaurant +919876500004, OTP 123456, `--keep-session` skips that) and sets `show_ime_with_hard_keyboard=1` so
the soft keyboard shows on the emulator.

Checks after every step: A blank cards (a card/row node with text in the `uiautomator` dump whose screenshot crop has
>= 98 % of pixels within tolerance of its dominant colour; sampled at 0, 1 and 3 s), B keyboard (keyboard top from
`dumpsys window InputMethod` vs the focused field, the primary button and must-read texts), C overlapping clickables,
D raw codes (`CREDIT_OVERPAYMENT`, `undefined`, `NaN` ...), E crashes in logcat. Output goes to
`.../android-shots/<apk>-NN-<screen>.png`, `<apk>-REPORT.md` (per step PASS/FAIL, blank-card timeline, keyboard
measurements, prioritised problems) and `<apk>-results.json`. A "Visual review" section is left for a human to fill in.
Run it on two builds and diff the reports. Data is shared with other local runs (the repayment suite pays invoices), so
a supplier can lose its dues row between runs; the walk skips missing rows and notes it.
