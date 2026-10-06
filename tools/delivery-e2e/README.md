# delivery-e2e: order tracking, end to end

Drives the real local stack (API on 7070, Expo web on 7071, MySQL, Pidge sandbox) through the delivery cases and
screenshots the buyer and supplier tracking screens at each state. LOCAL only.

- `driver.py`: stdlib helpers (API calls with idempotency keys, cached sessions, mysql CLI, signed Pidge webhooks,
  Pidge sandbox stages, screenshots through `shots.js`). Secrets (Pidge webhook secret, DB password) are read from
  `costonomy-mp-api/src/main/resources/application-local.properties` inside the script and never printed.
- `shots.js`: Node 22, no npm install. Spawns headless Chrome, one browser context per audience at 430x932, seeds the
  session tokens into localStorage (`mp.accessToken`, `mp.refreshToken`), waits for the expected texts, saves
  `out/shots/<case>-<audience>-<step>.png` plus the page innerText as `.txt`, and hands back the rotated tokens.
- `cases.py`: cases 1 to 12 (`python3 cases.py 1 2 3`; no argument runs all). Results go to `out/report.json`.
- `report.py`: renders `out/report.json` as a markdown table.

Needs: the API and web server running, the seeded accounts in `docs/ONBOARDING.md`, Google Chrome, Node 22, the
`mysql` client at `/usr/local/mysql/bin/mysql`.

Setup it changes and puts back (also on failure): the supplier store's operating hours (widened to all day, because
the store closes at night), and the outlet's coordinates for the no-partner cases (restored in `finally`).

Notes:
- OTP is requested once per number; after that `/auth/refresh` is used. `.sessions.json` is mode 600 and git-ignored.
- Card cases (2, 11c) and WALLET funding need Razorpay: `tools/razorpay-e2e` needs `npm install` and the wallet can
  only be topped up through Razorpay unless `providers.payment=MOCK`. Those steps are recorded as BLOCKED.
- `E2E_CLOCK=utc` makes the no-partner time shifts use `utc_timestamp(6)` instead of `now(6)`. Use it once the retry
  queries read the UTC clock (see REPORT.md, finding on the database time zone).
- The outbox relay runs auto-dispatch inline, so a slow Pidge booking can hold the delivery row back for minutes;
  the driver waits for it.
