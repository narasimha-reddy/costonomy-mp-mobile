# Onboarding — costonomy-mp-mobile

For a developer joining Mandi and working through Claude Code. Read this once,
then let `CLAUDE.md` do the rest.

Last updated **27 September 2026**, from the Razorpay branches
(`feat/razorpay-4-checkout` → `-5-order-double-tap` → `-6-e2e-suite` →
`-9-pay-screen-fixes` → `-10-capture-at-dispatch`), which build
on `feat/edit-open-request-quantities`.

---

## 0. How context works here

Claude Code does not inherit anyone's previous session. On startup it reads
`CLAUDE.md` and whatever you point it at — nothing else. Everything this project
knows is therefore **committed to this repo**, and the corollary is the one habit
that matters:

> When you settle something the next person would otherwise have to rediscover,
> write it into a file. A decision explained in a chat window is a decision lost.

`docs/DECISIONS.md` is where non-obvious choices go, numbered, with the reasoning
and what was rejected. There are 97 of them.

**Read in this order.** Claude picks up `CLAUDE.md` on its own.

| File | What it gives you |
|---|---|
| `CLAUDE.md` | how to work here, and the rules that are not negotiable |
| `theme/README.md` | the design system and its rules |
| `docs/specs/05-mobile-screens.md` | the screen inventory and UX contract |
| `docs/specs/MANDI_Claude_Code_Implementation_PRD_v2.2.md` §23A | **binding** UI specification, not design guidance |
| `docs/DECISIONS.md` | D-001…D-097 |

The backend repo `costonomy-mp-api` carries a copy of `docs/specs/`. They are
meant to be identical; if they have drifted, say so rather than picking one.

---

## 1. Get it running

You need the backend too — this app has no mock server and is not useful
without one.

```bash
nvm use            # Node 22, pinned in .nvmrc
npm install
cp .env.example .env
npm run web        # http://localhost:7071
```

Then follow `costonomy-mp-api/docs/ONBOARDING.md` to get the API up on port
**7070** and seeded. Without the seed the catalog is empty and every screen
looks broken in a way that is not your fault.

### Accounts

OTP is `123456` for all of them on the local profile.

| Phone | Who |
|---|---|
| `+919876500004` | Spice Garden, Indiranagar — restaurant |
| `+919876500007` | Tandoor House, Koramangala — restaurant |
| `+919876511001` | Sri Balaji — supplier |
| `+919876511002` | Metro Fresh Supplies — supplier |
| `+919876511003` | Deccan Wholesale — supplier |

The **resend cooldown and attempt limits are real** locally, deliberately —
those paths are part of the product. Re-requesting a code for the same number
inside a minute gives you a genuine 429, and then `OTP_EXPIRED` if you try to use
the old one.

### Checks

All three must pass before a PR:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint, including the colour-literal guard
npm test            # jest
```

Open `/design-system` in the running app for a live gallery of every primitive.
**Check it before building a new component** — the answer is usually already
there, and a screen that rolls its own is how two "the same" buttons end up
different.

---

## 2. Checking a screen

**The web build in Chrome is the default way to look at a screen**, not the iOS
simulator. It is faster, it is scriptable, and it is what this project has been
verified against throughout.

Two things that will waste your time otherwise:

- **`react-native-maps` does not run on web.** Anything rendering a map needs a
  web fallback or it cannot be checked this way at all.
- **expo-router keeps the previous screen mounted.** A `document.querySelector`
  that grabs the first match will find the *old* screen's element. Filter for
  visibility before asserting on anything.

### Driving it from Claude

`tools/webcheck/` holds a small Chrome DevTools Protocol driver, so Claude can
open a screen, act on it and screenshot it rather than telling you what it
believes the code does.

```bash
# Chrome with a debugging port, once per session
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9333 --headless=new \
  --user-data-dir=/tmp/webcheck-profile &

# Sign in and land on a screen, skipping the OTP screens entirely
tools/webcheck/login.sh +919876500004 /restaurant/cart \
  '[{"wait":2000},{"shot":"cart.png"}]'
