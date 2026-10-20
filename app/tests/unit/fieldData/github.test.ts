/**
 * The GitHub client (port of tests/nagmon/test_field_github.py's client
 * cases): the repo must be private and writable, a write waits for a fresh
 * check, 409/422 are retried, every failure has its code, and the token
 * is in no log line, string or error.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  API,
  CHECK_TTL_MS,
  DEFAULT_REPO,
  type Fetch,
  GitHubClient,
  MAX_TRIES,
  base64Utf8,
  forgetChecks,
} from "../../../src/core/fieldData/github";

const TOKEN = "github_pat_TEST" + "0123456789".repeat(4);

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: { message?: string; content?: string; branch?: string } | null;
}

type Answer = Response | Error | (() => Response | Error | Promise<never>);

/** A fetch that answers from a list, recording each call. */
function fakeFetch(...answers: Answer[]) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({
      method: String(init.method),
      url,
      headers: { ...(init.headers as Record<string, string>) },
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    let a = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (typeof a === "function") a = await a();
    if (a instanceof Error) throw a;
    return a.clone();
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const repoInfo = (over: object = {}) => json(200, { private: true, permissions: { push: true }, ...over });
const created = () => json(201, { content: {} });

function client(fetch: Fetch, { clock = (): number => 1_000_000, lines = [] as string[] } = {}) {
  return new GitHubClient(TOKEN, { fetch, clock, log: (m) => lines.push(m) });
}

afterEach(() => forgetChecks());

describe("redirects", () => {
  it("are not followed, and an opaque redirect is a failure", async () => {
    let init: RequestInit = {};
    const fetch: Fetch = async (_url, i) => {
      init = i;
      return { status: 0, type: "opaqueredirect", headers: new Headers(), json: async () => ({}) } as unknown as Response;
    };
    expect((await client(fetch).check({ fresh: true })).code).toBe("failed");
    expect(init.redirect).toBe("manual");
  });
});

describe("the check", () => {
  it("a private, writable repo is ok", async () => {
    const { fetch, calls } = fakeFetch(repoInfo());
    expect(await client(fetch).check()).toEqual({ code: "ok", repo: DEFAULT_REPO });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`${API}/repos/${DEFAULT_REPO}`);
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("a public repo is refused", async () => {
    const { fetch } = fakeFetch(repoInfo({ private: false }));
    expect((await client(fetch).check()).code).toBe("public");
  });

  it("no push permission, 401, 403, 404 and a rate limit each have their code", async () => {
    const cases: [Response, string][] = [
      [repoInfo({ permissions: { push: false } }), "no_permission"],
      [repoInfo({ permissions: undefined }), "no_permission"],
      [json(401, { message: "Bad credentials" }), "bad_token"],
      [json(403, { message: "Resource not accessible" }), "no_permission"],
      [json(403, { message: "rate limit" }, { "X-RateLimit-Remaining": "0" }), "failed"],
      [json(404, { message: "Not Found" }), "not_found"],
      [json(500, {}), "failed"],
      [new Response("not json", { status: 200 }), "failed"],
      [json(200, { name: "x" }), "failed"],
    ];
    for (const [resp, code] of cases) {
      forgetChecks();
      const { fetch } = fakeFetch(resp);
      expect((await client(fetch).check({ fresh: true })).code, code).toBe(code);
    }
  });

  it("no network is offline; no answer in time is a timeout", async () => {
    expect((await client(fakeFetch(new TypeError("Failed to fetch")).fetch).check()).code).toBe("offline");
    const slow: Fetch = (_url, init) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const c = new GitHubClient(TOKEN, { fetch: slow, timeoutMs: 20 });
    expect((await c.check()).code).toBe("timeout");
  });

  it("is kept an hour for the status line, by repo and token; failures and offline are not kept", async () => {
    let now = 1_000_000;
    const { fetch, calls } = fakeFetch(repoInfo());
    const c = client(fetch, { clock: () => now });
    await c.check();
    await c.check();
    expect(calls).toHaveLength(1);
    expect(await c.cached()).toEqual({ code: "ok", repo: DEFAULT_REPO });
    // another token is another check
    expect(await new GitHubClient("github_pat_TESTother000000000000000000000", { fetch }).cached()).toBeNull();
    now += CHECK_TTL_MS + 1;
    expect(await c.cached()).toBeNull();
    await c.check();
    expect(calls).toHaveLength(2);

    forgetChecks();
    const down = fakeFetch(json(503, {}));
    await client(down.fetch).check();
    expect(await client(down.fetch).cached()).toBeNull();
    const off = fakeFetch(new TypeError("offline"));
    await client(off.fetch).check();
    expect(await client(off.fetch).cached()).toBeNull();
  });

  it("refuses a repo that is not owner/name", () => {
    expect(() => new GitHubClient(TOKEN, { repo: "../../user" })).toThrow(RangeError);
    expect(() => new GitHubClient(TOKEN, { repo: "a/b?x=1" })).toThrow(RangeError);
  });
});

describe("a write", () => {
  const PATH = "devices/0123abcd/logs/20261020T120000Z.txt";

  it("checks afresh first, then PUTs the base64 text with no branch and no sha", async () => {
    const { fetch, calls } = fakeFetch(repoInfo(), repoInfo(), created());
    const c = client(fetch);
    await c.check(); // kept, but a write asks again
    calls.length = 0;
    const r = await c.put(PATH, "שורה אחת\n", "Field data: logs");
    expect(r).toEqual({ code: "ok", path: PATH });
    expect(calls.map((x) => x.method)).toEqual(["GET", "PUT"]);
    expect(calls[1]!.url).toBe(`${API}/repos/${DEFAULT_REPO}/contents/${PATH}`);
    expect(calls[1]!.headers["Content-Type"]).toBe("application/json");
    expect(calls[1]!.body).toEqual({ message: "Field data: logs", content: base64Utf8("שורה אחת\n") });
    expect(new TextDecoder().decode(Uint8Array.from(atob(calls[1]!.body!.content!), (ch) => ch.charCodeAt(0)))).toBe("שורה אחת\n");
  });

  it("writes nothing to a public repo, or with a bad token", async () => {
    for (const [resp, code] of [
      [repoInfo({ private: false }), "public"],
      [json(401, {}), "bad_token"],
      [json(404, {}), "not_found"],
    ] as const) {
      const { fetch, calls } = fakeFetch(resp);
      expect((await client(fetch).put(PATH, "x", "m")).code).toBe(code);
      expect(calls.filter((x) => x.method === "PUT")).toEqual([]);
    }
  });

  it("retries 409 and 422 with a check between, at most three times", async () => {
    const { fetch, calls } = fakeFetch(repoInfo(), json(409, {}), repoInfo(), json(422, {}), repoInfo(), created());
    expect((await client(fetch).put(PATH, "x", "m")).code).toBe("ok");
    expect(calls.map((x) => x.method)).toEqual(["GET", "PUT", "GET", "PUT", "GET", "PUT"]);

    const always = fakeFetch(repoInfo(), json(409, {}), repoInfo(), json(409, {}), repoInfo(), json(409, {}));
    const lines: string[] = [];
    expect((await client(always.fetch, { lines }).put(PATH, "x", "m")).code).toBe("conflict");
    expect(always.calls.filter((x) => x.method === "PUT")).toHaveLength(MAX_TRIES);
    expect(lines.filter((l) => l.includes("retry"))).toHaveLength(MAX_TRIES);
  });

  it("stops when the repo turned public between the tries", async () => {
    const { fetch, calls } = fakeFetch(repoInfo(), json(409, {}), repoInfo({ private: false }));
    expect((await client(fetch).put(PATH, "x", "m")).code).toBe("public");
    expect(calls.filter((x) => x.method === "PUT")).toHaveLength(1);
  });

  it("no network during the write is offline", async () => {
    const { fetch } = fakeFetch(repoInfo(), new TypeError("Failed to fetch"));
    expect((await client(fetch).put(PATH, "x", "m")).code).toBe("offline");
  });
});

describe("the token", () => {
  it("is in no log line, string or JSON", async () => {
    const lines: string[] = [];
    const { fetch } = fakeFetch(repoInfo(), repoInfo(), json(409, {}), repoInfo(), created(), new TypeError(`boom ${TOKEN}`));
    const c = client(fetch, { lines });
    await c.check({ fresh: true });
    await c.put("devices/0123abcd/logs/x.txt", "x", "m");
    await c.check({ fresh: true });
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join("\n")).not.toContain("TEST0123");
    expect(String(c)).not.toContain(TOKEN);
    expect(JSON.stringify({ c })).not.toContain(TOKEN);
    expect(lines).toContain("GitHub GET /: 200");
  });
});
