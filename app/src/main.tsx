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

/** The log first, so that whatever breaks after it is written down. */
/** Resolves once who-plays is on the screen (or after 5 s, whatever happens). */
let markStarted = () => {};
const startedOrLate = new Promise<void>((resolve) => {
  markStarted = resolve;
  setTimeout(resolve, 5000);
});

async function startLog(): Promise<void> {
  try {
    const secrets = createSecretStore();
    // Not before who-plays is up: Capacitor runs every plugin call on one
    // thread, and the Keystore's first use there (a second on the
    // emulator) held up the reads of the children's profiles behind it.
    // The log hides the keys once read; a save waits for them.
    const keys = async () => {
      await startedOrLate;
      return secrets.values();
    };
    await installAppLog(fs, { secrets: keys, names: childNames });
  } catch (e) {
    console.error("Could not start the app log", e);
  }
}

/** In the background: sound off, the clocks stopped, everything written (SDD §10). */
const lifecycle = new Lifecycle({ flush: (why) => saveEverything(fs, why) });
lifecycle.bind();
// the system's font size may have changed in Settings meanwhile
lifecycle.onForeground(() => void applySystemFontScale());
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
  names: childNames,
  onCrash: async () => {
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
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(r));
  reportStarted();
  markStarted();
  performance.mark("nagmon:started");
  log.info(`Started: ${Object.entries(startTimes()).map(([k, v]) => `${k} ${v} ms`).join(", ")}`);
}

async function main(): Promise<void> {
  // the data files are read while the log starts (both wait on the disk);
  // a failure is reported below, by the crash reporter
  const opening = openServices(fs);
  opening.catch(() => undefined);
  // the font size is set before the first screen, so nothing jumps
  await Promise.all([startLog().then(() => performance.mark("nagmon:log")), applySystemFontScale()]);
  // errors after the first go to the log only (one report per session)
  installCrashHandlers(reporter, { onLater: (text) => log.error(text) });
  const started = await reporter.run(async () => {
    services = await opening;
    performance.mark("nagmon:services");
    root.render(
      <StrictMode>
        <App services={services} onStarted={() => void noteStarted()} />
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