```

`login.sh` caches the refresh token per phone, so after the first run it never
touches the OTP endpoints — which matters, because the 60-second cooldown is
real and re-requesting a code is the slowest thing in the loop.

Step keys are `eval`, `wait`, `shot`, `report` and `setFile` — note it is `shot`,
not `screenshot`. `tools/webcheck/README.md` has the detail.

**Ask for the screenshot.** The single habit that has caught the most bugs on
this project is requiring visual evidence instead of a claim — a stale
accessibility label, a stepper pushed onto its own line, a card that never went
away after an acceptance. None of those fail a type check.

---

## 3. How we work

### Branches

One branch per developer per piece of work, cut from `main`:

```bash
git checkout main && git pull
git checkout -b feat/<short-name>
```

`main` is the integration point. Do not cut a branch from someone else's branch.

### Pull requests

Open a PR even for small things. **There is no CI in this repo yet** — the API
repo has `.github/workflows/ci.yml`, this one has nothing — so until that is
fixed, running the three checks yourself before pushing is the only gate that
exists. Adding a workflow that runs typecheck, lint and test is a good first
contribution.

### The rules that are not negotiable

`CLAUDE.md` has them in full. The four that come up most:

- **The server owns business truth.** Never compute a price, GST, total,
  commission or credit balance on the client. `utils/money.ts` formats and
  deliberately has no arithmetic.
- **Never advance a state because the user tapped something.** Render the status
  the API returned. A toast is not a confirmation.
- **Never hide or silently change a commercial fact.** A changed price is shown
  old *and* new and confirmed. Unmet quantities survive rejection and timeout.
- **Accessibility is not optional** (§23A.48): a semantic label on every icon, a
  44pt minimum touch target (`hitSlopFor()` when the glyph is smaller), never
  convey meaning by colour alone, and every animation checks `useReducedMotion()`.

And one that is easy to miss: **never fabricate a metric** (doc 07 §4). A
supplier with no order history has no fill rate, and a number typed into a
landing page is not a measurement.

---

## 4. Working with Claude Code in this repo

**Give it a scope, not a subject.** "Improve the cart" produces sprawl. The
screen, the spec section that binds it, the D-numbers it must not re-litigate,
and what done means. One paragraph.

**Work screen by screen and look at each one.** This app was built that way, and
the reason is that the defects that matter here are visual and behavioural — a
label that no longer matches where a tap goes, a disabled button with no
explanation, a delete icon as loud as the product name beside it.

**Point it at the decision, not just the code.** If something looks wrong, there
is a decent chance `docs/DECISIONS.md` explains why. Ask for the D-number before
asking for the rewrite.

---

## 5. State of play — 27 September 2026

Both role experiences are built: restaurant and supplier, from onboarding
through discovery, requests, orders, payment, credit, delivery, receiving and
disputes.

### Latest: Razorpay payments

Four stacked PRs; the server side is in `costonomy-mp-api` (D-098 to D-102).

- **The pay screen opens Razorpay's own checkout** when the server runs on
  Razorpay — checkout.js on web, `react-native-razorpay` on iOS and Android — and
  keeps the simulation on the mock (`lib/payments/checkout.ts`, `docs/RAZORPAY.md`).
  The app sends no amount; closing the window returns to review, not failure.
- **A second tap on Create Order is the same order**, not a second one. The key
  used to be minted per call, so a double tap was refused on the spent delivery
  quote while the order had in fact been placed.
- **The pay screen asks the server what happened** (`feat/razorpay-9-pay-screen-fixes`,
  from three independent reviews). Every ending — paid, try again, or over — comes
  from the server's `fundsSecured` and whether the payment is still payable, never
  from a guess: a closed window or a native error asks first, "Try Again" is shown
  only while the order can still be paid, and the checkout is fetched from the
  server (D-102), so an order can be paid after a refresh or from the order
  screen's new **Pay Now**. A "still in progress" reply keeps the Create Order key.
- **`tools/razorpay-e2e`** pays real test-mode orders through this app and
  Razorpay's checkout — 31 cases, most of them failures — and checks both our
  database and Razorpay's records. Its README says how to run it.
- **Money is taken when the supplier marks the order ready**, not at payment
  (`feat/razorpay-10-capture-at-dispatch`, API D-103). Until then it is only held,
  so a cancellation drops the hold instead of refunding. The e2e suite now marks
  orders ready itself before expecting a capture, and F10 checks a cancellation
  while held. No app code changed.

What you will notice:

- Against a server on Razorpay, **Pay** opens a payment window. Against the
  local mock, nothing changes.
- **Native needs a development build** (`npx expo prebuild`, then
  `npx expo run:ios|android`). Expo Go cannot load Razorpay's SDK and says so.
- `npm run lint` is clean now — `tools/webcheck/cdp.js` declares `Buffer`.

### Earlier, on `feat/edit-open-request-quantities`

- **Cart** grouped by supplier and collapsible, sending per supplier, with
  Create Request and Create Order side by side where the store allows direct
  orders (D-094).
- **Chat** between an outlet and a store, reachable from a header action and from
  a request or order, which it can then share as a deep link (D-095).
- **SKU pages** with description, dimensions, an image rail, video and reviews;
  every place a SKU appears now opens one (D-096).
- **Supplier shelf** showing whether that supplier has given this outlet credit,
  with the position as a bar, an ETA and a rating (D-093).
- **Store contacts** in onboarding and settings, seeded from the supplier's
  (D-097).

### Open, and genuinely undecided

Do not close one of these silently.

1. **Chat polls.** 8s inside a thread, 20s for the inbox. The backend publishes
   the events to the outbox ready for a realtime channel that is not wired up.
2. **Supplier and popular lists do not filter by serviceability**, unlike product
   comparison — so a restaurant can be shown a supplier who cannot deliver to
   them. Bug or deliberate reach, undecided.
3. **The cart lost lines twice**, observed on screen and confirmed against the
   database, and could not be reproduced across a plain load, expand-all,
   expand-and-scroll or a 50-second idle poll. It is recorded here rather than
   closed, because it happened.
4. **The Razorpay checkout has not run on a phone.** Web only so far — a
   development build is needed. **UPI is untested** too: the Razorpay test
   account's checkout doesn't offer it yet.
5. **This repo's `docs/DECISIONS.md` stops at D-088**, while
   `costonomy-mp-api`'s carries D-089 to D-099 as well, and the two `docs/specs/`
   copies differ. §0 says to report drift rather than pick a side: this is that report.
