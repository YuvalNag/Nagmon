/**
 * The parent's text-review decisions go up like the reports (docs/app/TEXT_REVIEW.md §4):
 * devices/<id>/review/<UTC>/decisions.json, only with consent, queued and retried.
 */
import { afterEach, describe, expect, it } from "vitest";
import { type Fetch, forgetChecks } from "../../../src/core/fieldData/github";
import { FieldData, reviewPath } from "../../../src/core/fieldData/uploads";
import { ReviewStore } from "../../../src/core/review/review";
import { MemorySecretStore, SECRET_KEYS } from "../../../src/platform/secrets";
import { MemoryFileStore } from "../../../src/platform/storage";

const TOKEN = "github_pat_TEST" + "abcdefghij".repeat(4);
const NOW = Date.UTC(2026, 9, 20, 8, 5, 9);
const text = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

afterEach(() => forgetChecks());

async function setup({ token = true, offline = false } = {}) {
  const fs = new MemoryFileStore();
  const secrets = new MemorySecretStore();
  if (token) await secrets.set(SECRET_KEYS.githubToken, TOKEN);
  const review = new ReviewStore(fs);
  const net = { offline };
  const puts: { path: string; content: string; message: string }[] = [];
  const fetch: Fetch = async (url, init) => {
    if (net.offline) throw new TypeError("offline");
    if (init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      puts.push({ path: decodeURIComponent(url.split("/contents/")[1]!), content: body.content, message: body.message });
      return new Response("{}", { status: 201 });
    }
    return new Response(JSON.stringify({ private: true, permissions: { push: true } }));
  };
  const data = new FieldData({ fs, secrets, names: async () => ["נועם"], fetch, clock: () => NOW, makeId: () => "0a1b2c3d", review });
  return { fs, secrets, review, data, puts, net };
}

describe("reviewPath", () => {
  it("is a folder of its own, like a report", () => {
    expect(reviewPath("0a1b2c3d", new Date(NOW))).toBe("devices/0a1b2c3d/review/20261020T080509Z/decisions.json");
    expect(() => reviewPath("nope", new Date(NOW))).toThrow(RangeError);
  });
});

describe("deliverReview", () => {
  it("sends the waiting decisions as one decisions.json and clears the queue", async () => {
    const t = await setup();
    await t.review.decide({ id: "npc:x:greet_first/0", action: "approve", baseHash: "aaaa" });
    await t.review.decide({ id: "npc:x:greet_first/1", action: "edit", newText: "שלום וברוכים הבאים", baseHash: "bbbb" });
    expect(await t.data.waitingReview()).toBe(2);
    expect(await t.data.deliverReview()).toBe("sent");
    expect(t.puts).toHaveLength(1);
    expect(t.puts[0]!.path).toBe("devices/0a1b2c3d/review/20261020T080509Z/decisions.json");
    expect(t.puts[0]!.message).toBe("Field data: review");
    expect(JSON.parse(text(t.puts[0]!.content))).toEqual({
      schema_version: 1,
      decisions: [
        { id: "npc:x:greet_first/0", action: "approve", baseHash: "aaaa" },
        { id: "npc:x:greet_first/1", action: "edit", newText: "שלום וברוכים הבאים", baseHash: "bbbb" },
      ],
    });
    expect(await t.data.waitingReview()).toBe(0);
    // nothing left: nothing more is sent
    expect(await t.data.deliverReview()).toBe("sent");
    expect(t.puts).toHaveLength(1);
  });

  it("has no child's data: only ids, hashes and the parent's lines", async () => {
    const t = await setup();
    await t.review.decide({ id: "a", action: "approve", baseHash: "h" });
    await t.data.deliverReview();
    const json = JSON.parse(text(t.puts[0]!.content));
    expect(Object.keys(json).sort()).toEqual(["decisions", "schema_version"]);
    expect(Object.keys(json.decisions[0]).sort()).toEqual(["action", "baseHash", "id"]);
  });

  it("removes a key that was typed into a line", async () => {
    const t = await setup();
    await t.review.decide({ id: "a", action: "edit", newText: `שורה ${TOKEN}`, baseHash: "h" });
    await t.data.deliverReview();
    expect(text(t.puts[0]!.content)).not.toContain(TOKEN);
  });

  it("is off without a token, and the decisions wait", async () => {
    const t = await setup({ token: false });
    await t.review.decide({ id: "a", action: "approve", baseHash: "h" });
    expect(await t.data.deliverReview()).toBe("off");
    expect(await t.data.waitingReview()).toBe(1);
    expect(t.puts).toEqual([]);
  });

  it("is off when the parents turned the switch off", async () => {
    const t = await setup();
    await t.data.setReportsAuto(false);
    await t.review.decide({ id: "a", action: "approve", baseHash: "h" });
    expect(await t.data.deliverReview()).toBe("off");
    expect(await t.data.waitingReview()).toBe(1);
  });

  it("queues with no network and sends on the next try", async () => {
    const t = await setup({ offline: true });
    await t.review.decide({ id: "a", action: "approve", baseHash: "h" });
    expect(await t.data.deliverReview()).toBe("queued");
    expect(await t.data.waitingReview()).toBe(1);
    t.net.offline = false;
    expect(await t.data.deliverReview()).toBe("sent");
    expect(await t.data.waitingReview()).toBe(0);
    expect(t.puts).toHaveLength(1);
  });

  it("two sends in one second go to two folders", async () => {
    const t = await setup();
    await t.review.decide({ id: "a", action: "approve", baseHash: "h" });
    await t.data.deliverReview();
    await t.review.decide({ id: "b", action: "approve", baseHash: "h" });
    await t.data.deliverReview();
    expect(t.puts.map((p) => p.path)).toEqual([
      "devices/0a1b2c3d/review/20261020T080509Z/decisions.json",
      "devices/0a1b2c3d/review/20261020T080510Z/decisions.json",
    ]);
  });
});
