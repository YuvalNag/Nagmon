/**
 * What the parent sends, and where it lands in the data repo (port of
 * nagmon/field_data/uploads.py; docs/kids/SDD_FIELD_DATA.md §2.1, §2.4,
 * §2.5; docs/app/INVENTORY.md §7.2):
 *
 *     devices/<install-id>/logs/<UTC>.txt
 *     devices/<install-id>/crashes/<UTC>.txt
 *     devices/<install-id>/progress/<UTC>.json
 *     devices/<install-id>/reports/<UTC>/report.json (and screenshot.jpg: the screen)
 *
 * The same paths as the old app, so the data repo stays one layout and
 * `tools/field/latest.py` reads both. Every text is cleaned of keys (and,
 * but for the progress, of the children's names) once more right before
 * it leaves. An upload is first {@link FieldData.prepare}d: the parent's
 * confirmation shows a summary (what it is, and its lines), the repo and
 * the path, not the text itself; {@link FieldData.send} sends exactly the
 * prepared text to exactly that path.
 */
import { hideNames, redactSecrets } from "../crashReport";
import type { Reports, WaitingReport } from "../report/reports";
import { redact } from "../family/parent";
import { DATA_FILES, type FileStore, type JsonObject, readJson, writeJson } from "../../platform/storage";
import { SECRET_KEYS, type SecretStore } from "../../platform/secrets";
import { type Check, type Fetch, DEFAULT_REPO, GitHubClient, type Upload, forgetChecks } from "./github";

export const DEVICE_FILE = DATA_FILES.device;
/** The most of the log the share sheet gets (its end), in bytes. */
export const SHARE_LIMIT = 200_000;
export const KINDS = { logs: ".txt", crashes: ".txt", progress: ".json", reports: ".json" } as const;
export type Kind = keyof typeof KINDS;
/** A fine-grained personal access token; a classic `ghp_` one reaches every repo and is refused. */
export const FINE_GRAINED_RE = /^github_pat_[A-Za-z0-9_]+$/;
const ID_RE = /^[0-9a-f]{8}$/;
/**
 * A screenshot bigger than this (as base64) is not sent: the phone makes
 * them 80-150 KB, and a repo is no place for megabytes. The report goes
 * without it.
 */
export const MAX_IMAGE_BYTES = 300_000;
/** The same cap as base64 characters (4 for every 3 bytes). */
export const MAX_IMAGE_BASE64 = (MAX_IMAGE_BYTES / 3) * 4;

/** The bytes a base64 string stands for. */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** What happened to a report the child just sent: shown to the parent in one line. */
export type ReportDelivery = "sent" | "queued" | "off";

/** 8 random hex digits. */
function newId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `devices/<device>/<kind>/<YYYYMMDDTHHMMSSZ><ext>`. */
export function uploadPath(device: string, kind: Kind, now: Date): string {
  if (!Object.hasOwn(KINDS, kind)) throw new RangeError(`unknown upload kind ${String(kind)}`);
  if (!ID_RE.test(device)) throw new RangeError("the install id is 8 hex digits");
  const stamp = now.toISOString().replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
  // a report is a folder of its own: report.json and screenshot.jpg
  if (kind === "reports") return `devices/${device}/reports/${stamp}/report.json`;
  return `devices/${device}/${kind}/${stamp}${KINDS[kind]}`;
}

/** The end of `text`, at most `limit` UTF-8 bytes, from a line's start. */
export function lastBytes(text: string, limit: number): string {
  const data = new TextEncoder().encode(text);
  if (data.length <= limit) return text;
  let tail = data.subarray(data.length - limit);
  const nl = tail.indexOf(0x0a);
  if (nl !== -1) tail = tail.subarray(nl + 1);
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(tail).replace(/^�+/, "");
}

/** `text` without keys (the known shapes and every saved one) and, when given, the names. */
export function cleanText(text: string, secrets: Iterable<string>, names?: Iterable<string>): string {
  const clean = redactSecrets(text, secrets);
  return names ? hideNames(clean, names) : clean;
}

