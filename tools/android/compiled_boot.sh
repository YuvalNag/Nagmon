#!/usr/bin/env bash
# Boots the staged app the way the phone holds it: byte-compiled with
# -OO, only .pyc files, phone variables set, no screen, and a PATH whose
# only git cannot run, as on phones that refuse it (PermissionError)
# (docs/kids/SDD_ANDROID.md §3). Catches in a minute what the APK build
# and the emulator catch in an hour. Fails if the game stops before
# SECONDS have passed.
#
# Usage: tools/android/compiled_boot.sh STAGED_APP_DIR [SECONDS]
set -eu

app=$(cd "$1" && pwd)
seconds=${2:-30}
python=$(command -v "${PYTHON:-python}")
timeout=$(command -v timeout)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cp -r "$app" "$work/app"
cd "$work/app"
rm -rf recipes .buildozer bin
"$python" -OO -m compileall -b -q -f . >/dev/null
find . -name '*.py' -delete
find . -name __pycache__ -prune -exec rm -rf {} +
mkdir -p "$work/private" "$work/bin"
: >"$work/bin/git"
chmod 644 "$work/bin/git"

set +e
ANDROID_PRIVATE="$work/private" HOME= SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy \
  PATH="$work/bin:$(dirname "$python")" \
  "$timeout" "$seconds" "$python" main.pyc >"$work/boot.log" 2>&1
code=$?
set -e

if [ "$code" -ne 124 ]; then
  echo "FAIL: the compiled app stopped after less than ${seconds}s (exit $code)"
  tail -40 "$work/boot.log"
  cat "$work/private/crash/last_crash.txt" 2>/dev/null || true
  exit 1
fi
echo "the compiled app ran for ${seconds}s"
