#!/bin/bash
# Put a signed-in session into the browser, without driving the OTP screens.
#
# Sign-in is costonomy-common-api's (COMMON, default http://localhost:8082): phone + code
# as the mp-mobile client, code 123456 in common's dev profile. Tokens are cached per
# phone and reused; common rotates the refresh token, so the new one is saved each time.
# After the first run this rarely asks for a code, which has a resend cooldown.
#
# Tokens go straight into localStorage, which is where the web build keeps them
# (lib/session/storage.ts). Two seconds instead of ~35.
#
#   ./login.sh [phone] [start-path] [extra-cdp-steps-json]
set -e
PHONE="${1:-+919876500004}"
START="${2:-/restaurant}"
EXTRA="${3:-[]}"
C=${COMMON:-http://localhost:8082}/costonomy-common-api/v1/auth
cd "$(dirname "$0")"
CACHE=".tokens-${PHONE//+/}.json"

field() { python3 -c "import sys,json;print((json.load(sys.stdin) or {}).get('$1',''))" 2>/dev/null; }

ACCESS=""
# 1. A cached refresh token is the cheap path.
if [ -f "$CACHE" ]; then
  OLD_REFRESH=$(python3 -c "import json;print(json.load(open('$CACHE'))['refreshToken'])" 2>/dev/null || echo "")
  if [ -n "$OLD_REFRESH" ]; then
    RES=$(curl -s -X POST "$C/refresh" -H 'Content-Type: application/json' \
      -d "{\"refreshToken\":\"$OLD_REFRESH\",\"clientId\":\"mp-mobile\"}")
    ACCESS=$(echo "$RES" | field accessToken)
    REFRESH=$(echo "$RES" | field refreshToken)
  fi
fi

# 2. Only when that fails do we ask for a code.
if [ -z "$ACCESS" ]; then
  echo "no usable cached session — requesting a code"
  CHALLENGE=$(curl -s -X POST "$C/otp/send" -H 'Content-Type: application/json' \
    -d "{\"channel\":\"SMS\",\"target\":\"$PHONE\",\"purpose\":\"LOGIN\",\"clientId\":\"mp-mobile\"}" | field challengeId)
  RES=$(curl -s -X POST "$C/otp/verify" -H 'Content-Type: application/json' \
    -d "{\"challengeId\":\"$CHALLENGE\",\"code\":\"${OTP:-123456}\",\"clientId\":\"mp-mobile\"}")
  ACCESS=$(echo "$RES" | field accessToken)
  REFRESH=$(echo "$RES" | field refreshToken)
fi

[ -n "$ACCESS" ] || { echo "login failed: $RES"; exit 1; }
python3 -c "import json,sys;json.dump({'accessToken':sys.argv[1],'refreshToken':sys.argv[2]},open('$CACHE','w'))" "$ACCESS" "$REFRESH"

node cdp.js "http://localhost:7071/welcome" \
  "$(python3 mksteps.py "$ACCESS" "$REFRESH" "$START" "$EXTRA")"
