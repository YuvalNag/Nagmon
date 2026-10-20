/**
 * The APK on an Android emulator, checked through its real WebView:
 * Playwright connects to the WebView's DevTools socket over adb, so the
 * same selectors as the browser tests work on the phone's own engine
 * (docs/app/SDD.md §6, layer 3). Then Android's quality bar (§10): back
 * on every screen, home and back, the process killed in the background,
 * the cold start, the system font at 130%, and 3,000 monkey events; over
 * the whole run no crash, no ANR, no child's name in a log, and a clean
 * console.
 *
 * Usage (on the CI host, emulator booted):
 *   node tests/android/run.mjs APK OUTDIR [BENCHMARK_APK]
 */
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebViewPage } from "./cdp.mjs";

const PACKAGE = "org.nagmon.app";
// docs/app/SDD.md §5: on the emulator a tap shows within 300 ms (one outlier allowed)
const MAX_TAP_MS = 300;
const apk = process.argv[2];
const out = process.argv[3] ?? "android-e2e";
// optional: a release build signed with the debug key, for the cold start
const benchmarkApk = process.argv[4];
mkdirSync(out, { recursive: true });

// every adb call has a time limit: a stuck adb fails the part, never hangs the run
const adb = (...args) =>
  execFileSync("adb", args, { encoding: "utf8", timeout: 120_000 }).trim();
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
  const png = execFileSync("adb", ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20, timeout: 60_000 });
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
// room for the whole run in the log, a clean start, and the whole log
// streamed to a file: the checks read the file, since the buffer rotates
adb("logcat", "-G", "16M");
adb("logcat", "-c");
const LOGCAT_FILE = join(out, "logcat.txt");
let logcatDone = false;
// the last lines written, to drop the ones a restarted stream repeats
const recentLines = new Set();
const recentOrder = [];
let lastStamp = null;
let logcatRestarts = 0;
function streamLogcat() {
  const file = createWriteStream(LOGCAT_FILE, { flags: "a" });
  // events: am_proc_died, am_kill, am_low_memory, am_proc_start
  const args = ["logcat", "-v", "threadtime", "-b", "main,system,crash,events"];
  // a restart starts where the last stream stopped, not at the buffer's
  // beginning (the whole buffer again doubled every line)
  if (lastStamp) args.push("-T", lastStamp);
  const proc = spawn("adb", args, { stdio: ["ignore", "pipe", "ignore"] });
  let rest = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    for (const line of lines) {
      if (recentLines.has(line)) continue;
      recentLines.add(line);
      recentOrder.push(line);
      if (recentOrder.length > 50_000) recentLines.delete(recentOrder.shift());
      const stamp = line.match(/^(\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})/)?.[1];
      if (stamp) lastStamp = stamp;
      file.write(line + "\n");
    }
  });
  // adb drops now and then: stream again, appending
  proc.on("exit", (code) => {
    file.end();
    if (logcatDone) return;
    logcatRestarts++;
    console.log(`logcat stream ended (exit ${code}); streaming again from ${lastStamp ?? "the start"}`);
    setTimeout(() => (logcatProc = streamLogcat()), 1000);
  });
  return proc;
}
let logcatProc = streamLogcat();
/** The streamed system log so far (a moment's wait, for the last lines to land). */
async function logFile() {
  await sleep(1500);
  return readFileSync(LOGCAT_FILE, "utf8");
}
console.log(`the device: ${adb("shell", "nproc")} CPUs, ${adb("shell", "grep", "MemTotal", "/proc/meminfo")}`);
await settle();
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

// ------------------------------------------------- Android's quality bar
// docs/app/SDD.md §10, after the first run: back, home, the system killing
// the app, the cold start, a large font, and monkey last (it may change
// anything, so the checks above run on a known state).

const CODE = "1234";
const MONKEY_SEED = 20261020;
const MONKEY_EVENTS = 3000;
// CI's emulator draws in software on a shared machine: the phone's target is 2 s
const MAX_COLD_START_MS = 4000;
const pages = [];
const pidOf = () => {
  try {
    return adb("shell", "pidof", PACKAGE);
  } catch {
    return "";
  }
};
const runAs = (...a) => {
  try {
    return adb("shell", "run-as", PACKAGE, ...a);
  } catch (e) {
    return `(run-as failed: ${String(e).split("\n")[0]})`;
  }
};
const key = (code) => adb("shell", "input", "keyevent", code);
/** Whether the app's activity is the one in front. */
const inFront = () =>
  adb("shell", "dumpsys", "activity", "activities")
    .split("\n")
    .filter((l) => /ResumedActivity/.test(l))
    .some((l) => l.includes(PACKAGE));

// ---------------------------------------------------- the device's health

/** The pids the run stopped on purpose (force-stop, am kill, install): their exits are expected. */
const expectedExits = new Set();
/** Stops the app on purpose (an adb command), noting its pid. */
function stopApp(...cmd) {
  const p = pidOf();
  if (p) expectedExits.add(p);
  return adb(...cmd);
}

