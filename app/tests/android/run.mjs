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
const logcat = (...a) => execFileSync("adb", ["logcat", "-d", ...a], { encoding: "utf8", maxBuffer: 64 << 20 });
const key = (code) => adb("shell", "input", "keyevent", code);
/** Whether the app's activity is the one in front. */
const inFront = () =>
  adb("shell", "dumpsys", "activity", "activities")
    .split("\n")
    .filter((l) => /ResumedActivity/.test(l))
    .some((l) => l.includes(PACKAGE));

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
  await back("the child's screen", "who-plays");
  await page.touch(id("parents"));
  await typeCode();
  await onScreen("parents", "the code opens the parents' area");
  await back("the parents' area", "who-plays");
  check(pidOf() === pid, "back never closed or restarted the app");
}

/** Home, then the launcher's icon: the same screen, the same name typed, no reload. */
async function homeAndBack() {
  await toLetters("נו");
  const before = await page.eval(`(window.__marker = Math.random(), { marker: window.__marker, life: window.__lifecycle() })`);
  const pid = pidOf();
  key("KEYCODE_HOME");
  const away = Date.now();
  await sleep(3000);
  check(!inFront(), "home: the app went behind the launcher");
  shot("c01_home");
  const saved = runAs("cat", "files/nagmon/app_log.txt");
  check(/--- saved: background\s*$/.test(saved), "in the background the app's log was written to disk");
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
  const counted = after.life.screenTimeMs - before.life.screenTimeMs;
  check(counted < awayMs - 2000, `the screen-time clock stood still in the background (${Math.round(counted)} ms counted in ${awayMs} ms)`);
  check(after.life.gameMs - before.life.gameMs < awayMs - 2000, "the game's clock stood still in the background");
  shot("c02_resumed");
  await back("the name board after coming back", "who-plays");
}

