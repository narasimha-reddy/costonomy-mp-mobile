# webcheck — drive the web build from a script

A small Chrome DevTools Protocol driver, so a screen can be opened, acted on and
screenshotted from the command line. It exists so that "I changed the cart" can
be answered with a picture of the cart rather than a description of the diff.

It is a development tool, not a test suite. There are no assertions here — use
`npm test` for those. This is for looking.

## Setup

Chrome with a debugging port, once per session:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9333 --headless=new \
  --user-data-dir=/tmp/webcheck-profile &
```

Port 9333 by default; override with `CDP_PORT`. Drop `--headless=new` if you want
to watch it happen.

You also need `npm run web` on port 7071 and the API on 7070, seeded.

## Signing in

```bash
tools/webcheck/login.sh [phone] [start-path] [extra-steps-json]
```

```bash
tools/webcheck/login.sh +919876500004 /restaurant/cart \
  '[{"wait":2000},{"shot":"cart.png"}]'
```

Tokens go straight into `localStorage`, which is where the web build keeps them
(`lib/session/storage.ts`), and are cached per phone in a gitignored
`.tokens-<phone>.json`. The refresh token lasts thirty days, so after the first
run this never touches the OTP endpoints at all.

That last part is the point. **The resend cooldown is 60 seconds on the local
profile deliberately** — it is part of the product, not a test obstacle — so
re-requesting a code is the slowest thing in the loop. Two seconds instead of
thirty-five.

Override the backend with `API=http://host:port/context`.

## Steps

The second argument to `cdp.js`, and the third to `login.sh`, is a JSON array of
steps run in order:

| Key | Does |
|---|---|
| `eval` | runs JavaScript in the page and logs the result |
| `wait` | milliseconds |
| `shot` | writes a PNG to that path — note it is `shot`, **not** `screenshot` |
| `report` | dumps matching rendered text |
| `setFile` | drives a real `<input type=file>`, for the image picker on web |

```bash
node tools/webcheck/cdp.js http://localhost:7071/restaurant \
  '[{"wait":3000},{"eval":"document.title"},{"shot":"home.png"}]'
```

## Two things that will catch you out

**expo-router keeps the previous screen mounted.** A `document.querySelector`
that grabs the first match will find the *old* screen's element and you will
assert happily against a screen nobody is looking at. Filter for visibility.

**`react-native-maps` does not run on web.** Anything rendering a map needs a web
fallback or it cannot be checked here at all.
