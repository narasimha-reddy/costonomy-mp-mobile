# delivery-e2e: order tracking, end to end

Drives the merged local stack (API on 7080, Expo web on 7074, MySQL in the `merged-mysql` Docker container, Pidge sandbox) through the delivery cases and
screenshots the buyer and supplier tracking screens at each state. LOCAL only.

- `driver.py`: stdlib helpers (API calls with idempotency keys, cached sessions, mysql CLI, signed Pidge webhooks,
  Pidge sandbox stages, screenshots through `shots.js`). Secrets are never printed: the Pidge webhook secret comes from `PIDGE_WEBHOOK_SECRET` first, then from
  `costonomy-mp-api/src/main/resources/application-local.properties` (optional file).
- `shots.js`: Node 22, no npm install. Spawns headless Chrome, one browser context per audience, each shot at widths 360, 390 and 412 (`SHOT_WIDTHS`, files `...-w360.png`), seeds the
  session tokens into localStorage (`mp.accessToken`, `mp.refreshToken`), waits for the expected texts, saves
  `out/shots/<case>-<audience>-<step>.png` plus the page innerText as `.txt`, and hands back the rotated tokens.
- `cases.py`: cases 1 to 12 (`python3 cases.py 1 2 3`; no argument runs all). Results go to `out/report.json`.
- `report.py`: renders `out/report.json` as a markdown table.

Needs: the API and web server running, the seeded accounts in `docs/ONBOARDING.md`, Google Chrome, Node 22, Docker
(Colima) for the database command. Ports 7070, 7071 and 3306 belong to other stacks and are never used.

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

## Running against the merged stack

Environment (all optional; defaults shown):

| variable | default | meaning |
|---|---|---|
| `API` | `http://localhost:7080/costonomy-mp-api` | API base |
| `WEB` | `http://localhost:7074` | Expo web |
| `MYSQL_CMD` | `docker exec -i merged-mysql mysql -uroot -proot costonomy_mp` | full command prefix; `-N -B -e <sql>` is appended |
| `PIDGE_WEBHOOK_SECRET` | from `application-local.properties` | signs the simulated Pidge webhooks; never printed |
| `SHOT_WIDTHS` | `360,390,412` | web screenshot widths |
| `DELIVERY_PROVIDER` | detected | force `PIDGE` or `MOCK`; otherwise read from `API_LOG` (file), the `delivery_provider` table and the latest delivery |
| `E2E_CLOCK`, `KEEP_HOURS`, `CHROME_PATH` | as before | |

```
export PATH=$HOME/.local/opt/docker:$PATH DOCKER_HOST=unix://$HOME/.colima/default/docker.sock   # driver also sets these if unset
cd tools/delivery-e2e
python3 driver.py --self-test          # prints the API/WEB/DB it would use; fails on 7070/7071/3306; no network, no writes
python3 -m unittest test_selftest      # same wiring checks as unit tests
python3 cases.py 1 3 5                 # Pidge regression cases (BLOCKED, not FAIL, if the stack is on MOCK)
python3 simulate_riders.py 25          # rider simulator: signed Pidge webhooks, one stage per 25 s
python3 stage.py <orderId> assign      # one manual stage; or the supplier SandboxControlCard (POST /deliveries/{id}/sandbox/advance)
./android_shots.sh C3 01-searching     # screencap on emulator-5554 and emulator-5556 -> out/shots/C3-emu5554-01-searching.png
```

Detection: when `delivery_provider` lists both the mocks and PIDGE as enabled (the merged DB does) and neither `DELIVERY_PROVIDER` nor `API_LOG` decides, the provider is UNKNOWN: Pidge tools proceed, the mock helper stays BLOCKED. Set `DELIVERY_PROVIDER=PIDGE` to be exact.

Provider facts: the merged stack runs `DELIVERY_PROVIDER=PIDGE` (sandbox), which removes the mock partners. Pidge statuses
only move through signed webhooks (`simulate_riders.py`, `stage.py`) or the supplier sandbox-advance endpoint. The mock-only
helper (`driver.mock_simulate`, the `/internal/deliveries/{id}/simulate` endpoint and the mock panel) and the Pidge-only
scripts each check the provider and say BLOCKED instead of failing when it is the other one. The seeded outlet is at
(12.9784, 77.6408). Nothing here calls Pidge's network by itself; `stage.py`/`simulate_riders.py`/`cases.py` go through the
API's sandbox endpoint, so do not run them unless that is wanted.
