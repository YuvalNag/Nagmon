#!/usr/bin/env bash
# Installs the APK on a running emulator, opens it like a child would,
# and checks that it is still running a few minutes later
# (docs/kids/SDD_ANDROID.md §5). Leaves the log and a screenshot in smoke/.
#
# Usage: tools/android/smoke.sh DIR_WITH_APK [SECONDS]
set -u

apk=$(ls "$1"/*.apk | head -1)
wait_for=${2:-360}
pkg=org.nagmon.nagmon
out=smoke
mkdir -p "$out"

echo "installing $apk"
adb install -r "$apk" || { echo "FAIL: the APK did not install"; exit 1; }
adb logcat -c
adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null

status=0
waited=0
while [ "$waited" -lt "$wait_for" ]; do
  sleep 15
  waited=$((waited + 15))
  if ! adb shell pidof "$pkg" >/dev/null; then
    echo "FAIL: the app stopped after about ${waited}s"
    status=1
    break
  fi
  echo "still running after ${waited}s"
  if [ $((waited % 60)) -eq 0 ]; then
    adb exec-out screencap -p > "$out/screen-${waited}s.png"
  fi
done

adb exec-out screencap -p > "$out/screen-last.png"
adb logcat -d > "$out/logcat.txt"

echo "::group::what the app wrote (python, SDL, crashes)"
grep -E "python|SDL|PythonActivity|AndroidRuntime|DEBUG  |libc  |F/|Traceback|Error" \
  "$out/logcat.txt" | tail -400
echo "::endgroup::"

if grep -q "Traceback" "$out/logcat.txt"; then
  echo "FAIL: Python raised an error (see the group above)"
  status=1
fi
[ "$status" -eq 0 ] && echo "the app opened and kept running for ${wait_for}s"
exit "$status"
