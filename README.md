# costonomy-mp-mobile

React Native app for **Mandi**, Costonomy's restaurant procurement marketplace.
One app with Restaurant and Supplier experiences.

## Getting started

```bash
nvm use            # Node 22
npm install
npm start          # then press i / a, or scan the QR
```

Open `/design-system` in the running app to browse every UI primitive.

```bash
npm run typecheck
npm run lint
npm test
```

## Where to look

| | |
|---|---|
| `docs/ONBOARDING.md` | **start here** — setup, seed accounts, how we work, what is in flight |
| `CLAUDE.md` | how to work in this repo, and the rules that are not negotiable |
| `theme/README.md` | the design system |
| `docs/specs/` | the full specification set |
| `docs/DECISIONS.md` | decisions the specs don't settle, plus open questions |

Backend: `costonomy-mp-api`.

## Status

Both role experiences are built — restaurant and supplier, from onboarding
through discovery, requests, orders, payment, credit, delivery, receiving and
disputes. `docs/ONBOARDING.md` §5 has the current state and the open questions.

You need `costonomy-mp-api` running on port 7070 and seeded; this app has no
mock server.
