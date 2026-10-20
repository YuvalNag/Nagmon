/**
 * The APK on an Android emulator, checked through its real WebView:
 * Playwright connects to the WebView's DevTools socket over adb, so the
 * same selectors as the browser tests work on the phone's own engine
 * (docs/app/SDD.md §6, layer 3).
 *
 * Usage (on the CI host, emulator booted, APK installed):
 *   node tests/android/run.mjs OUTDIR
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PACKAGE = "org.nagmon.app";
const out = process.argv[2] ?? "android-e2e";
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
  const png = execFileSync("adb", ["exec-out", "screencap", "-p"]);
  const path = join(out, `${name}.png`);
  writeFileSync(path, png);
  return path;
}

async function webview() {
  for (let i = 0; i < 60; i++) {
    const pid = adb("shell", "pidof", PACKAGE);
    const sockets = adb("shell", "cat", "/proc/net/unix");
    if (pid && sockets.includes(`webview_devtools_remote_${pid}`)) {
      adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
      return chromium.connectOverCDP("http://127.0.0.1:9222");
    }
    await sleep(1000);
  }
  throw new Error("the app's WebView never opened a DevTools socket");
}

/**
 * The family's phone is set to Hebrew. `cmd locale` exists only on newer
 * Android; the emulator image is rooted, so set the property and restart
 * the system's Java side instead.
 */
async function setHebrew() {
  try {
    adb("shell", "cmd", "locale", "set-system-locales", "he-IL");
  } catch {
    adb("root");
    await sleep(3000);
    adb("wait-for-device");
    adb("shell", "setprop", "persist.sys.locale", "he-IL");
    adb("shell", "setprop", "ctl.restart", "zygote");
    await sleep(5000);
    for (let i = 0; i < 120; i++) {
      try {
        if (adb("shell", "getprop", "sys.boot_completed") === "1") break;
      } catch {
        // adb drops while the system restarts
      }
      await sleep(1000);
    }
  }
  const locale = adb("shell", "getprop", "persist.sys.locale");
  console.log("system locale:", locale);
  check(locale.startsWith("he"), "the emulator is set to Hebrew");
}

await setHebrew();
adb("shell", "am", "force-stop", PACKAGE);
adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1");

const browser = await webview();
const page = browser.contexts()[0].pages()[0];
await page.waitForSelector("[data-screen=who-plays]", { timeout: 30_000 });
await page.evaluate(() => document.fonts.ready);

const size = await page.evaluate(() => ({
  w: window.innerWidth,
  h: window.innerHeight,
  dir: document.documentElement.dir,
  heading: document.querySelector("h1")?.textContent,
  rubik: document.fonts.check("500 20px Rubik", "שלום"),
}));
console.log("webview", JSON.stringify(size));
check(size.w > size.h, "landscape");
check(size.dir === "rtl", "right to left");
check(size.heading === "מי משחק היום?", "Hebrew on a Hebrew phone");
check(size.rubik, "the Rubik font is loaded");
shot("a01_who_plays");

await browser.close();
if (failures.length) {
  console.log("FAILED:", failures.join("; "));
  process.exit(1);
}
console.log("android e2e passed");