async function fingerprint(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** One waiting report, ready to go: its two files in the repo. */
export interface PreparedReport {
  report: WaitingReport;
  /** In the repo: `devices/<id>/reports/<stamp>/report.json`. */
  path: string;
  /** In the repo, when the report has a screenshot. */
  imagePath: string | null;
  /** The cleaned JSON. */
  content: string;
}

/** An upload ready to go: what the confirmation shows is what is sent. */
export interface Prepared {
  kind: Kind;
  repo: string;
  path: string;
  /** The cleaned text, as it will be in the repo. */
  content: string;
  bytes: number;
  lines: number;
  /** The crash report before cleaning: marked as sent when it is. */
  crash?: string;
  /** The waiting reports, for kind "reports": `path` is then their folder, and `lines` their count. */
  reports?: PreparedReport[];
}

export interface FieldDataOptions {
  fs: FileStore;
  secrets: SecretStore;
  /** Every child's name, deleted ones too (ProfileStore.allNames). */
  names: () => Promise<Iterable<string>>;
  repo?: string;
  fetch?: Fetch;
  /** ms since the epoch. */
  clock?: () => number;
  /** Lines for the app's log: never a token or a body. */
  log?: (message: string) => void;
  makeId?: () => string;
  /** The reports waiting on the phone (the game's "something is wrong"). */
  reports?: Reports;
}

/** The parent area's side of the data repo: the token, the status, the uploads. */
export class FieldData {
  readonly repo: string;
  #fs: FileStore;
  #secrets: SecretStore;
  #names: () => Promise<Iterable<string>>;
  #fetch: Fetch | undefined;
  #clock: () => number;
  #log: (message: string) => void;
  #makeId: () => string;
  #reports: Reports | undefined;
  #sending = false;

  constructor(o: FieldDataOptions) {
    this.#fs = o.fs;
    this.#secrets = o.secrets;
    this.#names = o.names;
    this.repo = o.repo ?? DEFAULT_REPO;
    this.#fetch = o.fetch;
    this.#clock = o.clock ?? Date.now;
    this.#log = o.log ?? (() => undefined);
    this.#makeId = o.makeId ?? newId;
    this.#reports = o.reports;
  }

  toString(): string {
    return `FieldData(repo=${this.repo})`;
  }

  toJSON(): string {
    return this.toString();
  }

  // ---------------------------------------------------------- the token

  private async token(): Promise<string | null> {
    const t = await this.#secrets.get(SECRET_KEYS.githubToken);
    return t && t.trim() ? t.trim() : null;
  }

  private client(token: string): GitHubClient {
    return new GitHubClient(token, { repo: this.repo, fetch: this.#fetch, clock: this.#clock, log: this.#log });
  }

  async connected(): Promise<boolean> {
    return (await this.token()) !== null;
  }

  /** The saved token as the parent may see it ("***" and its last 4), or null. */
  async masked(): Promise<string | null> {
    const t = await this.token();
    return t === null ? null : redact(t);
  }

  /**
   * Checks a pasted token and keeps it (in the secret store only) when it
   * works. A public repo keeps it too: the parent only has to make the
   * repo private, and uploads stay refused until then. A token that fails
   * (bad, no permission, not found, offline) is not kept.
   */
  async connect(token: string): Promise<Check> {
    const clean = token.trim();
    if (!clean) return { code: "bad_token", repo: this.repo };
    // before any network call: only a fine-grained token limited to the data repo
    if (!FINE_GRAINED_RE.test(clean)) return { code: "wrong_token_type", repo: this.repo };
    const check = await this.client(clean).check({ fresh: true });
    if (check.code === "ok" || check.code === "public") {
      await this.#secrets.set(SECRET_KEYS.githubToken, clean);
      this.#log(`GitHub token saved (${check.code})`);
    } else {
      this.#log(`GitHub token not saved (${check.code})`);
    }
    return check;
  }

  // ------------------------------------------------- sending reports by itself

  /**
   * Whether reports go up without the parent: a token is saved and the
   * parents' switch is not off. The switch has no value until the parent
   * touches it, and then it counts as on: saving a token is the consent.
   */
  async reportsAuto(): Promise<boolean> {
    if ((await this.token()) === null) return false;
    const res = await readJson(this.#fs, DEVICE_FILE);
    return res.data?.reports_auto !== false;
  }

  /** The parents' switch. */
  async setReportsAuto(on: boolean): Promise<void> {
    const res = await readJson(this.#fs, DEVICE_FILE);
    await writeJson(this.#fs, DEVICE_FILE, { schema_version: 1, ...(res.data ?? {}), reports_auto: on });
  }

  /**
   * Sends every waiting report if the parents allow it: "sent" (all up, or
   * none waiting), "queued" (still on the phone: no network, the repo
   * refused, another send is running; the next start tries again) or "off"
   * (no token or the switch is off). Never rejects.
   */
  async deliverReports(): Promise<ReportDelivery> {
    try {
      if (!(await this.reportsAuto())) return "off";
      if (this.#sending) return "queued";
      const prepared = await this.prepareReports();
      if (prepared === null) return "sent";
      return (await this.send(prepared)).code === "ok" ? "sent" : "queued";
    } catch (e) {
      this.#log(`Delivery of reports failed: ${e instanceof Error ? e.name : "error"}`);
      return "queued";
    }
  }

  /** Forgets the token. */
  async disconnect(): Promise<void> {
    await this.#secrets.remove(SECRET_KEYS.githubToken);
    forgetChecks();
    this.#log("GitHub token removed");
  }

  /** The kept status, without asking GitHub; null when there is none. */
  async cachedStatus(): Promise<Check | null> {
    const t = await this.token();
    if (t === null) return { code: "not_connected", repo: this.repo };
    return this.client(t).cached();
  }

  /** Asks GitHub now. */
  async status(): Promise<Check> {
    const t = await this.token();
    if (t === null) return { code: "not_connected", repo: this.repo };
    return this.client(t).check({ fresh: true });
  }

  // ------------------------------------------------------------ device

  /**
   * 8 random hex digits, made once per install and kept in device.json.
   * Not the phone's id: it only tells two installs' uploads apart.
   */
  async installId(): Promise<string> {
    const res = await readJson(this.#fs, DEVICE_FILE);
    const data: JsonObject = res.data ?? {};
    const current = data.install_id;
    if (typeof current === "string" && ID_RE.test(current)) return current;
    const id = this.#makeId();
    if (!ID_RE.test(id)) throw new RangeError("the install id is 8 hex digits");
    await writeJson(this.#fs, DEVICE_FILE, { schema_version: 1, ...data, install_id: id });
    return id;
  }

  // ----------------------------------------------------------- uploads

  /** Every saved key, the token among them: what must never leave. */
  private async allSecrets(): Promise<string[]> {
    return this.#secrets.values();
  }

  /** `text` without keys, the token and (`names`) the children's names. */
  async clean(text: string, { names = true } = {}): Promise<string> {
    return cleanText(text, await this.allSecrets(), names ? await this.#names() : undefined);
  }

  /** The log for Android's share sheet: cleaned as for GitHub, its end. */
  async shareableLog(text: string, limit = SHARE_LIMIT): Promise<string> {
    return lastBytes(await this.clean(text), limit);
  }

  /** The progress snapshot as it is sent: built without names, its skill ids intact. */
  static progressText(snapshot: JsonObject): string {
    return JSON.stringify(snapshot, null, 1) + "\n";
  }

  /** The path and the cleaned text, for the confirmation, now. */
  async prepare(kind: Kind, text: string, { crash }: { crash?: string } = {}): Promise<Prepared> {
    const content = await this.clean(text, { names: kind !== "progress" });
    const path = uploadPath(await this.installId(), kind, new Date(this.#clock()));
    const bytes = new TextEncoder().encode(content).length;
    const lines = content ? content.split("\n").length - (content.endsWith("\n") ? 1 : 0) : 0;
    return { kind, repo: this.repo, path, content, bytes, lines, crash };
  }

  /** How many reports wait on the phone. */
  async waitingReports(): Promise<number> {
    return (await this.#reports?.count()) ?? 0;
  }

  /**
   * The waiting reports, for the confirmation: their count and size, the
   * repo and the folder. The typed text stays as typed (names are only
   * hidden in the rest, when the report is made); keys are hidden here.
   * Null when none waits.
   */
  async prepareReports(): Promise<Prepared | null> {
    const reports = this.#reports;
    const waiting = reports ? await reports.waiting() : [];
    if (!reports || waiting.length === 0) return null;
    const device = await this.installId();
    const folder = `devices/${device}/reports/`;
    const used = new Set<string>();
    const items: PreparedReport[] = [];
    let bytes = 0;
    const enc = new TextEncoder();
    for (const report of waiting) {
      const json = await reports.read(report);
      if (json === null) {
        // not a report any more (a file cut short): it goes, and nothing else waits for it
        await reports.done(report);
        continue;
      }
      // the children's names are hidden in the typed text too: it leaves the phone
      const content = await this.clean(JSON.stringify(json, null, 1) + "\n");
      // two children in one second: the second file gets its child's id too
      let name = report.stamp;
      if (used.has(name)) name = `${name}-${report.child}`;
      used.add(name);
      const image = report.imagePath !== null ? `${folder}${name}/screenshot.jpg` : null;
      items.push({ report, path: `${folder}${name}/report.json`, imagePath: image, content });
      bytes += enc.encode(content).length;
      if (image !== null) bytes += Math.floor(((await this.imageSize(report)) * 3) / 4);
    }
    if (items.length === 0) return null;
    return { kind: "reports", repo: this.repo, path: folder, content: "", bytes, lines: items.length, reports: items };
  }

  private async imageSize(r: WaitingReport): Promise<number> {
    if (r.imagePath === null) return 0;
    try {
      return (await this.#fs.readBase64(r.imagePath))?.length ?? 0;
    } catch {
      return 0;
    }
  }

  get sending(): boolean {
    return this.#sending;
  }

  /** Sends what was prepared (and confirmed). One upload at a time. */
  async send(p: Prepared): Promise<Upload> {
    if (this.#sending) return { code: "failed", path: p.path };
    const t = await this.token();
    if (t === null) return { code: "not_connected", path: p.path };
    this.#sending = true;
    try {
      if (p.kind === "reports") {
        const result = await this.sendReports(p, t);
        this.#log(`Upload of reports: ${result.code}`);
        return result;
      }
      // cleaned once more: a key saved since the confirmation is hidden too
      const content = await this.clean(p.content, { names: p.kind !== "progress" });
      const result = await this.client(t).put(p.path, content, `Field data: ${p.kind}`);
      this.#log(`Upload of ${p.kind}: ${result.code}`);
      if (result.code === "ok" && p.crash !== undefined) await this.markCrashSent(p.crash);
      return result;
    } finally {
      this.#sending = false;
    }
  }

  /**
   * Each waiting report: its screenshot, then its JSON, one after the
   * other; a report that went up is removed from the phone, so a try
   * that stops (no network) goes on from where it stopped.
   */
  private async sendReports(p: Prepared, token: string): Promise<Upload> {
    const reports = this.#reports;
    if (!reports || !p.reports) return { code: "failed", path: p.path };
    const client = this.client(token);
    for (const item of p.reports) {
      const { report } = item;
      if (item.imagePath !== null && !report.imageSent) {
        const image = report.imagePath === null ? null : await this.#fs.readBase64(report.imagePath).catch(() => null);
        // a missing or oversize screenshot does not hold the report back
        if (image && base64Bytes(image) <= MAX_IMAGE_BYTES) {
          const sent = await client.putBase64(item.imagePath, image, "Field data: reports");
          if (sent.code !== "ok") return sent;
          await reports.markImageSent(report);
        }
      }
      // cleaned once more: a key saved since the confirmation is hidden too
      const content = await this.clean(item.content);
      const sent = await client.put(item.path, content, "Field data: reports");
      if (sent.code !== "ok") return sent;
      await reports.done(report);
    }
    return { code: "ok", path: p.path };
  }

  // ------------------------------------------------------------ crashes

  /** The last crash report, unless it was already sent. */
  async pendingCrash(): Promise<string | null> {
    let text: string | null;
    try {
      text = await this.#fs.readText(DATA_FILES.lastCrash);
    } catch {
      return null;
    }
    if (!text || !text.trim()) return null;
    const res = await readJson(this.#fs, DEVICE_FILE);
    if (res.data?.crash_sent === (await fingerprint(text))) return null;
    return text;
  }

  private async markCrashSent(text: string): Promise<void> {
    const res = await readJson(this.#fs, DEVICE_FILE);
    await writeJson(this.#fs, DEVICE_FILE, { ...(res.data ?? {}), crash_sent: await fingerprint(text) });
  }
}
