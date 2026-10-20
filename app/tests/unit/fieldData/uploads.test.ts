/**
 * What is sent and where (port of tests/nagmon/test_field_github.py's
 * upload cases and test_snapshot.py): the old app's paths, the install id,
 * keys and names hidden right before the text leaves, a token kept only
 * when it works, the last crash sent once, a progress snapshot without
 * names; and after a whole flow, no token in the app's log or its file.
 */
import { afterEach, describe, expect, it } from "vitest";
import { defaultSettings } from "../../../src/core/family/parent";
import { ProfileStore } from "../../../src/core/family/profiles";
import { type Fetch, forgetChecks } from "../../../src/core/fieldData/github";
import { progressSnapshot } from "../../../src/core/fieldData/snapshot";
import { FieldData, KINDS, SHARE_LIMIT, cleanText, lastBytes, uploadPath } from "../../../src/core/fieldData/uploads";
import { LOG_FILE, appLogText, getLogger, installAppLog, saveAppLog, uninstallAppLog } from "../../../src/platform/appLog";
import { MemorySecretStore, SECRET_KEYS } from "../../../src/platform/secrets";
import { MemoryFileStore } from "../../../src/platform/storage";

const TOKEN = "ghp_TEST" + "abcdefghij".repeat(4);
const AI_KEY = "plain-ai-key-0123456789";
const NOW = Date.UTC(2026, 9, 20, 8, 5, 9);

afterEach(() => {
  forgetChecks();
  uninstallAppLog();
});

interface Put {
  url: string;
  message: string;
  content: string;
}

/** GitHub: the repo private (or not), and every write recorded. */
function github({ isPrivate = true, status = 200 } = {}) {
  const puts: Put[] = [];
  const fetch: Fetch = async (url, init) => {
    if (init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      const bytes = Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0));
      puts.push({ url, message: body.message, content: new TextDecoder().decode(bytes) });
      return new Response("{}", { status: 201 });
    }
    return new Response(JSON.stringify({ private: isPrivate, permissions: { push: true } }), { status });
  };
  return { fetch, puts };
}

async function setup({ isPrivate = true, status = 200, names = ["נועם", "Maya"] } = {}) {
  const fs = new MemoryFileStore();
  const secrets = new MemorySecretStore();
  await secrets.set(SECRET_KEYS.aiKey("groq"), AI_KEY);
  const profiles = new ProfileStore(fs);
  for (const name of names) await profiles.create({ name, avatar: "boy_blue", grade: 3 });
  const gh = github({ isPrivate, status });
  const lines: string[] = [];
  const data = new FieldData({
    fs,
    secrets,
    names: () => profiles.allNames(),
    fetch: gh.fetch,
    clock: () => NOW,
    log: (m) => lines.push(m),
    makeId: () => "0a1b2c3d",
  });
  return { fs, secrets, profiles, data, gh, lines };
}

describe("paths", () => {
  it("are the old app's: devices/<install id>/<kind>/<UTC stamp><ext>", () => {
    const now = new Date(NOW);
    expect(uploadPath("0a1b2c3d", "logs", now)).toBe("devices/0a1b2c3d/logs/20261020T080509Z.txt");
    expect(uploadPath("0a1b2c3d", "crashes", now)).toBe("devices/0a1b2c3d/crashes/20261020T080509Z.txt");
    expect(uploadPath("0a1b2c3d", "progress", now)).toBe("devices/0a1b2c3d/progress/20261020T080509Z.json");
    expect(Object.keys(KINDS)).toEqual(["logs", "crashes", "progress"]);
  });

  it("refuse an unknown kind or a bad install id", () => {
    expect(() => uploadPath("0a1b2c3d", "photos" as never, new Date())).toThrow(RangeError);
    expect(() => uploadPath("../x", "logs", new Date())).toThrow(RangeError);
  });

  it("use one install id, made once and kept in device.json", async () => {
    const { data, fs } = await setup();
    expect(await data.installId()).toBe("0a1b2c3d");
    const kept = JSON.parse((await fs.readText("device.json"))!);
    expect(kept).toEqual({ schema_version: 1, install_id: "0a1b2c3d" });
    const again = new FieldData({ fs, secrets: new MemorySecretStore(), names: async () => [], makeId: () => "ffffffff" });
    expect(await again.installId()).toBe("0a1b2c3d");
  });
});

