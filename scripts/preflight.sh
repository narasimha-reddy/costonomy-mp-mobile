#!/bin/bash
# Before the dev server starts: are the two APIs this app talks to answering? Run by npm run start:local / start:test /
# start:prod / web.
#
#   local  costonomy-mp-api and costonomy-common-api at the addresses the app will use (.env.local, else the
#          defaults: localhost:7070 and localhost:8082). If either is down, starts the local stack with
#          costonomy-mp-api's ./run.sh (found through MP_API_REPO, else beside this repo) and waits for it.
#   test   testapi.costonomy.com; production: api.costonomy.com. Only checked: a server that is down is reported.
set -uo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-local}"

value() { sed -nE "s/^$1=//p" .env.local 2>/dev/null | tail -1 | sed -E "s/^['\"]//; s/['\"]$//; s#/\$##"; }
health() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$1/actuator/health" || true; }

case "$MODE" in
  local) API="$(value EXPO_PUBLIC_API_URL)"; API="${API:-http://localhost:7070/costonomy-mp-api}"
         COMMON="$(value EXPO_PUBLIC_COMMON_API_URL)"; COMMON="${COMMON:-http://localhost:8082/costonomy-common-api}" ;;
  test)  API=https://testapi.costonomy.com/costonomy-mp-api; COMMON=https://testapi.costonomy.com/costonomy-common-api ;;
  prod)  API=https://api.costonomy.com/costonomy-mp-api; COMMON=https://api.costonomy.com/costonomy-common-api ;;
  *) echo "usage: $0 local|test|prod" >&2; exit 1 ;;
esac

check() {
  a=$(health "$API"); c=$(health "$COMMON")
  printf '  mp-api      %s  %s\n  common-api  %s  %s\n' "$a" "$API" "$c" "$COMMON"
  [ "$a" = 200 ] && [ "$c" = 200 ]
}

echo "Checking the APIs ($MODE)…"
if check; then echo "✓ Both answer."; exit 0; fi

if [ "$MODE" != local ]; then
  echo "✗ The $MODE servers aren't both answering; not starting. (Is MP deployed there yet?)" >&2
  exit 1
fi

repo="${MP_API_REPO:-}"
[ -n "$repo" ] || for d in ../costonomy-mp-api "$HOME/Documents/costonomy-mp/costonomy-mp-api"; do
  [ -x "$d/run.sh" ] && { repo="$d"; break; }
done
[ -x "${repo:-}/run.sh" ] || { echo "✗ Not running, and costonomy-mp-api wasn't found to start it (set MP_API_REPO)." >&2; exit 1; }
echo "Starting the local stack with $repo/run.sh (its checks run first)…"
"$repo/run.sh" || { echo "✗ The stack didn't start; see above." >&2; exit 1; }
if check; then echo "✓ Both answer."; exit 0; fi
echo "✗ Still not answering at these addresses: check EXPO_PUBLIC_API_URL / EXPO_PUBLIC_COMMON_API_URL in .env.local." >&2
exit 1
