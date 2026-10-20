/**
 * The APK on an Android emulator, checked through its real WebView:
 * Playwright connects to the WebView's DevTools socket over adb, so the
 * same selectors as the browser tests work on the phone's own engine
 * (docs/app/SDD.md §6, layer 3).
 *
 * Usage (on the CI host, emulator booted):
 *   node tests/android/run.mjs APK OUTDIR
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebViewPage } from "./cdp.mjs";

const PACKAGE = "org.nagmon.app";
// docs/app/SDD.md §5: on the emulator a tap shows within 300 ms (one outlier allowed)
const MAX_TAP_MS = 300;
const apk = process.argv[2];
const out = process.argv[3] ?? "android-e2e";
mkdirSync(out, { recursive: true });

const adb = (...args) =>
  execFileSync("adb", args, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
}

/**
 * A screenshot of the whole phone screen. The workflow prints each one
 * into the job log as a small JPEG (tools/android/screen_shape.py show).
 */
function shot(name) {
  // a full-size PNG is over a megabyte, node's default output limit
  const png = execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 });
  const path = join(out, `${name}.png`);
  writeFileSync(path, png);
  return path;
}


/** Waits for a fresh boot: the marker set before the reboot is gone and the boot is complete. */
async function bootedAgain() {
  for (let i = 0; i < 240; i++) {
    try {
      if (adb("shell", "getprop", "debug.nagmon.before_reboot") === "" && adb("shell", "getprop", "sys.boot_completed") === "1") {
        return;
      }
    } catch {
      // adb drops while the emulator reboots
    }
    await sleep(1000);
  }
  throw new Error("the emulator did not come back after the reboot");
}

/**
 * The family's phone is set to Hebrew. `cmd locale` exists only on newer
 * Android; else the locale property is set (as root) and the emulator
 * rebooted. Not a zygote restart: sys.boot_completed stays "1" through
 * it, so the wait ended at once, the app was installed and started while
 * the system was still coming back, and Android killed it.
 */
async function setHebrew() {
  try {
    adb("shell", "cmd", "locale", "set-system-locales", "he-IL");
  } catch {
    adb("root");
    await sleep(3000);
    adb("wait-for-device");
    adb("shell", "setprop", "persist.sys.locale", "he-IL");
    // a property a reboot clears: it tells the new boot from the old one
    adb("shell", "setprop", "debug.nagmon.before_reboot", "1");
    adb("reboot");
    await bootedAgain();
    // the lock screen is back after a reboot
    adb("shell", "input", "keyevent", "82");
    try {
      adb("shell", "wm", "dismiss-keyguard");
    } catch {
      // older Android: the key event is enough
    }
  }
  const locale = adb("shell", "getprop", "persist.sys.locale");
  console.log("system locale:", locale);
  check(locale.startsWith("he"), "the emulator is set to Hebrew");
}

/** Waits until the system (after a restart) can install and start apps. */
async function systemReady() {
  for (let i = 0; i < 120; i++) {
    try {
      if (
        adb("shell", "getprop", "sys.boot_completed") === "1" &&
        adb("shell", "pm", "path", "android").startsWith("package:")
      ) {
        return;
      }
    } catch {
      // adb drops while the system restarts
    }
    await sleep(1000);
  }
  throw new Error("the emulator did not come back after the language change");
}

