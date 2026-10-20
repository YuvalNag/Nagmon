#!/usr/bin/env bash
# Installs the APK on a running emulator, opens it like a child would,
# and checks that it is still running a few minutes later and fills the
# screen sideways (docs/kids/SDD_ANDROID.md §5). Leaves the log and the
# screenshots in smoke/, and prints small copies of them into the job log
# (tools/android/screen_shape.py), so they can be read without downloads.
#
# Usage: tools/android/smoke.sh DIR_WITH_APK [SECONDS]
set -u

apk=$(ls "$1"/*.apk | head -1)
wait_for=${2:-360}
pkg=org.nagmon.nagmon
out=smoke
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"

shot() {
  adb exec-out screencap -p > "$out/$1.png"
}

echo "installing $apk"
adb install -r "$apk" || { echo "FAIL: the APK did not install"; exit 1; }
# Big enough for six minutes, so the start (orientation, errors) is kept.
adb logcat -G 16M || true
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
  if [ "$waited" -eq 45 ]; then
    # The intro is on screen; a tap skips it, like a child would.
    shot screen-45s
    size=$(python3 "$here/screen_shape.py" shape "$out/screen-45s.png")
    if [[ $size =~ ^([0-9]+)x([0-9]+)$ ]]; then
      adb shell input tap $(( BASH_REMATCH[1] / 2 )) $(( BASH_REMATCH[2] / 2 ))
    else
      echo "no usable screenshot at 45s ($size)"
    fi
  fi
  if [ $((waited % 60)) -eq 0 ]; then
    shot "screen-${waited}s"
  fi
done

shot screen-last
adb logcat -d > "$out/logcat.txt"

for name in screen-45s screen-60s screen-last; do
  [ -f "$out/$name.png" ] || continue
  if ! python3 "$here/screen_shape.py" shape "$out/$name.png"; then
    echo "FAIL: $name is taller than wide: the game is not sideways"
    status=1
  fi
  echo "::group::$name (base64 JPEG)"
  python3 "$here/screen_shape.py" show "$out/$name.png" || true
  echo "::endgroup::"
done
if grep -qE "requestedOrientation=(1|7|9|12) " "$out/logcat.txt"; then
  echo "FAIL: the app asked Android for portrait"
  status=1
fi
echo "::group::frame rate (emulator, software drawing: slower than a phone)"
grep -E "frame rate:" "$out/logcat.txt" | tail -20
echo "::endgroup::"

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
