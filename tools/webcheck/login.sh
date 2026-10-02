#!/bin/bash
# Put a signed-in session into the browser, without driving the OTP screens.
#
# Tokens are cached per phone and reused. The refresh token lasts 30 days, so
# after the first run this never touches the OTP endpoints at all — which matters
# because the resend cooldown is 60s on the local profile *on purpose*
# (CLAUDE.md), and re-requesting a code is the slowest thing in the loop.
#
# Tokens go straight into localStorage, which is where the web build keeps them
# (lib/session/storage.ts). Two seconds instead of ~35.
#
#   ./login.sh [phone] [start-path] [extra-cdp-steps-json]
set -e
PHONE="${1:-+919876500004}"
START="${2:-/restaurant}"
EXTRA="${3:-[]}"
B=${API:-http://localhost:7070/costonomy-mp-api}/api/v1
cd "$(dirname "$0")"
CACHE=".tokens-${PHONE//+/}.json"

field() { python3 -c "import sys,json;print((json.load(sys.stdin).get('data') or {}).get('$1',''))" 2>/dev/null; }

ACCESS=""
# 1. A cached refresh token is the cheap path.
if [ -f "$CACHE" ]; then
  OLD_REFRESH=$(python3 -c "import json;print(json.load(open('$CACHE'))['refreshToken'])" 2>/dev/null || echo "")
  if [ -n "$OLD_REFRESH" ]; then
    RES=$(curl -s -X POST "$B/auth/refresh" -H 'Content-Type: application/json' \
      -d "{\"refreshToken\":\"$OLD_REFRESH\"}")
    ACCESS=$(echo "$RES" | field accessToken)
    REFRESH=$(echo "$RES" | field refreshToken)
  fi
fi

# 2. Only when that fails do we spend an OTP.
if [ -z "$ACCESS" ]; then
  echo "no usable cached session — requesting a code"
  curl -s -X POST "$B/auth/otp/request" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$PHONE\",\"purpose\":\"LOGIN\"}" -o /dev/null
  sleep 1
  RES=$(curl -s -X POST "$B/auth/otp/verify" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$PHONE\",\"otp\":\"123456\",\"purpose\":\"LOGIN\"}")
  ACCESS=$(echo "$RES" | field accessToken)
  REFRESH=$(echo "$RES" | field refreshToken)
fi

[ -n "$ACCESS" ] || { echo "login failed: $RES"; exit 1; }
python3 -c "import json,sys;json.dump({'accessToken':sys.argv[1],'refreshToken':sys.argv[2]},open('$CACHE','w'))" "$ACCESS" "$REFRESH"

node cdp.js "http://localhost:7071/welcome" \
  "$(python3 mksteps.py "$ACCESS" "$REFRESH" "$START" "$EXTRA")"
