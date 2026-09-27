# razorpay-e2e — payments against Razorpay's test mode

An end-to-end suite that pays for real orders through the web app and Razorpay's
own checkout, with Razorpay's test cards and demo bank, and then checks the
outcome in **our database and in Razorpay's records**. Most cases are failures,
because those are what a happy-path demo never exercises.

It is not a unit test suite and does not run in CI: it needs a running local
stack, a browser and Razorpay test keys. It creates real test-mode orders,
payments and ₹10 refunds in the Razorpay account it runs against.

## Before you run it

1. The local stack is up and seeded (`docs/ONBOARDING.md` in both repos): API on
   7070, `npm run web` on 7071, MySQL, Redis.
2. The API is on Razorpay test mode. In
   `costonomy-mp-api/src/main/resources/application-local.properties`:

   ```properties
   costonomy.mp.providers.payment=RAZORPAY
   costonomy.mp.razorpay.key-id=rzp_test_...
   costonomy.mp.razorpay.key-secret=...
   costonomy.mp.razorpay.webhook-secret=...
   costonomy.mp.otp.mock-code=123456
   ```

   The suite reads the keys and the database password from that same file, so
   nothing secret is copied here. It refuses to run on anything but an
   `rzp_test_` key.
3. Google Chrome installed (override with `CHROME_PATH`).

```bash
cd tools/razorpay-e2e
npm install
npm test              # all 30, about ten minutes
node suite.js F       # only cases whose id starts with F
HEADED=1 node suite.js C1   # watch it in a visible window
```

Screenshots of the interesting moments land in `shots/`, a JSON summary in
`report.json`. Both are gitignored.

## What it checks

Card flows go through the real UI: request → **Create Order** → **Pay** →
Razorpay's window → test card → demo bank or OTP.

| Id | Case | Asserts |
|---|---|---|
| C1 | Visa, bank Success | order `CONFIRMED`; payment `CAPTURED` by our job; Razorpay agrees on status, order id and paise |
| C2 | Mastercard, in-checkout OTP (4+ digits) | funded and captured |
| C3 | Netbanking, bank Success | funded; Razorpay records `netbanking` |
| F1 | Bank Failure, then close checkout | ours untouched (`CREATED`/`DRAFT`); Razorpay has only failed attempts; Pay still offered |
| F2 | Failure, then retry Success in the same window | funded by the second attempt, and we recorded *that* payment id |
| F3 | Close checkout without paying | review state; nothing at Razorpay |
| F4 | International card (name + email filled) | Razorpay refuses it ("International cards are not supported") or it fails at the bank; never funded |
| F5 | Pay, but the confirm call is lost | app says "still checking", never "failed"; the sweep finds the payment by order id |
| F6 | Razorpay's script blocked | clear error; nothing charged |
| F7 | Mastercard, wrong OTP | refused; order payable |
| F8 | Netbanking, bank Failure | nothing funded |
| F9 | Confirm lost, signed webhook arrives | released by the webhook, without waiting for the sweep |
| P1 | Pay from the order screen with nothing cached (as after a refresh) | the pay screen asks the server for the checkout, Razorpay opens, the order is funded (D-102) |
| P2 | A payment that has ended | no Pay and no Try Again offered |
| D1 | Create Order tapped twice in the same instant | one order, the pay screen, no refusal (fails on the pre-D-099 app) |
| S1 | Confirm with another order's real payment id | 400; nothing changes |
| S2 | Confirm with an id Razorpay does not know | 400; order still payable |
| S3 | Another restaurant confirms | 404, not 403 |
| S4 | Confirm an already-captured payment | no new ledger rows |
| S5 | Mock simulation endpoint on a real provider | 403 |
| W1 | Forged webhook signature | 400; not stored |
| W2 | Body tampered after signing | 400 |
| W3 | Valid webhook delivered twice | 200 both; stored once; ledger unmoved |
| W4 | Signed webhook with no event id | 400 malformed |
| W5 | Webhook for a payment we never made | 200; stored `IGNORED` |
| R1 | Refund without `Idempotency-Key` | refused |
| R2 | Refund with an unknown reason | 400 |
| R3 | Refund more than captured | refused; nothing at Razorpay |
| R4 | Same refund key sent twice | one refund at Razorpay |
| R5 | Refund on an uncaptured payment | 409 |

Webhook cases sign with the configured webhook secret, in Razorpay's payload
shape, with the event id in `X-Razorpay-Event-Id` — Razorpay itself cannot reach
localhost, so this stands in for delivery.

## Things that will trip you up

- **The OTP cooldown and hourly cap are real locally** (60 s, 10 an hour per
  number). The suite caches sessions in `.sessions.json` and takes back the
  tokens the app rotates, so a normal run spends at most one code. If you delete
  that file repeatedly you will wait.
- **F5 moves one payment's `updated_at` back ten minutes**, standing in for the
  two minutes the sweep waits before calling a payment stale. Nothing else in
  the suite writes to the database.
- **UPI is not covered.** The test account's checkout offers cards, netbanking
  and wallets only; `success@razorpay` / `failure@razorpay` cannot be reached
  until UPI is enabled on the account.
- **Razorpay's test mode is itself variable.** The same Visa can go to the demo
  bank page on one run and to an in-checkout OTP on the next, and the OTP can
  hang at "Sending OTP". The suite handles both routes, and each card case gets
  **one retry, always reported** — `PASS (…) [after 1 retry: <why>]`. A pass
  after a retry is not a clean pass; if one case needs it every run, look at it.
  Server-side cases take their captured payment from whichever of C1, C2, C3 or
  F2 succeeded, so one flaky card run does not fail eight unrelated cases.
- **Selectors are Razorpay's**, not ours (`data-testid=card`,
  `bottom-cta-button`, `confirm-positive`, `input[name=otp]`). If Razorpay
  changes its checkout, the card cases fail at a step name, not an assertion —
  re-probe the screen before suspecting our code.