/** Android kills the app in the background; it opens again on who-plays, with everything. */
async function killedInBackground() {
  const children = await cards();
  key("KEYCODE_HOME");
  await sleep(2000);
  adb("shell", "am", "kill", PACKAGE);
  await sleep(1500);
  let how = "am kill";
  const left = pidOf();
  if (left) {
    // am kill spares a process it thinks is still in use; a low-memory kill would not
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

/** Cold starts to who-plays, as Android measures them. */
async function coldStart() {
  const parse = (line) => {
    const m = line.match(/Fully drawn org\.nagmon\.app\/\.MainActivity: \+(?:(\d+)s)?(\d+)ms/);
    return m ? Number(m[1] ?? 0) * 1000 + Number(m[2]) : null;
  };
  const drawnLines = () => logcat("-s", "ActivityTaskManager:I", "ActivityManager:I").split("\n").filter((l) => parse(l) !== null);
  const total = [];
  const drawn = [];
  for (let i = 0; i < 3; i++) {
    page?.close();
    page = null;
    adb("shell", "am", "force-stop", PACKAGE);
    await sleep(2000);
    const seen = drawnLines().length;
    const out = adb("shell", "am", "start", "-W", "-n", `${PACKAGE}/.MainActivity`);
    total.push(Number(out.match(/TotalTime:\s*(\d+)/)?.[1] ?? NaN));
    let ms = null;
    for (let w = 0; w < 40 && ms === null; w++) {
      await sleep(500);
      const lines = drawnLines();
      if (lines.length > seen) ms = parse(lines.at(-1));
    }
    drawn.push(ms);
  }
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(`cold start, first frame (am start -W TotalTime), ms: ${total.join(" ")}`);
  console.log(`cold start to who-plays (reportFullyDrawn), ms: ${drawn.map((d) => d ?? "none").join(" ")}`);
  check(drawn.every((d) => d !== null), "the app reported who-plays drawn on every start");
  const m = median(drawn.map((d) => d ?? Infinity));
  console.log(`cold start to who-plays: median ${m} ms (phone target 2000 ms, CI limit ${MAX_COLD_START_MS} ms)`);
  check(m <= MAX_COLD_START_MS, `cold start to who-plays within ${MAX_COLD_START_MS} ms (median ${m} ms)`);
  await attach();
  await onScreen("who-plays", "a cold start opens", 30_000);
}

/** The system's font at 130%: every screen still fits, nothing cut off. */
async function largeFont() {
  adb("shell", "am", "force-stop", PACKAGE);
  adb("shell", "settings", "put", "system", "font_scale", "1.3");
  try {
    await sleep(1000);
    await launch();
    await attach();
    await onScreen("who-plays", "at 130% the app opens", 30_000);
    await page.eval("document.fonts.ready.then(() => true)");
    const scale = await page.eval(`getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim()`);
    const size = await page.eval(`parseFloat(getComputedStyle(document.body).fontSize)`);
    check(scale === "1.3", `the page follows the system font size (--font-scale ${scale}, text ${size} px)`);
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
    adb("shell", "settings", "put", "system", "font_scale", "1.0");
    adb("shell", "am", "force-stop", PACKAGE);
  }
}

/** 3,000 random events in the app: no crash, no ANR, the process lives on. */
async function monkey() {
  await launch();
  await attach();
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
  const log = logcat().split("\n");
  const from = log.findLastIndex((l) => l.includes("NagmonCheck") && l.includes("monkey starts"));
  const during = log.slice(Math.max(0, from));
  const died = during.filter((l) => new RegExp(`Process ${PACKAGE.replace(/\./g, "\\.")} \\(pid \\d+\\) has died|Killing \\d+:${PACKAGE.replace(/\./g, "\\.")}`).test(l));
  check(died.length === 0, `the app's process did not die during monkey${died.length ? `: ${died.join(" | ")}` : ""}`);
  check(pidOf() === pid, `the same process after monkey (${pid} -> ${pidOf() || "none"})`);
  shot("f01_after_monkey");
}

/** Over the whole run: no crash, no ANR, no names in any log, a clean console. */
function wholeRun() {
  const crash = logcat("-b", "crash");
  check(!crash.includes(PACKAGE), "no crash of the app in the whole run (crash buffer)");
  const all = logcat();
  const lines = all.split("\n");
  const fatal = lines.filter((l, i) => /FATAL EXCEPTION/.test(l) && lines.slice(i, i + 3).some((n) => n.includes(`Process: ${PACKAGE}`)));
  check(fatal.length === 0, `no FATAL EXCEPTION in the app${fatal.length ? `: ${fatal.join(" | ")}` : ""}`);
  check(!all.includes(`ANR in ${PACKAGE}`), "no ANR in the app");
  const appLog = runAs("cat", "files/nagmon/app_log.txt");
  for (const name of ["נועה", "דן"]) {
    const where = [all.includes(name) && "the system log", appLog.includes(name) && "the app's log"].filter(Boolean);
    check(where.length === 0, `a child's name is in no log${where.length ? ` (in ${where.join(" and ")})` : ""}`);
    if (all.includes(name)) console.log(all.split("\n").filter((l) => l.includes(name)).slice(0, 5).join("\n"));
  }
  const problems = pages.flatMap((p) => p.problems);
  check(problems.length === 0, `no uncaught error and no console error or warning (${problems.length})`);
  for (const p of problems.slice(0, 20)) console.log("   ", p.slice(0, 300));
}

function dumpLogs() {
  try {
    console.log("--- crash buffer\n" + logcat("-b", "crash"));
    // the app's own lines and its WebView's, from the whole run
    const ours = /nagmon|AndroidRuntime|chromium|cr_|Capacitor|Console|libc|DEBUG|ActivityManager: (Start|Process|Killing)|Displayed|Fully drawn/;
    console.log("--- app lines\n" + logcat().split("\n").filter((l) => ours.test(l)).slice(-300).join("\n"));
  } catch (le) {
    console.log("no logcat:", String(le).split("\n")[0]);
  }
}

/** One part of the run: a failure is noted, screenshotted, and the run goes on. */
async function part(name, fn) {
  console.log(`--- ${name}`);
  try {
    await fn();
  } catch (e) {
    failures.push(`${name}: ${e}`);
    console.log("FAIL", name, e);
    try {
      shot(`z_${name.replace(/\W+/g, "_")}`);
    } catch (se) {
      console.log("no screenshot:", String(se).split("\n")[0]);
    }
    // the next part starts from a fresh app
    try {
      page?.close();
      page = null;
      adb("shell", "am", "force-stop", PACKAGE);
      await launch();
      await attach();
    } catch (re) {
      console.log("could not start the app again:", String(re).split("\n")[0]);
    }
  }
}

let started = false;
await part("first run", async () => {
  await attach();
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
  started = true;
});
if (started) {
  calibration = page.offset;
  await part("back on every screen", backEverywhere);
  await part("home and back", homeAndBack);
  await part("killed in the background", killedInBackground);
  await part("cold start", coldStart);
  await part("system font at 130%", largeFont);
  await part("monkey", monkey);
}
wholeRun();
if (failures.length) dumpLogs();
page?.close();

if (failures.length) {
  console.log("FAILED:", failures.join("; "));
  process.exit(1);
}
console.log("android e2e passed");
