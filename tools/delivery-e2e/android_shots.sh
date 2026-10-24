#!/usr/bin/env bash
# One screenshot per emulator for a case step: adb -s <serial> exec-out screencap -p.
# usage: android_shots.sh <case> <step> [--dry-run]
#   writes out/shots/<case>-<target>-<step>.png, target = emu5554, emu5556 (the serial without the dash)
# env:   SERIALS="emulator-5554 emulator-5556"  (default)   OUT_DIR=<folder> (default tools/delivery-e2e/out/shots)
#        ADB=<path to adb> (default: adb on PATH, else $ANDROID_HOME/platform-tools/adb)
# Only ever talks to the serials given with -s; never starts, kills or restarts the adb server's devices.
set -u
CASE="${1:-}"; STEP="${2:-}"; DRY="${3:-}"
if [ -z "$CASE" ] || [ -z "$STEP" ]; then
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 2
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${OUT_DIR:-$HERE/out/shots}"
SERIALS="${SERIALS:-emulator-5554 emulator-5556}"
ADB="${ADB:-$(command -v adb || true)}"
[ -z "$ADB" ] && [ -n "${ANDROID_HOME:-}" ] && ADB="$ANDROID_HOME/platform-tools/adb"
if [ "$DRY" != "--dry-run" ] && { [ -z "$ADB" ] || [ ! -x "$ADB" ]; }; then
  echo "BLOCKED: adb not found (set ADB or ANDROID_HOME)"; exit 3
fi
mkdir -p "$OUT_DIR"
rc=0
for s in $SERIALS; do
  target="emu${s##*-}"
  png="$OUT_DIR/${CASE}-${target}-${STEP}.png"
  if [ "$DRY" = "--dry-run" ]; then echo "would run: adb -s $s exec-out screencap -p > $png"; continue; fi
  state="$("$ADB" -s "$s" get-state 2>/dev/null || true)"
  if [ "$state" != "device" ]; then echo "BLOCKED: $s is not online (state: ${state:-none})"; rc=1; continue; fi
  if "$ADB" -s "$s" exec-out screencap -p > "$png.tmp" && [ -s "$png.tmp" ]; then
    mv "$png.tmp" "$png"; echo "saved $png"
  else
    rm -f "$png.tmp"; echo "FAIL: screencap on $s"; rc=1
  fi
done
exit $rc