/** Load, memory and memory pressure, with the app's and its renderer's memory: one line. */
function health(label) {
  try {
    const load = adb("shell", "cat", "/proc/loadavg");
    const mem = adb("shell", "dumpsys", "meminfo").split("\n");
    const sum = mem
      .filter((l) => /^\s*(Total RAM|Free RAM|Used RAM|Lost RAM)/.test(l))
      .map((l) => l.trim().replace(/\s+/g, " ").replace(/ \(.*$/, ""))
      .join("; ");
    const ours = [...new Set(mem.filter((l) => /K: (org\.nagmon\.app|com\.google\.android\.webview:sandboxed_process)/.test(l)).map((l) => l.trim()))]
      .slice(0, 3)
      .join("; ");
    let psi = "";
    try {
      psi = adb("shell", "cat", "/proc/pressure/memory").split("\n")[0];
    } catch {
      psi = "no PSI";
    }
    console.log(`health ${label}: load ${load}; ${sum}; ${ours || "app not running"}; memory pressure ${psi}`);
  } catch (e) {
    console.log(`health ${label}: ${String(e).split("\n")[0]}`);
  }
}

/**
 * The other apps' content providers the app's process holds. A stable hold
 * ties the app to that process: when it dies, Android kills the app too
 * ("depends on provider ... in dying proc").
 */
function heldProviders(label) {
  try {
    const pid = pidOf();
    const held = adb("shell", "dumpsys", "activity", "processes")
      .split("\n")
      .filter((l) => pid && l.includes(`->${pid}:${PACKAGE}`))
      .map((l) => l.trim().replace(/^- \w+\//, ""));
    console.log(`providers the app holds (${label}): ${held.join("; ") || "none"}`);
    return held;
  } catch (e) {
    console.log(`providers the app holds (${label}): ${String(e).split("\n")[0]}`);
    return [];
  }
}

/** Android's own record of how the app's processes ended (ApplicationExitInfo). */
const exits = [];
function exitInfo(label) {
  let text = "";
  try {
    text = adb("shell", "dumpsys", "activity", "exit-info", PACKAGE);
  } catch (e) {
    console.log(`exit-info ${label}: ${String(e).split("\n")[0]}`);
    return [];
  }
  const fresh = [];
  for (const block of text.split(/ApplicationExitInfo #\d+:/).slice(1)) {
    const get = (re) => block.match(re)?.[1];
    const e = {
      pid: get(/\bpid=(\d+)/),
      time: get(/timestamp=(\S+ \S+)/),
      reason: get(/\breason=\d+ \((\w+)\)/),
      sub: get(/subreason=\d+ \((\w+)\)/),
      status: get(/status=(-?\d+)/),
      importance: get(/importance=(\d+)/),
      pss: get(/\bpss=(\S+)/),
      rss: get(/\brss=(\S+)/),
      description: get(/description=(.*)/)?.trim(),
    };
    if (!e.pid || exits.some((x) => x.pid === e.pid)) continue;
    e.part = label;
    exits.push(e);
    fresh.push(e);
    console.log(
      `exit-info (${label}): pid ${e.pid} ${e.reason}/${e.sub} status ${e.status} importance ${e.importance} pss ${e.pss} rss ${e.rss} at ${e.time}: ${e.description}` +
        (expectedExits.has(e.pid) ? " [stopped by the run]" : ""),
    );
  }
  return fresh;
}

// where the page sits on the screen, from the first run's calibration
let calibration = null;

async function attach() {
  page?.close();
  page = await WebViewPage.attach(PACKAGE);
  if (calibration) page.offset = calibration;
  pages.push(page);
  return page;
}

const shown = () => page.eval(`document.querySelector("[data-screen]")?.dataset.screen ?? null`);

/** Waits for a screen and says whether it came. */
async function onScreen(name, what, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  let now = null;
  while (Date.now() < end) {
    now = await shown().catch(() => null);
    if (now === name) break;
    await sleep(100);
  }
  check(now === name, `${what}: ${name}${now === name ? "" : ` (the screen is ${now})`}`);
  if (now !== name) throw new Error(`not on ${name}`);
}

/** Android's back key, and the screen it must lead to. */
async function back(from, to) {
  key("KEYCODE_BACK");
  await onScreen(to, `back on ${from} goes to`);
}

async function typeCode() {
  await onScreen("pin", "the code pad");
  for (const [i, d] of [...CODE].entries()) await page.touch(id(`key_${d}`), 120, { settle: i === 0 });
}

async function toLetters(name = "") {
  await page.touch(id("new_child"));
  await typeCode();
  await onScreen("letters", "the code opens the name board");
  for (const c of name) await page.touch(id(`letter_${c}`));
}

const cards = () => page.eval(`[...document.querySelectorAll(".card")].map((c) => c.textContent)`);

/** Nothing scrolls, sticks out of the screen, or is cut off (as in tests/e2e/quality.spec.ts). */
const LAYOUT_PROBLEMS = `(() => {
  const out = [];
  const name = (el) => el.dataset.id ?? (el.className || el.tagName);
  const scrolls = (el) => (el ? el.scrollHeight - el.clientHeight + (el.scrollWidth - el.clientWidth) : 0);
  for (const el of [document.documentElement, document.getElementById("root")]) if (scrolls(el) > 0) out.push("scrolls: " + (el.id || el.tagName));
  for (const el of document.querySelectorAll("button")) {
    const b = el.getBoundingClientRect();
    if (b.top < -0.5 || b.left < -0.5 || b.bottom > innerHeight + 0.5 || b.right > innerWidth + 0.5) out.push("off the screen: " + name(el));
    if (b.width < 48 || b.height < 48) out.push("under 48dp: " + name(el) + " " + Math.round(b.width) + "x" + Math.round(b.height));
    const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const inset = Math.min(rad * 0.4 + 2, b.width / 4, b.height / 4);
    for (const [x, y] of [[b.left + b.width / 2, b.top + b.height / 2], [b.left + inset, b.top + inset], [b.right - inset, b.top + inset], [b.left + inset, b.bottom - inset], [b.right - inset, b.bottom - inset]]) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || !el.contains(hit)) { out.push("covered or cut off: " + name(el)); break; }
    }
  }
  for (const el of document.querySelectorAll(".screen, .screen *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.display === "contents" || !el.textContent.trim()) continue;
    if (el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1) out.push("cut off: " + name(el));
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = document.createRange();
    r.selectNodeContents(el);
    const t = r.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const px = (v) => parseFloat(v) || 0;
    if (t.left < b.left + px(cs.borderLeftWidth) - 0.5 || t.right > b.right - px(cs.borderRightWidth) + 0.5 ||
        t.top < b.top + px(cs.borderTopWidth) - 0.5 || t.bottom > b.bottom - px(cs.borderBottomWidth) + 0.5) {
      out.push("text over its box: " + name(el) + ' "' + el.textContent.trim().slice(0, 12) + '"');
    }
  }
  return out;
})()`;

/**
 * Milestone M3 on the phone's own WebView: the child's card opens the
 * map, a held arrow walks the hero (`adb shell input swipe` in place, as
 * a thumb holds it), the software-drawn map lowers its resolution, and
 * Android's back opens and closes the pause menu, never leaving the app.
 * It ends back on who-plays, through the menu.
 */
async function mapWalk() {
  const map = "window.__nagmonMap?.debug()";
  // measured afresh: a step kept from an earlier run must not pass the check below
  await page.eval(`(localStorage.removeItem("nagmon.map.renderDpr"), localStorage.removeItem("nagmon.map.adaptiveResolution"), true)`);
  await page.touch(".card");
  await page.waitFor(`document.querySelector('[data-screen="play"][data-map="ready"]') && ${map}?.ready`, {
    timeoutMs: 60_000,
    what: "the map after the child's card",
  });
  await sleep(1000);
  shot("a06_map");
  heldProviders("with the map open");
  const d = await page.eval(map);
  console.log(
    `map: ${d.map}, ${d.renderer}, canvas ${d.canvas.width}x${d.canvas.height} for ${d.canvas.cssWidth.toFixed(1)}x${d.canvas.cssHeight.toFixed(1)} CSS px at DPR ${d.dpr}, zoom ${d.zoom}`,
  );
  console.log("map drawn sizes:", d.scales.map((s) => `${s.what} ${s.texels}->${s.devicePx.toFixed(1)} (${s.ratio.toFixed(2)}x, ${s.filter})`).join("; "));
  check(d.map === "classic_hearthrock_city", "the map is Hearthrock");
  check(d.player.x === 29 && d.player.y === 16, `the hero starts at (29,16) (${d.player.x},${d.player.y})`);
  check(d.resolution.start === "screen", `the map starts at the screen's pixels, nothing kept (${d.resolution.start})`);
  // the canvas draws at its resolution: the screen's own pixels, or a step
  // lower on a phone too slow for them (src/game/resolution.ts)
  const k = d.resolution.dpr;
  console.log(`map resolution: ${k} canvas px per CSS px (screen ${d.dpr}), steps ${d.resolution.steps.join(" ")}`);
  check(
    Math.abs(d.canvas.width - d.canvas.cssWidth * k) <= 1 && Math.abs(d.canvas.height - d.canvas.cssHeight * k) <= 1,
    `the map's canvas has the pixels of its resolution (${d.canvas.width}x${d.canvas.height})`,
  );
  // measured from the canvas as it is: its whole-pixel size (915.05 CSS px
  // x 2 is a 1830 px canvas) moves the ratio by a few hundredths of a percent
  const SCALE_SLACK = 1.005;
  const worst = Math.max(...d.scales.map((s) => s.ratio));
  check(d.scales.length > 0 && worst <= 2 * SCALE_SLACK, `no picture over twice its pixels (largest ${worst.toFixed(4)}x)`);

  // a thumb held on the left arrow for 1.5 s
  const start = d.player;
  await page.touch('[data-id="dpad_left"]', 1500);
  await page.waitFor(`${map} && !${map}.player.moving`, { what: "the hero to stop" });
  const after = (await page.eval(map)).player;
  console.log(`held left 1.5 s: from (${start.x},${start.y}) to (${after.x},${after.y})`);
  check(after.x < start.x && after.y === start.y, "a held arrow walks the hero left");
  check(after.x <= start.x - 2, `it walks on while held (${start.x - after.x} tiles)`);
  shot("a07_map_walked");
  heldProviders("after the walk, the music on");
  // a slow window takes 1 s of warm-up and 3 s of frames
  try {
    await page.waitFor(`${map}.resolution.changes.length > 0 || ${map}.frames.avgFps >= 45`, {
      timeoutMs: 20_000,
      what: "the map to measure its speed",
    });
  } catch {
    // the check below says what happened
  }
  shot("a07b_map_resolution");
  const later = await page.eval(map);
  const frames = later.frames;
  console.log(
    `map frames (emulator, software GL): ${frames.avgFps.toFixed(1)} fps on average, slowest ${Math.round(frames.slowestMs)} ms, ${frames.slow} over 50 ms (${frames.frames} frames)`,
  );
  console.log("map resolution changes:", JSON.stringify(later.resolution.changes));
  // software GL here is far under 45 fps: the map tries fewer pixels
  check(frames.avgFps >= 45 || later.resolution.changes.length > 0, `a slow map tries a lower resolution (now ${later.resolution.dpr})`);
  const largest = Math.max(...later.scales.map((s) => s.ratio));
  check(largest <= 2 * SCALE_SLACK, `still no picture over twice its pixels (largest ${largest.toFixed(4)}x)`);

  // Android's back on the map: the pause menu, and back again closes it
  key("KEYCODE_BACK");
  await page.waitFor(screen("map-menu"), { what: "the pause menu after back" });
  check((await page.eval(`${map}.paused`)).includes("menu"), "back on the map pauses it");
  // the emulator draws in software: give the overlay time to reach the screen
  await sleep(1500);
  shot("a08_map_menu");
  key("KEYCODE_BACK");
  await page.waitFor(`!${screen("map-menu")}`, { what: "the menu to close on a second back" });
  check(await page.eval(`Boolean(${screen("play")})`), "the map stays open: back never leaves the app");
  check((await page.eval(`${map}.paused`)).length === 0, "closing the menu lets the map run again");
  // out through the menu, for the parts after this one
  key("KEYCODE_BACK");
  await page.waitFor(screen("map-menu"), { what: "the pause menu" });
  await page.touch(id("map_exit"));
  await onScreen("who-plays", "the menu's way out");
  // the map leaves nothing behind: the app's memory after one visit, and
  // after two more (a leak grows with each)
  const first = memoryAfterMap("after one visit to the map");
  for (let i = 0; i < 2; i++) {
    await page.touch(".card");
    await page.waitFor(`document.querySelector('[data-screen="play"][data-map="ready"]')`, { timeoutMs: 60_000, what: "the map again" });
    key("KEYCODE_BACK");
    await page.waitFor(screen("map-menu"), { what: "the pause menu" });
    await page.touch(id("map_exit"));
    await onScreen("who-plays", "the menu's way out");
  }
  const third = memoryAfterMap("after three visits to the map");
  if (first && third) check(third - first < 60_000, `three visits to the map do not grow the app's memory by 60 MB (${Math.round((third - first) / 1000)} MB)`);
}

/** The app's total PSS (KB) from dumpsys, printed; null if it cannot be read. */
function memoryAfterMap(when) {
  // let the closed map's GPU and canvas memory go
  try {
    adb("shell", "am", "send-trim-memory", PACKAGE, "RUNNING_LOW");
  } catch {
    // older Android: no trim command
  }
  const info = adb("shell", "dumpsys", "meminfo", PACKAGE);
  const total = /TOTAL PSS:\s+(\d+)/.exec(info) ?? /TOTAL\s+(\d+)/.exec(info);
  const lines = info.split("\n").filter((l) => /TOTAL|Native Heap|Graphics|GL mtrack|EGL mtrack|WebViews|Views:/.test(l));
  console.log(`app memory ${when}: ${total ? Math.round(Number(total[1]) / 1000) : "?"} MB\n${lines.join("\n")}`);
  return total ? Number(total[1]) : null;
}

/** Back on every screen of the flow: one step back, never out of the app. */
async function backEverywhere() {
  const pid = pidOf();
  key("KEYCODE_BACK");
  await sleep(1000);
  check(inFront() && pidOf() === pid && (await shown()) === "who-plays", "back on who-plays: the app stays open, on who-plays");
  await page.touch(id("new_child"));
  await onScreen("pin", "+ new player opens");
  await back("the code pad", "who-plays");
  await toLetters("דן");
  await back("the name board", "who-plays");
  await toLetters("דן");
  await page.touch(id("board_done"));
  await onScreen("grade", "done opens");
  await back("the grade", "letters");
  const typed = await page.eval(`document.querySelector('[data-id="typed"]').textContent`);
  check(typed === "דן", `back on the grade keeps the name ("${typed}")`);
  await page.touch(id("board_done"));
  await onScreen("grade", "done opens");
  await page.touch(id("choice_2"));
  await onScreen("avatar", "a grade opens");
  shot("b01_avatar");
  await back("the heroes", "grade");
  await back("the grade", "letters");
  await back("the name board", "who-plays");
  // a second child, then back on the notice that says so
  await toLetters("דן");
  await page.touch(id("board_done"));
  await onScreen("grade", "done opens");
  await page.touch(id("choice_2"));
  await onScreen("avatar", "a grade opens");
  await page.touch(id("choice_boy_blue"));
  await onScreen("notice", "a hero saves the child");
  await back("the notice", "who-plays");
  const both = await cards();
  check(both.length === 2 && both.includes("נועה") && both.includes("דן"), `both children on who-plays (${both.join(", ")})`);
  await page.touch(".card");
  await onScreen("play", "a child's card opens");
  // on the map back opens the pause menu, and back again closes it
  key("KEYCODE_BACK");
  await page.waitFor(screen("map-menu"), { what: "back on the map opens its menu" });
  check(true, "back on the map opens its pause menu");
  key("KEYCODE_BACK");
  await page.waitFor(`!${screen("map-menu")}`, { what: "back on the menu closes it" });
  check((await shown()) === "play", "back on the map's menu closes it, on the map");
  // the menu's way out goes to who-plays
  key("KEYCODE_BACK");
  await page.waitFor(screen("map-menu"), { what: "the map's menu" });
  await page.touch(id("map_exit"));
  await onScreen("who-plays", "the map's menu leads out to");
  await page.touch(id("parents"));
  await typeCode();
  await onScreen("parents", "the code opens the parents' area");
  await back("the parents' area", "who-plays");
  check(pidOf() === pid, "back never closed or restarted the app");
}

/** Home, then the launcher's icon: the same screen, the same name typed, no reload. */
async function homeAndBack() {
  await toLetters("נו");
  // a line of our own in the app's log: the saved file must have it, so it
  // is this trip's save that is read, not an older one
  const mark = `check-home-${Date.now()}`;
  const before = await page.eval(`(window.__marker = Math.random(), window.__appLogMark(${JSON.stringify(mark)}), { marker: window.__marker, life: window.__lifecycle() })`);
  const pid = pidOf();
  key("KEYCODE_HOME");
  const away = Date.now();
  await sleep(3000);
  check(!inFront(), "home: the app went behind the launcher");
  shot("c01_home");
  const saved = runAs("cat", "files/nagmon/app_log.txt");
  const at = saved.lastIndexOf(mark);
  check(at >= 0 && /--- saved: background\s*$/.test(saved.slice(at)), "in the background the app's log was written to disk, with the line written just before");
  // what the launcher's icon sends; the activity is singleTask, so it comes to the front
  adb("shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", `${PACKAGE}/.MainActivity`);
  await sleep(1500);
  const awayMs = Date.now() - away;
  const after = await page.eval(`({
    marker: window.__marker,
    life: window.__lifecycle(),
    screen: document.querySelector("[data-screen]")?.dataset.screen,
    typed: document.querySelector('[data-id="typed"]')?.textContent,
  })`);
  console.log("lifecycle before home:", JSON.stringify(before.life));
  console.log("lifecycle after:", JSON.stringify(after.life));
  check(inFront(), "the icon brings the app back to the front");
  check(pidOf() === pid, "the same process");
  check(after.marker === before.marker, "the same page: no reload, no start screen again");
  check(after.screen === "letters" && after.typed === "נו", `the same screen and the same name typed (${after.screen}, "${after.typed}")`);
  check(after.life.backgrounds === before.life.backgrounds + 1 && after.life.foregrounds === before.life.foregrounds + 1, "one trip to the background and back");
  check(after.life.lastFlush === "ok", `everything was written on the way out (${after.life.lastFlush}, ${Math.round(after.life.lastFlushMs)} ms)`);
  check(after.life.completed === after.life.flushes, `every flush so far completed (${after.life.completed} of ${after.life.flushes})`);
  const counted = after.life.screenTimeMs - before.life.screenTimeMs;
  check(counted < awayMs - 2000, `the screen-time clock stood still in the background (${Math.round(counted)} ms counted in ${awayMs} ms)`);
  check(after.life.gameMs - before.life.gameMs < awayMs - 2000, "the game's clock stood still in the background");
  // and runs again now that the app is in front
  await sleep(1000);
  const running = await page.eval("window.__lifecycle()");
  check(running.screenTimeMs - after.life.screenTimeMs >= 800, `the screen-time clock runs again in front (${Math.round(running.screenTimeMs - after.life.screenTimeMs)} ms in 1 s)`);
  shot("c02_resumed");
  await back("the name board after coming back", "who-plays");
}

/** What the launcher's icon sends: the singleTask activity comes to the front. */
async function bringBack(ms = 2000) {
  adb("shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", `${PACKAGE}/.MainActivity`);
  await sleep(ms);
}

/**
 * HOME in the middle of work: while the parent code is being checked
 * (PBKDF2), and with the map open (its WebGL canvas alive). The app must
 * live on in the same process and come back where it was.
 */
async function homeDuringWork() {
  const map = "window.__nagmonMap?.debug()";
  const pid = pidOf();
  await onScreen("who-plays", "before HOME during work the app is on");
  await page.touch(id("parents"));
  await onScreen("pin", "the parents' button opens");
  for (const [i, d] of [...CODE].entries()) await page.touch(id(`key_${d}`), 120, { settle: i === 0 });
  // right after the 4th digit: the check runs as the app goes behind the launcher
  key("KEYCODE_HOME");
  await sleep(4000);
  check(!inFront(), "home during the code's check: the app went behind the launcher");
  await bringBack();
  const after = await shown();
  check(pidOf() === pid, `home during the code's check: the same process (${pid} -> ${pidOf() || "none"})`);
  check(after === "parents", `the check finished while away: the parents' area (${after})`);
  if (after !== "who-plays") await back(`the ${after} screen`, "who-plays");

  await page.touch(".card");
  await page.waitFor(`document.querySelector('[data-screen="play"][data-map="ready"]') && ${map}?.ready`, { timeoutMs: 60_000, what: "the map" });
  await sleep(1000);
  key("KEYCODE_HOME");
  await sleep(5000);
  const away = await page.eval(map);
  check(away.paused.includes("lifecycle"), `in the background the map is paused (${away.paused.join(", ")})`);
  await bringBack(3000);
  const back2 = await page.eval(map);
  check(pidOf() === pid, `home with the map open: the same process (${pid} -> ${pidOf() || "none"})`);
  check(
    (await page.eval(`Boolean(document.querySelector('[data-screen="play"][data-map="ready"]'))`)) && back2.paused.length === 0,
    `the map is there again and running (${back2.paused.join(", ") || "not paused"})`,
  );
  check(!back2.webgl.contextLost, `the map's WebGL is drawing (lost ${back2.webgl.lost}, restored ${back2.webgl.restored})`);
  shot("c03_map_after_home");
  key("KEYCODE_BACK");
  await page.waitFor(screen("map-menu"), { what: "the pause menu" });
  await page.touch(id("map_exit"));
  await onScreen("who-plays", "the menu's way out");
}

/** Android kills the app in the background; it opens again on who-plays, with everything. */
async function killedInBackground() {
  const children = await cards();
  key("KEYCODE_HOME");
  await sleep(2000);
  stopApp("shell", "am", "kill", PACKAGE);
  await sleep(1500);
  let how = "am kill";
  const left = pidOf();
  if (left) {
    // am kill spares a process it thinks is still in use; a low-memory kill would not
    expectedExits.add(left);
    runAs("kill", "-9", left);
    how = "kill -9, am kill left it";
    await sleep(1000);
  }
  check(!pidOf(), `the app's process is gone (${how})`);
  page.close();
  page = null;
  await launch();
  await attach();
  await onScreen("who-plays", "after the kill the app opens on", 30_000);
  const now = await cards();
  check(JSON.stringify(now) === JSON.stringify(children), `the children are all there (${now.join(", ")})`);
  shot("d01_after_kill");
}

const parseDrawn = (line) => {
  const m = line.match(/Fully drawn org\.nagmon\.app\/\.MainActivity: \+(?:(\d+)s)?(\d+)ms/);
  return m ? Number(m[1] ?? 0) * 1000 + Number(m[2]) : null;
};
const drawnLines = () => readFileSync(LOGCAT_FILE, "utf8").split("\n").filter((l) => parseDrawn(l) !== null);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Three cold starts of the installed build: `am start -W` TotalTime (the
 * first frame) and Android's "Fully drawn" (who-plays readable, from
 * reportFullyDrawn). `pageTimes`: also where the time went in the page
 * (needs DevTools, so the debug build only).
 */
async function threeColdStarts(label, { pageTimes }) {
  const total = [];
  const drawn = [];
  for (let i = 0; i < 3; i++) {
    page?.close();
    page = null;
    stopApp("shell", "am", "force-stop", PACKAGE);
    await sleep(2000);
    const seen = drawnLines().length;
    const out = adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`);
    total.push(Number(out.match(/TotalTime:\s*(\d+)/)?.[1] ?? NaN));
    let ms = null;
    for (let w = 0; w < 40 && ms === null; w++) {
      await sleep(500);
      const lines = drawnLines();
      if (lines.length > seen) ms = parseDrawn(lines.at(-1));
    }
    drawn.push(ms);
    let inPage = "";
    if (pageTimes) {
      // where the time went, as the page saw it (ms from the page's own start)
      try {
        await attach();
        inPage = `; in the page: ${JSON.stringify(await page.eval(`({ ...window.__startTimes?.(), loaded: Math.round(performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd ?? -1) })`))}`;
      } catch (e) {
        inPage = `; no page times (${String(e).split("\n")[0]})`;
      }
    }
    console.log(`${label} start ${i + 1}: TotalTime ${total.at(-1)} ms, fully drawn ${ms ?? "none"} ms${inPage}`);
  }
  check(drawn.every((d) => d !== null), `${label}: the app reported who-plays drawn on every start`);
  const m = median(drawn.map((d) => d ?? Infinity));
  console.log(`${label} cold start: first frame (TotalTime) ${total.join(" ")} ms; to who-plays (fully drawn) ${drawn.join(" ")} ms, median ${m} ms`);
  return m;
}

/**
 * Cold starts to who-plays. The limit is checked on the benchmark build:
 * a release build, not debuggable, as the phone runs it (a debuggable app
 * runs its Java code, the WebView's too, much slower). The debug build's
 * numbers are printed too, with the page's own times.
 */
async function coldStart() {
  const before = await cards();
  const debugMs = await threeColdStarts("debug build", { pageTimes: true });
  let gated = debugMs;
  let which = "debug build";
  if (benchmarkApk) {
    // same key and version: it installs over the debug build and keeps the data
    stopApp("install", "-r", benchmarkApk);
    try {
      gated = await threeColdStarts("benchmark build", { pageTimes: false });
      which = "benchmark build (release, not debuggable)";
    } finally {
      stopApp("install", "-r", apk);
    }
  }
  console.log(`cold start to who-plays: ${which} median ${gated} ms (debug build ${debugMs} ms; phone target 2000 ms, CI limit ${MAX_COLD_START_MS} ms)`);
  check(gated <= MAX_COLD_START_MS, `cold start to who-plays within ${MAX_COLD_START_MS} ms on the ${which} (median ${gated} ms)`);
  await launch();
  await attach();
  await onScreen("who-plays", "a cold start opens", 30_000);
  const kids = await cards();
  check(JSON.stringify(kids) === JSON.stringify(before), `the children are still there after the builds were swapped (${kids.join(", ")})`);
}

/**
 * The system's font set to 130% while the app is in the background, as a
 * parent does in Settings: the app comes back on the same page (no
 * reload), the text follows, every screen still fits and nothing is cut off.
 */
async function largeFont() {
  await onScreen("who-plays", "before the font changes the app is on");
  const marker = await page.eval("(window.__fontMarker = Math.random())");
  const pid = pidOf();
  const resume = async () => {
    adb("shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", `${PACKAGE}/.MainActivity`);
    await sleep(2000);
  };
  const scale = () => page.eval(`getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim()`);
  key("KEYCODE_HOME");
  await sleep(1000);
  adb("shell", "settings", "put", "system", "font_scale", "1.3");
  try {
    await sleep(1000);
    await resume();
    await page.eval("document.fonts.ready.then(() => true)");
    const size = await page.eval(`parseFloat(getComputedStyle(document.body).fontSize)`);
    check(pidOf() === pid && (await page.eval("window.__fontMarker")) === marker, "after the font change, the same page (no reload, no new activity)");
    check((await scale()) === "1.3", `the page follows the system font size (--font-scale ${await scale()}, text ${size} px)`);
    const layout = async (what) => {
      const problems = await page.eval(LAYOUT_PROBLEMS);
      check(problems.length === 0, `at 130%, ${what} fits${problems.length ? `: ${problems.join("; ")}` : ""}`);
    };
    await layout("who-plays");
    shot("e01_font130_who_plays");
    await page.touch(id("new_child"));
    await onScreen("pin", "+ new player opens");
    await layout("the code pad");
    shot("e02_font130_pin");
    await typeCode();
    await onScreen("letters", "the code opens the name board");
    for (const c of "נו") await page.touch(id(`letter_${c}`));
    await layout("the name board");
    shot("e03_font130_letters");
    await back("the name board", "who-plays");
  } finally {
    key("KEYCODE_HOME");
    await sleep(1000);
    adb("shell", "settings", "put", "system", "font_scale", "1.0");
    await sleep(1000);
    await resume();
  }
  check((await scale()) === "1", `back at 100%, the page follows (--font-scale ${await scale()})`);
}

/**
 * The screen's colour near its four corners (the page's background on
 * who-plays), from a raw screenshot: RGBA after a 12 or 16 byte header.
 */
function cornerColours() {
  const raw = execFileSync("adb", ["exec-out", "screencap"], { maxBuffer: 64 << 20, timeout: 60_000 });
  const w = raw.readUInt32LE(0);
  const h = raw.readUInt32LE(4);
  const header = raw.length - w * h * 4;
  const at = (x, y) => [...raw.subarray(header + (y * w + x) * 4, header + (y * w + x) * 4 + 3)];
  const dx = Math.round(w * 0.03);
  const dy = Math.round(h * 0.03);
  return [at(dx, dy), at(w - dx, dy), at(dx, h - dy), at(w - dx, h - dy)];
}

/** Android's dark mode on: the game keeps its one look (no darkened page), on the same page. */
async function darkMode() {
  await onScreen("who-plays", "before dark mode the app is on");
  const marker = await page.eval("(window.__darkMarker = Math.random())");
  const css = () => page.eval(`getComputedStyle(document.body).backgroundColor + " " + getComputedStyle(document.querySelector(".screen")).backgroundImage`);
  const light = { css: await css(), px: cornerColours() };
  shot("g01_light");
  adb("shell", "cmd", "uimode", "night", "yes");
  try {
    await sleep(3000);
    shot("g02_dark_mode");
    const dark = { css: await css(), px: cornerColours() };
    console.log("corners, light:", JSON.stringify(light.px), "dark mode:", JSON.stringify(dark.px));
    check((await page.eval("window.__darkMarker")) === marker, "in dark mode, the same page (no reload, no new activity)");
    check(dark.css === light.css, `in dark mode the page's colours are its own (${dark.css})`);
    const off = Math.max(...dark.px.flatMap((p, i) => p.map((c, j) => Math.abs(c - light.px[i][j]))));
    check(off <= 12, `in dark mode the screen is not darkened (largest change ${off} of 255)`);
  } finally {
    adb("shell", "cmd", "uimode", "night", "no");
    await sleep(1500);
  }
}

/** 3,000 random events in the app: no crash, no ANR, the process lives on. */
async function monkey() {
  await onScreen("who-plays", "before monkey the app is on", 30_000);
  const pid = pidOf();
  adb("shell", "log", "-t", "NagmonCheck", "monkey starts");
  let out = "";
  let exit = 0;
  try {
    out = execFileSync(
      "adb",
      ["shell", "monkey", "-p", PACKAGE, "--throttle", "50", "--pct-syskeys", "0", "-s", String(MONKEY_SEED), "-v", String(MONKEY_EVENTS)],
      { encoding: "utf8", maxBuffer: 64 << 20, timeout: 900_000 },
    );
  } catch (e) {
    exit = e.status ?? 1;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  const lines = out.split("\n");
  console.log("--- monkey (summary)\n" + [...lines.filter((l) => /CRASH|NOT RESPONDING|aborted|Exception/i.test(l)).slice(0, 20), ...lines.slice(-6)].join("\n"));
  check(exit === 0, `monkey ended normally (exit ${exit})`);
  check(new RegExp(`Events injected: ${MONKEY_EVENTS}\\b`).test(out), `monkey sent all ${MONKEY_EVENTS} events (seed ${MONKEY_SEED})`);
  check(!/\/\/ CRASH|\/\/ NOT RESPONDING/.test(out), "monkey saw no crash and no ANR");
  const log = (await logFile()).split("\n");
  const from = log.findLastIndex((l) => l.includes("NagmonCheck") && l.includes("monkey starts"));
  const during = log.slice(Math.max(0, from));
  const died = during.filter((l) => new RegExp(`Process ${PACKAGE.replace(/\./g, "\\.")} \\(pid \\d+\\) has died|Killing \\d+:${PACKAGE.replace(/\./g, "\\.")}`).test(l));
  check(died.length === 0, `the app's process did not die during monkey${died.length ? `: ${died.join(" | ")}` : ""}`);
  check(pidOf() === pid, `the same process after monkey (${pid} -> ${pidOf() || "none"})`);
  shot("f01_after_monkey");
}

/** Over the whole run: no crash, no ANR, no names in any log, a clean console. */
async function wholeRun() {
  const all = await logFile();
  console.log(`the system log of the run: ${all.split("\n").length} lines in ${LOGCAT_FILE}`);
  check(all.includes("NagmonShell: activity created"), "the streamed system log has the whole run (the first start is in it)");
  const lines = all.split("\n");
  const fatal = lines.filter((l, i) => /FATAL EXCEPTION/.test(l) && lines.slice(i, i + 3).some((n) => n.includes(`Process: ${PACKAGE}`)));
  check(fatal.length === 0, `no FATAL EXCEPTION in the app${fatal.length ? `: ${fatal.join(" | ")}` : ""}`);
  check(!all.includes(`ANR in ${PACKAGE}`), "no ANR in the app");
  check(!all.includes(`>>> ${PACKAGE} <<<`), "no native crash of the app (no tombstone)");
  // the activity is created once per process: a second time in the same
  // process is a relaunch, which reloads the page and loses the child's place
  const created = lines.filter((l) => /NagmonShell: activity created/.test(l));
  console.log(lines.filter((l) => /NagmonShell/.test(l)).join("\n"));
  // the same line twice (a stream that repeated itself) is one creation:
  // a recreation is a second creation, at another time, in the same process
  const times = new Map();
  for (const l of created) {
    const [date, time, pid] = l.trim().split(/\s+/);
    if (!times.has(pid)) times.set(pid, new Set());
    times.get(pid).add(`${date} ${time}`);
  }
  const again = [...times].filter(([, t]) => t.size > 1).map(([p]) => p);
  check(again.length === 0, `Android never recreated the activity in a running app${again.length ? ` (pid ${again.join(", ")})` : ""}`);
  console.log(`logcat stream restarts: ${logcatRestarts}`);
  // the renderer's death takes the app with it unless MainActivity takes it over
  const gone = lines.filter((l) => /NagmonShell: the page's renderer is gone|AwBrowserTerminator|Render process.*crash/.test(l));
  check(gone.length === 0, `the page's renderer never died${gone.length ? `: ${gone.slice(0, 3).join(" | ")}` : ""}`);
  // what Android did to the app's processes, all run long
  const events = lines.filter((l) => /\b(am_proc_died|am_kill|am_low_memory|am_crash|am_anr|am_proc_start)\b/.test(l) && /nagmon/.test(l));
  console.log(`--- Android's events for the app (${events.length})\n` + events.slice(-60).join("\n"));
  const lmk = lines.filter((l) => /lowmemorykiller: Kill|\bam_kill\b.*\blmk\b/.test(l));
  console.log(`low-memory kills in the run: ${lmk.length}\n${lmk.slice(-20).join("\n")}`);
  exitInfo("end of the run");
  // the page's renderer (an isolated process of the app) ends "isolated not
  // needed" with the app's process: expected when that one was stopped by
  // the run, within a few seconds; on its own it is the renderer dying
  const at = (e) => Date.parse(String(e.time).replace(" ", "T"));
  const followsStop = (e) =>
    /isolated not needed/.test(e.description ?? "") &&
    exits.some((x) => x !== e && expectedExits.has(x.pid) && Math.abs(at(x) - at(e)) < 5000);
  const unexpected = exits.filter((e) => !expectedExits.has(e.pid) && !followsStop(e));
  check(
    unexpected.length === 0,
    `the app's process ended only when the run stopped it${unexpected.length ? `: ${unexpected.map((e) => `pid ${e.pid} ${e.reason}/${e.sub} in "${e.part}": ${e.description}`).join(" | ")}` : ""}`,
  );
  const appLog = runAs("cat", "files/nagmon/app_log.txt");
  for (const name of ["נועה", "דן"]) {
    const where = [all.includes(name) && "the system log", appLog.includes(name) && "the app's log"].filter(Boolean);
    check(where.length === 0, `a child's name is in no log${where.length ? ` (in ${where.join(" and ")})` : ""}`);
    if (all.includes(name)) console.log(all.split("\n").filter((l) => l.includes(name)).slice(0, 5).join("\n"));
  }
  // a dropped DevTools socket is opened again; one that comes back on a new
  // process means the app died under the run
  const reopened = pages.reduce((n, p) => n + p.reconnects, 0);
  console.log(`DevTools sockets opened again: ${reopened}`);
  const newPid = pages.filter((p) => p.reconnects && p.pid !== p.firstPid);
  check(newPid.length === 0, "the app never died under the run (no socket came back on a new process)");
  const problems = pages.flatMap((p) => p.problems);
  check(problems.length === 0, `no uncaught error and no console error or warning (${problems.length})`);
  for (const p of problems.slice(0, 20)) console.log("   ", p.slice(0, 300));
}

function dumpLogs() {
  try {
    const all = readFileSync(LOGCAT_FILE, "utf8");
    const crashAt = all.indexOf("beginning of crash");
    console.log("--- crash buffer\n" + (crashAt < 0 ? "(empty)" : all.slice(crashAt).split("\n").slice(0, 80).join("\n")));
    // the app's own lines and its WebView's, from the whole run
    const ours = /nagmon|NagmonShell|AndroidRuntime|chromium|cr_|Capacitor|Console|libc|DEBUG|ActivityManager: (Start|Process|Killing)|Displayed|Fully drawn/;
    console.log("--- app lines\n" + all.split("\n").filter((l) => ours.test(l)).slice(-300).join("\n"));
  } catch (le) {
    console.log("no logcat:", String(le).split("\n")[0]);
  }
}

/** One part of the run: a failure is noted, screenshotted, and the run goes on. */
async function part(name, fn) {
  console.log(`--- ${name}`);
  health(`before "${name}"`);
  heldProviders(`before "${name}"`);
  try {
    await fn();
    heldProviders(`after "${name}"`);
    exitInfo(name);
  } catch (e) {
    failures.push(`${name}: ${e}`);
    console.log("FAIL", name, e);
    // why: how the app's process ended (if it did), the device's state, and the log's last word on it
    exitInfo(name);
    health(`after "${name}" failed`);
    try {
      const why = /nagmon|NagmonShell|AwBrowserTerminator|[Rr]ender(er)? process|lowmemorykiller|lmkd|am_kill|am_proc_died|am_low_memory|ActivityManager: (Killing|Process)/;
      console.log("--- the log's last lines on it\n" + readFileSync(LOGCAT_FILE, "utf8").split("\n").filter((l) => why.test(l)).slice(-60).join("\n"));
    } catch (le) {
      console.log("no log:", String(le).split("\n")[0]);
    }
    try {
      shot(`z_${name.replace(/\W+/g, "_")}`);
    } catch (se) {
      console.log("no screenshot:", String(se).split("\n")[0]);
    }
    // the next part starts from a fresh app
    try {
      page?.close();
      page = null;
      stopApp("shell", "am", "force-stop", PACKAGE);
      await launch();
      await attach();
    } catch (re) {
      console.log("could not start the app again:", String(re).split("\n")[0]);
    }
  }
}

/** How busy the device's CPUs are (%), over windows of `ms`, from /proc/stat. */
async function cpuBusy(windows, ms) {
  const read = () => {
    const [, ...f] = adb("shell", "head", "-1", "/proc/stat").trim().split(/\s+/).map(Number);
    const idle = f[3] + f[4];
    return { idle, total: f.reduce((a, b) => a + b, 0) };
  };
  const out = [];
  let a = read();
  for (let i = 0; i < windows; i++) {
    await sleep(ms);
    const b = read();
    out.push(Math.round(100 * (1 - (b.idle - a.idle) / Math.max(1, b.total - a.total))));
    a = b;
  }
  return out;
}

/**
 * A freshly booted emulator is busy for minutes (Play services updating
 * and restarting itself, search indexing, package scans): the first runs
 * measured 97-100% CPU and a load of 18 on 2 CPUs. The family's phone is
 * not two minutes after a boot, so the checks wait until the device is
 * quiet: two 5 s windows under 50% busy, up to 5 minutes, printed.
 */
async function settle() {
  const seen = [];
  const end = Date.now() + 300_000;
  let quiet = 0;
  while (Date.now() < end && quiet < 2) {
    const [busy] = await cpuBusy(1, 5000);
    seen.push(busy);
    quiet = busy < 50 ? quiet + 1 : 0;
  }
  console.log(`CPU busy while the device settles, % per 5 s: ${seen.join(" ")} (${quiet >= 2 ? "quiet" : "still busy after 5 minutes"})`);
  check(quiet >= 2, "the device is quiet before the checks (two 5 s windows under 50% CPU)");
}

let started = false;
await part("first run", async () => {
  await attach();
  await page.waitFor(screen("who-plays"), { timeoutMs: 30_000 });
  // drawn with its font: the app says so once the font is in (src/main.tsx)
  await page.waitFor("window.__startedAt !== undefined", { timeoutMs: 30_000, what: "the app to report who-plays drawn" });
  await page.eval("document.fonts.ready.then(() => true)");
  // the game engine waits for the map: nothing of it before the child's card
  const engine = await page.eval(`({
    phaser: typeof window.Phaser !== "undefined",
    scripts: performance.getEntriesByType("resource").map((r) => r.name.split("/").pop()).filter((n) => /\\.js$/.test(n)),
  })`);
  console.log("scripts loaded before the map:", engine.scripts.join(" "));
  check(!engine.phaser && !engine.scripts.some((n) => /mapGame|phaser/i.test(n)), "the game engine is not loaded before the map opens");
  // the parent code's hash, as the app runs it (src/core/family/parent.ts)
  const pbkdf2 = await page.eval(`(async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("0000"), "PBKDF2", false, ["deriveBits"]);
    const t0 = performance.now();
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(16), iterations: 240000 }, key, 256);
    return Math.round(performance.now() - t0);
  })()`);
  console.log(`PBKDF2-SHA-256, 240,000 iterations, in the WebView: ${pbkdf2} ms`);
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
  started = true;
});
if (started) {
  calibration = page.offset;
  await part("map", mapWalk);
  await part("back on every screen", backEverywhere);
  await part("home and back", homeAndBack);
  await part("home during work", homeDuringWork);
  await part("killed in the background", killedInBackground);
  await part("cold start", coldStart);
  await part("system font at 130%", largeFont);
  await part("dark mode", darkMode);
  await part("monkey", monkey);
}
await wholeRun();
logcatDone = true;
logcatProc.kill();
if (failures.length) dumpLogs();
page?.close();

if (failures.length) {
  console.log("FAILED:", failures.join("; "));
  process.exit(1);
}
console.log("android e2e passed");