describe("redaction", () => {
  it("hides the token, every saved key, key shapes and the children's names", () => {
    const text = `token ${TOKEN} ai ${AI_KEY} other gsk_${"x".repeat(24)} Bearer abc נועם played, לנועם too, Maya won`;
    const clean = cleanText(text, [TOKEN, AI_KEY], ["נועם", "Maya"]);
    expect(clean).not.toContain(TOKEN);
    expect(clean).not.toContain(AI_KEY);
    expect(clean).not.toContain("gsk_");
    expect(clean).not.toMatch(/נועם|Maya/);
    expect(clean).toContain("<child> played, ל<child> too, <child> won");
    expect(clean).toContain("Bearer ***");
  });

  it("the share sheet gets the cleaned end of a long log, from a line's start", async () => {
    const { data, secrets } = await setup();
    await secrets.set(SECRET_KEYS.githubToken, TOKEN);
    const long = Array.from({ length: 20_000 }, (_, i) => `line ${i} נועם ${TOKEN}`).join("\n");
    const shared = await data.shareableLog(long);
    expect(new TextEncoder().encode(shared).length).toBeLessThanOrEqual(SHARE_LIMIT);
    expect(shared).toMatch(/^line \d+ <child> \*\*\*/);
    expect(shared).not.toContain(TOKEN);
    expect(lastBytes("short", 100)).toBe("short");
  });
});

describe("the token", () => {
  it("is kept only when it works (or the repo is only public), and only in the secret store", async () => {
    const ok = await setup();
    expect((await ok.data.connect(` ${TOKEN} `)).code).toBe("ok");
    expect(await ok.secrets.get(SECRET_KEYS.githubToken)).toBe(TOKEN);
    expect(await ok.data.masked()).toBe("***ghij");
    // nowhere on the disk
    const files = await Promise.all((await ok.fs.list("")).map(async (e) => (e.kind === "file" ? ((await ok.fs.readText(e.name)) ?? "") : "")));
    expect(files.join("\n")).not.toContain("TEST");

    const pub = await setup({ isPrivate: false });
    expect((await pub.data.connect(TOKEN)).code).toBe("public");
    expect(await pub.data.connected()).toBe(true);

    for (const status of [401, 403, 404]) {
      const bad = await setup({ status });
      expect((await bad.data.connect(TOKEN)).code).not.toBe("ok");
      expect(await bad.data.connected()).toBe(false);
    }
  });

  it("is forgotten on disconnect", async () => {
    const { data } = await setup();
    await data.connect(TOKEN);
    await data.disconnect();
    expect(await data.connected()).toBe(false);
    expect(await data.cachedStatus()).toEqual({ code: "not_connected", repo: data.repo });
  });
});

describe("uploads", () => {
  it("send exactly what was prepared and confirmed, cleaned, to the shown path", async () => {
    const { data, gh } = await setup();
    await data.connect(TOKEN);
    const p = await data.prepare("logs", `start\nנועם tapped\nkey ${AI_KEY}\ntoken ${TOKEN}\n`);
    expect(p.path).toBe("devices/0a1b2c3d/logs/20261020T080509Z.txt");
    expect(p.lines).toBe(4);
    expect(p.content).not.toMatch(/נועם|TEST|plain-ai/);
    expect(gh.puts).toEqual([]); // prepared is not sent
    expect((await data.send(p)).code).toBe("ok");
    expect(gh.puts).toEqual([
      {
        url: "https://api.github.com/repos/YuvalNag/nagmon-data/contents/devices/0a1b2c3d/logs/20261020T080509Z.txt",
        message: "Field data: logs",
        content: p.content,
      },
    ]);
  });

  it("send nothing to a public repo or without a token", async () => {
    const pub = await setup({ isPrivate: false });
    await pub.data.connect(TOKEN);
    expect((await pub.data.send(await pub.data.prepare("logs", "x"))).code).toBe("public");
    expect(pub.gh.puts).toEqual([]);
    const none = await setup();
    expect((await none.data.send(await none.data.prepare("logs", "x"))).code).toBe("not_connected");
    expect(none.gh.puts).toEqual([]);
  });

  it("send the last crash report once", async () => {
    const { data, fs, gh } = await setup();
    await data.connect(TOKEN);
    expect(await data.pendingCrash()).toBeNull();
    await fs.writeText("crash/last_crash.txt", `Nagmon crash report\nTypeError at Maya's card\n${TOKEN}\n`);
    const crash = (await data.pendingCrash())!;
    const p = await data.prepare("crashes", crash, { crash });
    expect(p.path).toMatch(/^devices\/0a1b2c3d\/crashes\/.*\.txt$/);
    expect((await data.send(p)).code).toBe("ok");
    expect(gh.puts[0]!.content).toContain("<child>'s card");
    expect(gh.puts[0]!.content).not.toContain(TOKEN);
    expect(await data.pendingCrash()).toBeNull();
    await fs.writeText("crash/last_crash.txt", "a new crash\n");
    expect(await data.pendingCrash()).toBe("a new crash\n");
  });
});

