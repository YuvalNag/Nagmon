/**
 * What the parent sends, and where it lands in the data repo (port of
 * nagmon/field_data/uploads.py; docs/kids/SDD_FIELD_DATA.md §2.1, §2.4,
 * §2.5; docs/app/INVENTORY.md §7.2):
 *
 *     devices/<install-id>/logs/<UTC>.txt
 *     devices/<install-id>/crashes/<UTC>.txt
 *     devices/<install-id>/progress/<UTC>.json
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
import { redact } from "../family/parent";
import { DATA_FILES, type FileStore, type JsonObject, readJson, writeJson } from "../../platform/storage";
import { SECRET_KEYS, type SecretStore } from "../../platform/secrets";
import { type Check, type Fetch, DEFAULT_REPO, GitHubClient, type Upload, forgetChecks } from "./github";

export const DEVICE_FILE = DATA_FILES.device;
/** The most of the log the share sheet gets (its end), in bytes. */
export const SHARE_LIMIT = 200_000;
export const KINDS = { logs: ".txt", crashes: ".txt", progress: ".json" } as const;
export type Kind = keyof typeof KINDS;
/** A fine-grained personal access token; a classic `ghp_` one reaches every repo and is refused. */
export const FINE_GRAINED_RE = /^github_pat_[A-Za-z0-9_]+$/;
const ID_RE = /^[0-9a-f]{8}$/;

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
