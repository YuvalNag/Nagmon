import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { openServices, type Services } from "./app/services";
import { CrashReporter, CrashReports, installCrashHandlers } from "./core/crashReport";
import { t } from "./i18n";
import { appLogTail, buildInfo, getLogger, installAppLog, noteCrash, saveAppLog } from "./platform/appLog";
import { gameClock, Lifecycle, saveEverything, screenTimeClock } from "./platform/lifecycle";
import { createSecretStore } from "./platform/secrets";
import { applySystemFontScale, reportStarted } from "./platform/shell";
import { createFileStore } from "./platform/storage";
import { installTapTiming } from "./platform/tapTiming";
import "./styles.css";

performance.mark("nagmon:script");
const log = getLogger("nagmon.start");
const root = createRoot(document.getElementById("root")!);
const fs = createFileStore();
let services: Services | null = null;

installTapTiming();

const childNames = async () => (services ? (await services.profiles.list()).map((p) => p.name) : []);

const secretStore = createSecretStore();

/**
 * The log reads the saved keys only once who-plays is up, after 5 s, or
 * as soon as anything is to be saved (the background, a crash), whichever
 * comes first. Capacitor runs every plugin call on one thread, and the
 * Keystore's first use there (a second on the emulator) held up the reads
 * of the children's profiles behind it. The log hides the keys once read.
 */
let keysNow = () => {};
const keysWanted = new Promise<void>((resolve) => {
  keysNow = resolve;
  setTimeout(resolve, 5000);
});

/** The log first, so that whatever breaks after it is written down. */
async function startLog(): Promise<void> {
  try {
    const keys = async () => {
      await keysWanted;
      return secretStore.values();
    };
    await installAppLog(fs, { secrets: keys, names: childNames });
  } catch (e) {
    console.error("Could not start the app log", e);
  }
}

/** In the background: sound off, the clocks stopped, everything written (SDD §10). */
const lifecycle = new Lifecycle({
  flush: (why) => {
    // a save must not wait for the start
    keysNow();
    return saveEverything(fs, why);
  },
});
lifecycle.bind();
// the system's font size may have changed in Settings meanwhile
lifecycle.onForeground(() => void applySystemFontScale());
// the emulator check writes a line of its own, to find it in the saved log
(globalThis as { __appLogMark?: (text: string) => void }).__appLogMark = (text) =>
  getLogger("nagmon.check").info(String(text).slice(0, 80));
// the browser tests and the emulator check read it
(globalThis as { __lifecycle?: () => object }).__lifecycle = () => ({
  ...lifecycle.snapshot(),
  gameMs: gameClock.now(),
  screenTimeMs: screenTimeClock.now(),
});

const reporter = new CrashReporter(new CrashReports(fs), {
  info: () => ({ ...buildInfo(), device: navigator.userAgent }),
  // the parents' area will offer it with "send log"; until then it waits on disk
  offer: () => log.info("A crash report is saved in crash/last_crash.txt"),
  log: () => appLogTail(120),
  // the report hides the saved keys, read now, not after the start
  secrets: () => secretStore.values(),
  names: childNames,
  onCrash: async () => {
    keysNow();
    noteCrash();
    await saveAppLog({ ending: "crash" });
  },
  warn: (message) => log.warning(message),
});

/** How long the start took, ms from the page's own start: in the log, and read by the emulator check. */
function startTimes(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of performance.getEntriesByType("mark")) {
    if (m.name.startsWith("nagmon:")) out[m.name.slice(7)] = Math.round(m.startTime);
  }
  return out;
}
(globalThis as { __startTimes?: () => object }).__startTimes = startTimes;

/** Who-plays is drawn with the children and its own font: the app has started. */
let startNoted = false;
async function noteStarted(): Promise<void> {
  if (startNoted) return;
  startNoted = true;
  await fontLoad;
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(r));
  reportStarted();
  keysNow();
  performance.mark("nagmon:started");
  log.info(`Started: ${Object.entries(startTimes()).map(([k, v]) => `${k} ${v} ms`).join(", ")}`);
}

// the font for the first screen, Hebrew and Latin, loading while the data
// is read: who-plays then appears with its text, not blank and then drawn
const fontLoad = Promise.all([
  document.fonts.load("500 1em NagmonRubik", "מי משחק"),
  document.fonts.load("500 1em NagmonRubik", "abc"),
]).catch(() => undefined);

async function main(): Promise<void> {
  // the data files are read while the log starts (both wait on the disk);
  // a failure is reported below, by the crash reporter
  const opening = openServices(fs);
  opening.catch(() => undefined);
  // the font size is set before the first screen, so nothing jumps
  await Promise.all([startLog().then(() => performance.mark("nagmon:log")), applySystemFontScale(), fontLoad]);
  // errors after the first go to the log only (one report per session)
  installCrashHandlers(reporter, { onLater: (text) => log.error(text) });
  const started = await reporter.run(async () => {
    services = await opening;
    performance.mark("nagmon:services");
    root.render(
      <StrictMode>
        <App services={services} onStarted={() => void noteStarted()} lifecycle={lifecycle} />
      </StrictMode>,
    );
  });
  if (!started) {
    root.render(
      <main className="screen" data-screen="start-failed">
        <p className="notice">{t("startFailed")}</p>
      </main>,
    );
  }
}

void main();
