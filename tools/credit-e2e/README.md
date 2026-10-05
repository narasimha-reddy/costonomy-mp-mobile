# Credit end-to-end suite (local only)

Drives the whole Credit lifecycle through the real HTTP API of the **local** stack and checks the server's numbers,
side effects and refusals, not just status codes. It also reads the local MySQL (read-mostly) to cross-check
wallet, payment, payout and settlement rows.

```
export PATH=$HOME/.local/opt/node/bin:$PATH
node tools/credit-e2e/suite.js          # everything (S1..S9)
node tools/credit-e2e/suite.js S1 S2    # a subset (later scenarios need the ids of S1, S2, S4, S5)
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

## Re-running

The suite is re-runnable and adapts to what earlier runs left: lines for stores 2 and 3 that are already ACTIVE skip
the request/approve steps (they are still asserted), idempotency keys carry a per-run id, notifications are matched
by id after a per-run marker, and when a line has too little headroom (or was left suspended) the suite first fixes
it through the supplier's own API (`modify` / `reinstate`) and says so. Nothing is ever deleted; each run adds
invoices, payments, claims and wallet repayments for stores 2 and 3 (and one small order for outlet 2 / store 1 on
first use). Agreement 1 (demo data) is never written to.

## Known limits

* Settlement generation (`SettlementJobs.generateForYesterday`, previous UTC day) cannot be triggered from outside;
  S8 asserts the pending payout rows and marks "applied once / generating twice" NOT-RUN until an applied payout exists.
* There is no restaurant user without CREDIT permission in the local data and no invite API, so that single S4 check
  is skipped; the other-tenant user is covered in S9.
* S6 depends on the hourly `costonomy.mp.credit.overdue-interval`. Restart the API with a short interval
  (for example `COSTONOMY_MP_CREDIT_OVERDUE_INTERVAL=PT20S`) if the invoice is not marked within the wait.

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
