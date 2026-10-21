/**
 * The fourth upload: the reports waiting on the phone go to
 * devices/<install id>/reports/<UTC>.json (and .jpg) with the same
 * confirmation, the same checks and retries as the log.
 */
import { afterEach, describe, expect, it } from "vitest";
import { type Fetch, forgetChecks } from "../../../src/core/fieldData/github";
import { FieldData, MAX_IMAGE_BASE64, uploadPath } from "../../../src/core/fieldData/uploads";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { Reports } from "../../../src/core/report/reports";
import { MemorySecretStore, SECRET_KEYS } from "../../../src/platform/secrets";
import { MemoryFileStore } from "../../../src/platform/storage";

const TOKEN = "github_pat_TEST" + "abcdefghij".repeat(4);
const NOW = Date.UTC(2026, 9, 20, 8, 5, 9);

afterEach(() => forgetChecks());

interface Put {
  path: string;
  content: string;
}

async function setup({ failPuts = 0 } = {}) {
  const fs = new MemoryFileStore();
  const secrets = new MemorySecretStore();
  await secrets.set(SECRET_KEYS.githubToken, TOKEN);
  const clock = { now: NOW };
  const reports = new Reports({
    fs,
    field: new FieldLog({ info: () => {} }),
    build: () => ({ version: "0.1.0", build: "1" }),
    log: () => "a line\n",
    names: async () => ["נועם"],
    clock: () => clock.now,
  });
  const puts: Put[] = [];
  let toFail = failPuts;
  const fetch: Fetch = async (url, init) => {
    if (init.method === "PUT") {
      if (toFail > 0) {
        toFail--;
        return new Response("{}", { status: 403 });
      }
      const body = JSON.parse(String(init.body));
      puts.push({ path: decodeURIComponent(url.split("/contents/")[1]!), content: body.content });
      return new Response("{}", { status: 201 });
    }
    return new Response(JSON.stringify({ private: true, permissions: { push: true } }));
  };
  const data = new FieldData({ fs, secrets, names: async () => ["נועם"], fetch, clock: () => NOW, makeId: () => "0a1b2c3d", reports });
  return { fs, reports, data, puts, clock };
}

const text = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
// "JPEG" stand-in bytes, as base64
const IMAGE = btoa("\xff\xd8fake jpeg bytes\xff\xd9");

describe("the reports' upload", () => {
  it("has its own folder in the repo, like the other three", () => {
    expect(uploadPath("0a1b2c3d", "reports", new Date(NOW))).toBe("devices/0a1b2c3d/reports/20261020T080509Z.json");
  });

  it("with none waiting there is nothing to confirm", async () => {
    const { data } = await setup();
    expect(await data.prepareReports()).toBeNull();
    expect(await data.waitingReports()).toBe(0);
  });

  it("the confirmation says how many, and where: nothing is sent before it", async () => {
    const { data, reports, puts } = await setup();
    await reports.save({ child: "p00001", chip: "stuck", text: "", screen: "bag", context: {}, screenshot: IMAGE });
    await reports.save({ child: "p00001", chip: null, text: "", screen: "play", context: {}, screenshot: null });
    const p = (await data.prepareReports())!;
    expect(p).toMatchObject({ kind: "reports", repo: data.repo, path: "devices/0a1b2c3d/reports/", lines: 2 });
    expect(p.bytes).toBeGreaterThan(0);
    expect(await data.waitingReports()).toBe(2);
    expect(puts).toEqual([]);
  });

  it("sends the screenshot and then the JSON, and the phone lets go of them", async () => {
    const { data, reports, puts, fs } = await setup();
    await reports.save({ child: "p00001", chip: "unclear", text: "נועם לא הבין", screen: "quiz", context: {}, screenshot: IMAGE });
    const p = (await data.prepareReports())!;
    const result = await data.send(p);
    expect(result.code).toBe("ok");
    expect(puts.map((x) => x.path)).toEqual(["devices/0a1b2c3d/reports/20261020T080509Z.jpg", "devices/0a1b2c3d/reports/20261020T080509Z.json"]);
    expect(puts[0]!.content).toBe(IMAGE);
    const json = JSON.parse(text(puts[1]!.content));
    expect(json).toMatchObject({ chip: "unclear", screen: "quiz", screenshot: true });
    // the typed words arrive as typed, a name in them included
    expect(json.text).toBe("נועם לא הבין");
    expect(await data.waitingReports()).toBe(0);
    expect(await fs.list("profiles/p00001/reports")).toEqual([]);
  });

  it("hides a saved key typed into the text", async () => {
    const { data, reports, puts } = await setup();
    await reports.save({ child: "p00001", chip: null, text: `my key ${TOKEN}`, screen: "play", context: {}, screenshot: null });
    await data.send((await data.prepareReports())!);
    expect(text(puts[0]!.content)).not.toContain(TOKEN);
  });

  it("a refused write leaves everything on the phone", async () => {
    const { data, reports, puts } = await setup({ failPuts: 1 });
    await reports.save({ child: "p00001", chip: "stuck", text: "", screen: "bag", context: {}, screenshot: IMAGE });
    const first = await data.send((await data.prepareReports())!);
    expect(first.code).toBe("no_permission");
    expect(await data.waitingReports()).toBe(1);
    expect(puts).toEqual([]);
    // the next try works, from the start
    expect((await data.send((await data.prepareReports())!)).code).toBe("ok");
    expect(puts).toHaveLength(2);
    expect(await data.waitingReports()).toBe(0);
  });

  it("goes on from where it stopped: a screenshot already up is not sent again", async () => {
    const { data, reports, puts } = await setup({ failPuts: 0 });
    const saved = await reports.save({ child: "p00001", chip: "stuck", text: "", screen: "bag", context: {}, screenshot: IMAGE });
    await reports.markImageSent({ ...saved, imageSent: false });
    await data.send((await data.prepareReports())!);
    expect(puts.map((x) => x.path.split(".").pop())).toEqual(["json"]);
  });

  it("does not send a screenshot that is far too big; the report goes without it", async () => {
    const { data, reports, puts } = await setup();
    await reports.save({ child: "p00001", chip: "stuck", text: "", screen: "bag", context: {}, screenshot: "A".repeat(MAX_IMAGE_BASE64 + 4) });
    expect((await data.send((await data.prepareReports())!)).code).toBe("ok");
    expect(puts.map((x) => x.path.split(".").pop())).toEqual(["json"]);
    expect(await data.waitingReports()).toBe(0);
  });

  it("two reports in the same second from two children get two names", async () => {
    const { data, reports, puts } = await setup();
    await reports.save({ child: "p00001", chip: null, text: "", screen: "play", context: {}, screenshot: null });
    await reports.save({ child: "p00002", chip: null, text: "", screen: "play", context: {}, screenshot: null });
    await data.send((await data.prepareReports())!);
    expect(new Set(puts.map((x) => x.path)).size).toBe(2);
  });
});