describe("the progress snapshot", () => {
  it("has the children as child-1, child-2, with no names or profile ids anywhere", async () => {
    const { profiles, data, gh } = await setup({ names: ["נועם", "Maya"] });
    const list = await profiles.list();
    await profiles.saveLearnerDict(list[0]!.id, {
      name: "נועם",
      skills: { "math.add": { n: 4, correct: 3, theta: 0.51234, last: NOW / 1000 } },
      mastered: { "math.add": 1 },
      stars: { math: 2 },
      answers_total: 4,
      correct_total: 3,
      log: [{ text: "free text Maya typed" }],
    });
    const snap = await progressSnapshot({
      profiles: list,
      learner: (id) => profiles.loadLearnerDict(id),
      settings: defaultSettings(),
      build: { version: "0.1.0", build: "test" },
      now: new Date(NOW),
    });
    const text = FieldData.progressText(snap);
    expect(text).not.toMatch(/נועם|Maya|free text/);
    for (const p of list) expect(text).not.toContain(p.id);
    expect(text).not.toMatch(/pin_|lat|lon/);
    const children = snap.children as { child: string; grade: number; subjects: Record<string, { attempts: number; mastered: number; stars: number; success: number; skills: Record<string, { rating: number; last: string }> }> }[];
    expect(children.map((c) => c.child)).toEqual(["child-1", "child-2"]);
    expect(children[0]!.grade).toBe(3);
    expect(children[0]!.subjects.math).toMatchObject({ attempts: 4, mastered: 1, stars: 2, success: 0.75 });
    expect(children[0]!.subjects.math!.skills["math.add"]).toEqual({ attempts: 4, success: 0.75, rating: 0.512, last: "2026-10-20" });
    expect(snap).toMatchObject({ schema_version: 1, created: "2026-10-20T08:05:09Z", settings: { city: "ירושלים" } });

    // sent as it is: the skill ids intact, though names are not hidden in it
    await data.connect(TOKEN);
    expect((await data.send(await data.prepare("progress", text))).code).toBe("ok");
    expect(gh.puts[0]!.content).toBe(text);
    expect(gh.puts[0]!.url).toMatch(/\/progress\/20261020T080509Z\.json$/);
  });
});

describe("the app's log after a whole flow", () => {
  it("has no token, in memory or in its file", async () => {
    const { fs, data, secrets } = await setup();
    // the log hides what the secret store holds, as main.tsx sets it up
    const ring = await installAppLog(fs, { secrets: () => secrets.values(), names: async () => ["נועם", "Maya"] });
    const withLog = new FieldData({
      fs,
      secrets,
      names: async () => ["נועם", "Maya"],
      fetch: github().fetch,
      makeId: () => "0a1b2c3d",
      log: (m) => getLogger("nagmon.field_data").info(m),
    });
    expect((await withLog.connect(TOKEN)).code).toBe("ok");
    await ring.refreshSecrets();
    expect((await withLog.status()).code).toBe("ok");
    // even a careless line elsewhere is hidden
    getLogger("nagmon.test").info(`a careless line with ${TOKEN}`);
    const p = await withLog.prepare("logs", appLogText());
    expect((await withLog.send(p)).code).toBe("ok");
    await saveAppLog();
    const text = appLogText();
    expect(text).toContain("GitHub token saved (ok)");
    expect(text).toContain("Upload of logs: ok");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("TESTabcdefghij");
    expect((await fs.readText(LOG_FILE))!).not.toContain("TESTabcdefghij");
    expect(data.toString()).not.toContain(TOKEN);
  });
});
