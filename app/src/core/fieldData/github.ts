/**
 * The connection to the private data repo on GitHub (port of
 * nagmon/field_data/github.py; docs/kids/SDD_FIELD_DATA.md §2.1,
 * docs/app/INVENTORY.md §7.2): the check that the repo is private and
 * writable, and writing new files with the Contents API.
 *
 * The token never reaches a log, a string of this object, an error or an
 * uploaded file: results carry a {@link Code} only, and HTTP bodies are
 * never logged. Only the method, the path and the status are.
 *
 * Requests go through `fetch`. GitHub's REST API answers every origin
 * (`Access-Control-Allow-Origin: *`), so the WebView's own fetch reaches
 * it from `https://localhost`. Only CORS-safe headers and the two that
 * GitHub allows (Authorization, Content-Type) are sent.
 */

export const API = "https://api.github.com";
/** The code repo is public; the data goes to its own private repo. */
export const DEFAULT_REPO = "YuvalNag/nagmon-data";
/** Each request; then it counts as a timeout. */
export const TIMEOUT_MS = 30_000;
/** How long a check is kept for the status line (it never replaces the check before a write). */
export const CHECK_TTL_MS = 3_600_000;
/** PUT attempts in all when the branch moved (409/422). */
export const MAX_TRIES = 3;
/** owner/name: the repo goes into the API URL as it is. */
export const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** What happened, in the parent's terms (the old app's `nagmon_github_<code>`). */
export type Code =
  | "ok"
  | "public"
  | "bad_token"
  | "no_permission"
  | "not_found"
  | "offline"
  | "timeout"
  | "conflict"
  | "failed"
  | "not_connected";

export interface Check {
  code: Code;
  repo: string;
}

export interface Upload {
  code: Code;
  path: string;
}

/** The part of `fetch` the client uses; tests pass their own. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
  repo?: string;
  fetch?: Fetch;
  /** ms since the epoch. */
  clock?: () => number;
  /** Method, path and status only. */
  log?: (message: string) => void;
  timeoutMs?: number;
}

/** A failure in the parent's terms. */
function statusCode(resp: Response): Code {
  if (resp.status === 401) return "bad_token";
  if (resp.status === 403) {
    // too many requests: try later, the token is fine
    return resp.headers.get("X-RateLimit-Remaining") === "0" ? "failed" : "no_permission";
  }
  if (resp.status === 404) return "not_found";
  return "failed";
}

/** UTF-8 bytes as base64. */
export function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  // in chunks: String.fromCharCode takes a bounded number of arguments
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Checks by repo and the token's hash, for the status line: in memory only. */
const checks = new Map<string, { at: number; check: Check }>();

/** Forgets every kept check (a new token, a disconnect, tests). */
export function forgetChecks(): void {
  checks.clear();
}

class NetworkError extends Error {
  constructor(readonly timeout: boolean) {
    super(timeout ? "timeout" : "offline");
  }
}

/** One repo with one token. */
export class GitHubClient {
  readonly repo: string;
  // a true private field: not shown by console.log, JSON or spread
  #token: string;
  #fetch: Fetch;
  #clock: () => number;
  #log: (message: string) => void;
  #timeoutMs: number;
  #key: Promise<string> | null = null;

  constructor(token: string, options: GitHubClientOptions = {}) {
    const repo = (options.repo ?? DEFAULT_REPO).trim();
    if (!REPO_RE.test(repo)) throw new RangeError("the repo must be owner/name");
    this.repo = repo;
    this.#token = token.trim();
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.#clock = options.clock ?? Date.now;
    this.#log = options.log ?? (() => undefined);
    this.#timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  toString(): string {
    return `GitHubClient(repo=${this.repo}, token=***)`;
  }

  toJSON(): string {
    return this.toString();
  }

  private cacheKey(): Promise<string> {
    this.#key ??= sha256Hex(this.#token).then((h) => `${this.repo}\n${h}`);
    return this.#key;
  }

  // ---------------------------------------------------------------- HTTP

  /** Rejects with a NetworkError when GitHub cannot be reached in time. */
  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#token}`,
      Accept: "application/vnd.github+json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.#timeoutMs);
    let resp: Response;
    try {
      resp = await this.#fetch(`${API}/repos/${this.repo}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // a check right after the repo was made private must not get the old answer
        cache: "no-store",
        credentials: "omit",
        signal: abort.signal,
      });
    } catch {
      // the error's text is not logged: it is the network's, not ours
      const timeout = abort.signal.aborted;
      this.#log(`GitHub ${method} ${path || "/"}: ${timeout ? "timeout" : "unreachable"}`);
      throw new NetworkError(timeout);
    } finally {
      clearTimeout(timer);
    }
    this.#log(`GitHub ${method} ${path || "/"}: ${resp.status}`);
    return resp;
  }

  // --------------------------------------------------------------- check

  /** The last check of this repo and token, if it is less than an hour old. */
  async cached(): Promise<Check | null> {
    const hit = checks.get(await this.cacheKey());
    if (!hit || this.#clock() - hit.at > CHECK_TTL_MS) return null;
    return hit.check;
  }

  /** `GET /repos/{repo}`: private and writable, or why not. */
  async check({ fresh = false } = {}): Promise<Check> {
    if (!fresh) {
      const hit = await this.cached();
      if (hit) return hit;
    }
    let resp: Response;
    try {
      resp = await this.request("GET", "");
    } catch (e) {
      // not kept: the next look asks again
      return { code: e instanceof NetworkError && e.timeout ? "timeout" : "offline", repo: this.repo };
    }
    const check: Check = { code: await classify(resp), repo: this.repo };
    // a 5xx or a rate limit passes: it is not kept either
    if (check.code !== "failed") checks.set(await this.cacheKey(), { at: this.#clock(), check });
    return check;
  }

  // --------------------------------------------------------------- write

  /**
   * A new file at `path` on the repo's default branch. Nothing is written
   * unless a fresh check says the repo is private and writable. Each path
   * is new, so no `sha` is needed.
   */
  async put(path: string, content: string, message: string): Promise<Upload> {
    const first = await this.check({ fresh: true });
    if (first.code !== "ok") return { code: first.code, path };
    const body = { message, content: base64Utf8(content) };
    const urlPath = "/contents/" + path.split("/").map(encodeURIComponent).join("/");
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      let resp: Response;
      try {
        resp = await this.request("PUT", urlPath, body);
      } catch (e) {
        return { code: e instanceof NetworkError && e.timeout ? "timeout" : "offline", path };
      }
      if (resp.status === 200 || resp.status === 201) return { code: "ok", path };
      if (resp.status !== 409 && resp.status !== 422) return { code: statusCode(resp), path };
      // the branch moved, or a brand-new repo is still empty: look again and retry
      this.#log(`GitHub write retry ${attempt}/${MAX_TRIES}`);
      if (attempt < MAX_TRIES) {
        const again = await this.check({ fresh: true });
        if (again.code !== "ok") return { code: again.code, path };
      }
    }
    return { code: "conflict", path };
  }
}

async function classify(resp: Response): Promise<Code> {
  if (resp.status !== 200) return statusCode(resp);
  let info: unknown;
  try {
    info = await resp.json();
  } catch {
    return "failed";
  }
  if (typeof info !== "object" || info === null || !("private" in info)) return "failed";
  const repo = info as { private?: unknown; permissions?: { push?: unknown } };
  if (repo.private !== true) return "public";
  if (typeof repo.permissions !== "object" || repo.permissions === null || !repo.permissions.push) return "no_permission";
  return "ok";
}
