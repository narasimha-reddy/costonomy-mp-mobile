# costonomy-mp-mobile

React Native app for **Mandi** — Costonomy's restaurant procurement marketplace.
One app, two role-based experiences: Restaurant and Supplier.

Backend lives in `costonomy-mp-api` (sibling repo).

## Read before writing code

1. `docs/specs/00-README.md` — entry point to the specification
2. `docs/specs/05-mobile-screens.md` — the screen inventory and UX contract
3. `docs/specs/MANDI_Claude_Code_Implementation_PRD_v2.2.md` §23A — **binding** UI
   specification, not design guidance
4. `docs/DECISIONS.md` — decisions the specs don't settle, and the open ones
5. `theme/README.md` — the design system and its rules

Where the specs disagree, `docs/DECISIONS.md` D-001 says which wins:
the numbered `00`–`10` docs and PRD v2.2 are authoritative;
`Mandi_Engineering_PRD_v1.0.md` is background only.

## Stack

Expo SDK 55 · React Native 0.83 · React 19 · expo-router · TypeScript (strict)
· TanStack Query · expo-secure-store · Source Sans 3

Versions deliberately match `costonomy-mobile-app` (D-003). When that repo
upgrades Expo, follow it rather than diverging.

## Layout

```
app/            expo-router routes (file-based)
theme/          design tokens — colours, type, spacing, layout, motion
components/
  common/       the Mandi* primitives. Look here before building anything.
  product/ supplier/ procurement/ order/ delivery/ credit/
                domain components, built alongside their screens
lib/            cross-cutting: api client, server clock, storage
services/       API calls grouped by domain
hooks/          reusable hooks
models/         API types and their presentation mappings
utils/          pure helpers
tests/          jest
docs/specs/     the specification set (shared with costonomy-mp-api)
```

`theme/` here is `constants/` in costonomy-mobile-app. Same idea, clearer name.
`constants/` in this repo is for non-visual constants only.

## Commands

```bash
npm start          # expo dev server
npm run web        # expo on http://localhost:7071 — the default way to check a screen
npm run typecheck  # tsc --noEmit
npm run lint       # eslint — includes the colour-literal guard
npm test           # jest
```

All three must pass before a PR. `npm start` then opening `/design-system` shows
a live gallery of every primitive — check it before building a new component.

### Checking a screen against a real backend

Run the API on the `local` profile (port 7070) and `npm run web` (port 7071). The local profile fixes the
OTP at `123456` (`costonomy.mp.otp.mock-code`), so any number signs in — but the
**resend cooldown and attempt limits are real**, which is deliberate: those paths
are part of the screen. Expect a genuine 429 if you re-request a code for the same
number inside a minute.

Two things that will waste your time otherwise:

- **`react-native-maps` does not run on web.** Anything that renders a map needs a
  web fallback, or it cannot be checked this way at all.
- **expo-router keeps the previous screen mounted.** A `document.querySelector`
  that grabs the first match will find the *old* screen's element. Filter for
  visibility before asserting on anything.

## Rules that are not negotiable

These come from the PRD's guardrails and are the difference between a demo and a
procurement system people trust with money.

**The server owns business truth. The app is a projection of it.**
- Never compute a price, GST, total, commission or credit balance on the client.
  Format what the API returned (`utils/money.ts` formats; it deliberately has no
  arithmetic).
- Never advance a state because the user tapped something. Render the status the
  API returned. An order is CONFIRMED when the backend says so.
- Never show "Payment successful", "Order placed" or a delivery state the backend
  has not confirmed. A toast is not a confirmation — navigate to the
  authoritative state instead.
- Never claim a mutation succeeded while offline.

**Never hide or silently change commercial facts.**
- A price that changed is shown explicitly, old and new, and requires the user's
  confirmation (`MandiPriceChange`). Never reprice silently.
- Unmet requirement quantities survive rejection, timeout and partial acceptance.
  Never drop them.
- Delivery provider bidding is internal. The restaurant sees one fee, never quotes.
- Commission never affects ranking, and never appears as a ranking factor in UI.

**Time and freshness.**
- The supplier countdown reads the **server** deadline via `lib/server-clock.ts`,
  never `Date.now()` directly, and recomputes from the deadline rather than
  decrementing — see `MandiCountdown` for why.
- Stale driver GPS is shown as stale and the marker stops. Never interpolate
  movement.

**Every network-dependent screen implements** loading, empty, error + retry,
offline and (where material) stale. No infinite spinners. Skeletons for
structured content, spinners only for small indeterminate actions.

**Idempotency.** Disabling a button while a request is in flight is a courtesy to
the user, not a correctness mechanism. Mutations still send an `Idempotency-Key`
(`docs/specs/04-api-specification.md` §21).

**Accessibility** (§23A.48): semantic labels on every icon, 44pt minimum touch
target (`hitSlopFor()` when the glyph is smaller), never convey meaning by colour
alone, and every animation checks `useReducedMotion()`.

## Naming

"Mandi" is a **working product name and is not final.** It appears in user-facing
strings and in `Mandi*` component names only. It must never enter the repo name,
the package (`com.costonomy.mp`), the database (`costonomy_mp`), environment
variable prefixes or infrastructure names. Keep visible strings centralised so a
rename stays a config change.