/** Starts the app; retried, since the launcher may still be warming up. */
async function launch() {
  for (let i = 0; i < 20; i++) {
    try {
      console.log(adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`));
      // is it alive? (the flaky runs had no process at all)
      await sleep(1000);
      let pid = "";
      try {
        pid = adb("shell", "pidof", PACKAGE);
      } catch {
        // pidof exits 1 when there is none
      }
      console.log("app pid:", pid || "none");
      const procs = adb("shell", "dumpsys", "activity", "processes");
      console.log(procs.split("\n").filter((l) => l.includes(PACKAGE)).slice(0, 8).join("\n") || "no app process in dumpsys");
      return;
    } catch (e) {
      console.log("start failed, retrying:", String(e).split("\n")[0]);
      await sleep(2000);
    }
  }
  throw new Error("the app would not start");
}

await setHebrew();
await systemReady();
// the phone shows Android's "full screen" notice once, and the child taps
// "got it"; here it is marked as seen so the notice does not cover the run
adb("shell", "settings", "put", "secure", "immersive_mode_confirmations", "confirmed");
// room for the whole run in the log, for when it fails
adb("logcat", "-G", "16M");
adb("install", "-r", apk);
adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
adb("shell", "settings", "put", "system", "user_rotation", "1");
await launch();

let page;
const id = (s) => `[data-id="${s}"]`;
const screen = (name) => `document.querySelector('[data-screen="${name}"]')`;

/** The first run, by touch: the parent code, a child's name, grade, hero. */
async function firstRun() {
  await page.touch(id("new_child"));
  // the first-run screens are in this build: no pad is a failure
  await page.waitFor(screen("pin"), { timeoutMs: 5000, what: "the parent code pad after '+ new player'" });
  shot("a02_pin");
  // the code in one rhythm, as a parent types it: no wait between digits
  // (both entries are one screen, so none may be lost)
  for (const [i, d] of [..."12341234"].entries()) await page.touch(id(`key_${d}`), 120, { settle: i === 0 });
  await page.waitFor(screen("notice"), { what: "the code is saved" });
  await page.touch(id("next"));
  await page.waitFor(screen("letters"));
  let expected = "";
  for (const c of "נועה") {
    await page.touch(id(`letter_${c}`));
    expected += c;
    const typed = await page.eval(`document.querySelector('[data-id="typed"]').textContent`);
    check(typed === expected, `typed "${expected}" (the screen shows "${typed}")`);
  }
  shot("a03_name");
  await page.touch(id("board_done"));
  await page.waitFor(screen("grade"));
  await page.touch(id("choice_1"));
  await page.waitFor(screen("avatar"));
  shot("a04_avatar");
  await page.touch(id("choice_girl_teal"));
  await page.waitFor(screen("notice"));
  await page.touch(id("next"));
  await page.waitFor(screen("who-plays"));
  const cards = await page.eval(`[...document.querySelectorAll(".card")].map((c) => c.textContent)`);
  check(JSON.stringify(cards) === JSON.stringify(["נועה"]), "the child is on who-plays");
  shot("a05_child");
  // the app's own measure (src/platform/tapTiming.ts): finger lift to the
  // next drawn frame, for the last 50 taps
  const times = await page.eval("window.__responses ?? []");
  console.log("tap to drawn frame, ms:", times.map(Math.round).join(" ") || "none");
  check(times.length >= 15, `the app measured the taps (${times.length})`);
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  const over = times.filter((t) => t > MAX_TAP_MS).length;
  console.log(`tap to drawn frame: p95 ${Math.round(p95)} ms, slowest ${Math.round(sorted.at(-1) ?? 0)} ms, ${over} over ${MAX_TAP_MS} ms`);
  // one slow frame on the software-drawn emulator is noise; two are a pattern (SDD §5)
  check(over < 2, `at most one tap over ${MAX_TAP_MS} ms (${over})`);
}

/**
 * Milestone M3 on the phone's own WebView: the child's card opens the
 * map, a held arrow walks the hero (`adb shell input swipe` in place, as
 * a thumb holds it), and Android's back opens the pause menu, never
 * leaving the app. Its own function: other checks are added next to it.
 */
async function mapWalk() {
  const map = "window.__nagmonMap?.debug()";
  await page.touch(".card");
  await page.waitFor(`document.querySelector('[data-screen="play"][data-map="ready"]') && ${map}?.ready`, {
    timeoutMs: 60_000,
    what: "the map after the child's card",
  });
  await sleep(1000);
  shot("a06_map");
  const d = await page.eval(map);
  console.log(
    `map: ${d.map}, ${d.renderer}, canvas ${d.canvas.width}x${d.canvas.height} for ${d.canvas.cssWidth.toFixed(1)}x${d.canvas.cssHeight.toFixed(1)} CSS px at DPR ${d.dpr}, zoom ${d.zoom}`,
  );
  console.log("map drawn sizes:", d.scales.map((s) => `${s.what} ${s.texels}->${s.devicePx} (${s.ratio}x, ${s.filter})`).join("; "));
  check(d.map === "classic_hearthrock_city", "the map is Hearthrock");
  check(d.player.x === 29 && d.player.y === 16, `the hero starts at (29,16) (${d.player.x},${d.player.y})`);
  check(
    Math.abs(d.canvas.width - d.canvas.cssWidth * d.dpr) <= 1 && Math.abs(d.canvas.height - d.canvas.cssHeight * d.dpr) <= 1,
    "the map is drawn at the screen's own pixels",
  );
  const worst = Math.max(...d.scales.map((s) => s.ratio));
  check(d.scales.length > 0 && worst <= 2, `no picture over twice its pixels (largest ${worst}x)`);

  // a thumb held on the left arrow for 1.5 s
  const start = d.player;
  await page.touch('[data-id="dpad_left"]', 1500);
  await page.waitFor(`${map} && !${map}.player.moving`, { what: "the hero to stop" });
  const after = (await page.eval(map)).player;
  console.log(`held left 1.5 s: from (${start.x},${start.y}) to (${after.x},${after.y})`);
  check(after.x < start.x && after.y === start.y, "a held arrow walks the hero left");
  check(after.x <= start.x - 2, `it walks on while held (${start.x - after.x} tiles)`);
  shot("a07_map_walked");
  const frames = (await page.eval(map)).frames;
  console.log(
    `map frames (emulator, software GL): ${frames.avgFps.toFixed(1)} fps on average, slowest ${Math.round(frames.slowestMs)} ms, ${frames.slow} over 50 ms (${frames.frames} frames)`,
  );

  // Android's back on the map: the pause menu, and back again closes it
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  await page.waitFor(`document.querySelector('[data-screen="map-menu"]')`, { what: "the pause menu after back" });
  check((await page.eval(`${map}.paused`)).includes("menu"), "back on the map pauses it");
  shot("a08_map_menu");
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  await page.waitFor(`!document.querySelector('[data-screen="map-menu"]')`, { what: "the menu to close on a second back" });
  check(Boolean(await page.eval(`document.querySelector('[data-screen="play"]')`)), "the map stays open: back never leaves the app");
}

try {
  page = await WebViewPage.attach(PACKAGE);
  await page.waitFor(screen("who-plays"), { timeoutMs: 30_000 });
  await page.eval("document.fonts.ready.then(() => true)");
  const size = await page.eval(`({
    w: innerWidth,
    h: innerHeight,
    dir: document.documentElement.dir,
    heading: document.querySelector("h1")?.textContent,
    rubik: document.fonts.check("500 20px Rubik", "שלום"),
  })`);
  console.log("webview", JSON.stringify(size));
  check(size.w > size.h, "landscape");
  check(size.dir === "rtl", "right to left");
  check(size.heading === "מי משחק היום?", "Hebrew on a Hebrew phone");
  check(size.rubik, "the Rubik font is loaded");
  if (!size.rubik) {
    // why not: the faces the page knows, and whether the font file loads
    console.log(
      "fonts:",
      JSON.stringify(
        await page.eval(`Promise.all([...document.fonts].map(async (f) => {
          try { await f.load(); } catch (e) { return [f.family, f.unicodeRange.slice(0, 20), "error " + e]; }
          return [f.family, f.unicodeRange.slice(0, 20), f.status];
        }))`),
      ),
    );
    console.log("user agent:", await page.eval("navigator.userAgent"));
  }
  const screenSize = await page.eval("({ w: screen.width, h: screen.height, dpr: devicePixelRatio })");
  console.log("screen", JSON.stringify(screenSize));
  // an empty spot near the top middle of who-plays
  const [sw, sh] = adb("shell", "wm", "size").split(":").pop().trim().split("x").map(Number);
  const [W, H] = [Math.max(sw, sh), Math.min(sw, sh)];
  const offset = await page.calibrate(Math.round(W / 2), Math.round(H * 0.06));
  console.log("page offset on the screen (device px):", JSON.stringify(offset));
  check(Math.abs(offset.x) <= 2 && Math.abs(offset.y) <= 2, "the page starts at the screen's corner (no bars, no cutout strip)");
  check(size.w * screenSize.dpr >= W - 4, `the page covers the whole screen width (${Math.round(size.w * screenSize.dpr)} of ${W} px)`);
  shot("a01_who_plays");
  await firstRun();
  await mapWalk();
} catch (e) {
  failures.push(String(e));
  console.log("FAIL", e);
  // the log first: it says why, even when the screenshot cannot be taken
  try {
    const logcat = (...a) => execFileSync("adb", ["logcat", "-d", ...a], { encoding: "utf8", maxBuffer: 64 << 20 });
    console.log("--- crash buffer\n" + logcat("-b", "crash"));
    // the app's own lines and its WebView's, from the whole run
    const ours = /nagmon|AndroidRuntime|chromium|cr_|Capacitor|Console|libc|DEBUG|ActivityManager: (Start|Process|Killing)|Displayed/;
    console.log("--- app lines\n" + logcat().split("\n").filter((l) => ours.test(l)).slice(-300).join("\n"));
  } catch (le) {
    console.log("no logcat:", String(le).split("\n")[0]);
  }
  try {
    shot("z_failure");
  } catch (se) {
    console.log("no screenshot:", String(se).split("\n")[0]);
  }
} finally {
  page?.close();
}

if (failures.length) {
  console.log("FAILED:", failures.join("; "));
  process.exit(1);
}
console.log("android e2e passed");
