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
