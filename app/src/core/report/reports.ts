/**
 * The reports kept on the phone (docs/app/SDD.md §7.2):
 *
 *     profiles/<id>/reports/<UTC>.json   what the parent said and where the child was
 *     profiles/<id>/reports/<UTC>.jpg    the screen at that moment (when the phone could take it)
 *
 * A report waits there until it is uploaded: by itself right after it is
 * saved and on every start (FieldData.deliverReports, when the parents'
 * area allows it), or by the parents' "send reports" button; after a good
 * upload its files go.
 * At most {@link MAX_WAITING} wait: a new one pushes out the oldest.
 */
import { DATA_FILES, type FileStore, isJsonObject, joinPath, type JsonObject } from "../../platform/storage";
import type { FieldLog } from "../game/fieldLog";
import { buildReport, NO_CHIP, reportStamp, type ReportChip, type ReportContext } from "./report";

export const MAX_WAITING = 20;

export interface SaveReport {
  /** The profile's id. */
  child: string;
  chip: ReportChip | null;
  text: string;
  screen: string;
  context: ReportContext;
  /** The screenshot as base64 JPEG, or null where none could be taken. */
  screenshot: string | null;
}

/** A report on disk, not yet sent. */
export interface WaitingReport {
  child: string;
  stamp: string;
  /** The JSON file, relative to the data root. */
  jsonPath: string;
  /** The screenshot's file, or null. */
  imagePath: string | null;
  /** The screenshot is already in the data repo (an earlier try got that far). */
  imageSent: boolean;
}

export interface ReportsOptions {
  fs: FileStore;
  /** The game's field log: one line for each report. */
  field: Pick<FieldLog, "reportSent">;
  /** The app's version and build. */
  build: () => { version: string; build: string };
  /** The app's log as text. */
  log: () => string;
  /** Every child's name, deleted ones too. */
  names: () => Promise<Iterable<string>>;
  clock?: () => number;
}

const dir = (child: string) => joinPath(DATA_FILES.profileDir(child), "reports");
const SENT_MARK = ".jpg.sent";

export class Reports {
  #o: ReportsOptions;

  constructor(options: ReportsOptions) {
    this.#o = options;
  }

  /**
   * Writes a report (and its screenshot) and one line in the log. Nothing
   * is required: no chip and no text still records the screen.
   */
  async save(r: SaveReport): Promise<WaitingReport> {
    const { fs } = this.#o;
    const now = new Date((this.#o.clock ?? Date.now)());
    const base = reportStamp(now);
    // two in one second (a double tap that got through): the second one gets a number
    let stamp = base;
    for (let n = 2; (await fs.stat(`${dir(r.child)}/${stamp}.json`)) !== null; n++) stamp = `${base}-${n}`;
    const { version, build } = this.#o.build();
    const json = buildReport({
      now,
      version,
      build,
      child: r.child,
      chip: r.chip,
      text: r.text,
      screen: r.screen,
      context: r.context,
      screenshot: r.screenshot !== null,
      log: this.#o.log(),
      names: await this.#o.names(),
    });
    const jsonPath = `${dir(r.child)}/${stamp}.json`;
    const imagePath = r.screenshot === null ? null : `${dir(r.child)}/${stamp}.jpg`;
    // the picture first: a report is never there without the picture it says it has
    if (imagePath !== null && r.screenshot !== null) await fs.writeBase64(imagePath, r.screenshot);
    await fs.writeText(jsonPath, JSON.stringify(json, null, 1) + "\n");
    this.#o.field.reportSent({ screen: r.screen, chip: r.chip ?? NO_CHIP });
    await this.prune();
    return { child: r.child, stamp, jsonPath, imagePath, imageSent: false };
  }

  /** The reports waiting to be sent, oldest first. */
  async waiting(): Promise<WaitingReport[]> {
    const { fs } = this.#o;
    const out: WaitingReport[] = [];
    for (const entry of await fs.list(DATA_FILES.profiles)) {
      if (entry.kind !== "dir") continue;
      const child = entry.name;
      const files = new Set((await fs.list(dir(child))).filter((f) => f.kind === "file").map((f) => f.name));
      for (const name of files) {
        const m = /^(.+)\.json$/.exec(name);
        if (!m) continue;
        const stamp = m[1]!;
        const image = `${stamp}.jpg`;
        out.push({
          child,
          stamp,
          jsonPath: `${dir(child)}/${name}`,
          imagePath: files.has(image) ? `${dir(child)}/${image}` : null,
          imageSent: files.has(`${stamp}${SENT_MARK}`),
        });
      }
    }
    return out.sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : a.child < b.child ? -1 : 1));
  }

  async count(): Promise<number> {
    return (await this.waiting()).length;
  }

  /** The report's JSON as kept, or null if it cannot be read. */
  async read(r: WaitingReport): Promise<JsonObject | null> {
    try {
      const text = await this.#o.fs.readText(r.jsonPath);
      const data: unknown = text === null ? null : JSON.parse(text);
      return isJsonObject(data) ? data : null;
    } catch {
      return null;
    }
  }

  /** The screenshot went up: an earlier try that stops later does not send it again. */
  async markImageSent(r: WaitingReport): Promise<void> {
    await this.#o.fs.writeText(`${dir(r.child)}/${r.stamp}${SENT_MARK}`, "1");
  }

  /** The report is in the data repo: its files go. */
  async done(r: WaitingReport): Promise<void> {
    const { fs } = this.#o;
    for (const path of [r.jsonPath, `${dir(r.child)}/${r.stamp}.jpg`, `${dir(r.child)}/${r.stamp}${SENT_MARK}`]) {
      await fs.remove(path).catch(() => undefined);
    }
  }

  /** Keeps the newest {@link MAX_WAITING}; the files of the rest are removed. */
  private async prune(): Promise<void> {
    const all = await this.waiting();
    for (const r of all.slice(0, Math.max(0, all.length - MAX_WAITING))) await this.done(r);
  }
}
