import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { openServices, type Services } from "./app/services";
import { CrashReporter, CrashReports, installCrashHandlers } from "./core/crashReport";
import { t } from "./i18n";
import {
  appLogTail,
  bindLifecycleSaves,
  buildInfo,
  getLogger,
  installAppLog,
  noteCrash,
  saveAppLog,
} from "./platform/appLog";
import { createFileStore } from "./platform/storage";
import { installTapTiming } from "./platform/tapTiming";
import "./styles.css";

const log = getLogger("nagmon.start");
const root = createRoot(document.getElementById("root")!);
const fs = createFileStore();
let services: Services | null = null;

installTapTiming();

/** The log first, so that whatever breaks after it is written down. */
async function startLog(): Promise<void> {
  try {
    await installAppLog(fs);
    bindLifecycleSaves();
  } catch (e) {
    console.error("Could not start the app log", e);
  }
}

const reporter = new CrashReporter(new CrashReports(fs), {
  info: () => ({ ...buildInfo(), device: navigator.userAgent }),
  // the parents' area will offer it with "send log"; until then it waits on disk
  offer: () => log.info("A crash report is saved in crash/last_crash.txt"),
  log: () => appLogTail(120),
  names: async () => (services ? (await services.profiles.list()).map((p) => p.name) : []),
  onCrash: async () => {
    noteCrash();
    await saveAppLog({ ending: "crash" });
  },
  warn: (message) => log.warning(message),
});

async function main(): Promise<void> {
  await startLog();
  // errors after the first go to the log only (one report per session)
  installCrashHandlers(reporter, { onLater: (text) => log.error(text) });
  const started = await reporter.run(async () => {
    services = await openServices(fs);
    root.render(
      <StrictMode>
        <App services={services} />
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
