/**
 * "Something is wrong" reports go up by themselves (docs/app/SDD.md §7.2):
 * after "send" in the sheet, when the parents' area allows it (default on
 * once a token is saved), a token and a network exist. Otherwise the
 * report waits on the phone (at most 20) and goes on the next start.
 */
import { afterEach, describe, expect, it } from "vitest";
import { type Fetch, forgetChecks } from "../../../src/core/fieldData/github";
import { FieldData, MAX_IMAGE_BASE64, MAX_IMAGE_BYTES } from "../../../src/core/fieldData/uploads";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { MAX_WAITING, Reports } from "../../../src/core/report/reports";
import { REPORT_LOG_LINES } from "../../../src/core/report/report";
import { MemorySecretStore, SECRET_KEYS } from "../../../src/platform/secrets";
import { MemoryFileStore } from "../../../src/platform/storage";

const TOKEN = "github_pat_TEST" + "abcdefghij".repeat(4);
const NOW = Date.UTC(2026, 9, 20, 8, 5, 9);
const IMAGE = btoa("\xff\xd8fake\xff\xd9");
const text = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

afterEach(() => forgetChecks());

async function setup({ token = true, offline = false, isPublic = false } = {}) {
  const fs = new MemoryFileStore();
  const secrets = new MemorySecretStore();
  if (token) await secrets.set(SECRET_KEYS.githubToken, TOKEN);
  const clock = { now: NOW };
  const net = { offline };
  const reports = new Reports({
    fs,
    field: new FieldLog({ info: () => {} }),
    build: () => ({ version: "0.1.0", build: "77" }),
    log: () => Array.from({ length: 80 }, (_, i) => `line ${i} for נועם`).join("\n") + "\n",
    names: async () => ["נועם"],
    clock: () => clock.now,
  });
  const puts: { path: string; content: string }[] = [];
  const fetch: Fetch = async (url, init) => {
    if (net.offline) throw new TypeError("offline");
    if (init.method === "PUT") {
      puts.push({ path: decodeURIComponent(url.split("/contents/")[1]!), content: JSON.parse(String(init.body)).content });
      return new Response("{}", { status: 201 });
    }
    return new Response(JSON.stringify({ private: !isPublic, permissions: { push: true } }));
  };
  const data = new FieldData({ fs, secrets, names: async () => ["נועם"], fetch, clock: () => clock.now, makeId: () => "0a1b2c3d", reports });
  const save = (extra: Partial<Parameters<Reports["save"]>[0]> = {}) => {
    clock.now += 1000;
    return reports.save({ child: "p00001", chip: "stuck", text: "", screen: "play", context: { map: { name: "town", x: 3, y: 4, facing: "up" } }, screenshot: IMAGE, ...extra });
  };
  return { fs, secrets, reports, data, puts, net, save, clock };
}

describe("automatic delivery", () => {
  it("sends the report to devices/<id>/reports/<stamp>/{report.json,screenshot.jpg} and clears the queue", async () => {
    const t = await setup();
    await t.save({ text: "נועם נתקע בשאלה" });
    expect(await t.data.deliverReports()).toBe("sent");
    expect(t.puts.map((p) => p.path)).toEqual([
      "devices/0a1b2c3d/reports/20261020T080510Z/screenshot.jpg",
      "devices/0a1b2c3d/reports/20261020T080510Z/report.json",
    ]);
    const json = JSON.parse(text(t.puts[1]!.content));
    expect(json).toMatchObject({ chip: "stuck", screen: "play", build: "77", version: "0.1.0", map: { name: "town", x: 3, y: 4 } });
    expect(await t.data.waitingReports()).toBe(0);
  });

  it("keeps no child name anywhere in the uploaded JSON, typed text and log included", async () => {
    const t = await setup();
    await t.save({ text: "נועם נתקע" });
    await t.data.deliverReports();
    expect(text(t.puts[1]!.content)).not.toContain("נועם");
  });

  it("uploads only the last 30 log lines", async () => {
    const t = await setup();
    await t.save();
    await t.data.deliverReports();
    expect(REPORT_LOG_LINES).toBe(30);
    expect(JSON.parse(text(t.puts[1]!.content)).log).toHaveLength(30);
  });

  it("offline: the report stays queued, and the next try (the next start) sends it", async () => {
    const t = await setup({ offline: true });
    await t.save();
    expect(await t.data.deliverReports()).toBe("queued");
    expect(await t.data.waitingReports()).toBe(1);
    t.net.offline = false;
    expect(await t.data.deliverReports()).toBe("sent");
    expect(await t.data.waitingReports()).toBe(0);
    expect(t.puts).toHaveLength(2);
  });

  it("no token: queued locally, nothing leaves", async () => {
    const t = await setup({ token: false });
    await t.save();
    expect(await t.data.deliverReports()).toBe("off");
    expect(await t.data.waitingReports()).toBe(1);
    expect(t.puts).toEqual([]);
  });

  it("is on by default once a token is saved, and the parents' switch turns it off and on", async () => {
    const t = await setup();
    expect(await t.data.reportsAuto()).toBe(true);
    await t.data.setReportsAuto(false);
    expect(await t.data.reportsAuto()).toBe(false);
    await t.save();
    expect(await t.data.deliverReports()).toBe("off");
    expect(t.puts).toEqual([]);
    await t.data.setReportsAuto(true);
    expect(await t.data.deliverReports()).toBe("sent");
  });

  it("is off without a token even if the switch is on", async () => {
    const t = await setup({ token: false });
    expect(await t.data.reportsAuto()).toBe(false);
  });

  it("never writes to a public repo", async () => {
    const t = await setup({ isPublic: true });
    await t.save();
    expect(await t.data.deliverReports()).toBe("queued");
    expect(t.puts).toEqual([]);
    expect(await t.data.waitingReports()).toBe(1);
  });

  it("keeps at most 20 waiting; the oldest goes", async () => {
    const t = await setup({ offline: true });
    expect(MAX_WAITING).toBe(20);
    for (let i = 0; i < 23; i++) await t.save();
    expect(await t.data.waitingReports()).toBe(20);
  });

  it("a screenshot over 300 KB is left out, one at the cap goes up", async () => {
    expect(MAX_IMAGE_BYTES).toBe(300_000);
    expect(MAX_IMAGE_BASE64).toBe(400_000);
    const big = await setup();
    await big.save({ screenshot: "A".repeat(400_000 + 4) });
    await big.data.deliverReports();
    expect(big.puts.map((p) => p.path.split("/").pop())).toEqual(["report.json"]);
    const ok = await setup();
    await ok.save({ screenshot: "A".repeat(400_000) });
    await ok.data.deliverReports();
    expect(ok.puts.map((p) => p.path.split("/").pop())).toEqual(["screenshot.jpg", "report.json"]);
  });

  it("with nothing waiting there is nothing to do", async () => {
    const t = await setup();
    expect(await t.data.deliverReports()).toBe("sent");
    expect(t.puts).toEqual([]);
  });
});
