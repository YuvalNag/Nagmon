/**
 * The text review's data on the phone (docs/app/TEXT_REVIEW.md §3.1): what a
 * decision is about, what stays queued, what a restart keeps.
 */
import { describe, expect, it } from "vitest";
import {
  decisionFor,
  decisionsFile,
  loadReviewItems,
  parseItems,
  placeholderProblem,
  placeholders,
  progress,
  queue,
  ReviewStore,
  type ReviewItem,
} from "../../../src/core/review/review";
import { DATA_FILES, MemoryFileStore } from "../../../src/platform/storage";

const item = (n: number, over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: `npc:x:greet_first/${n}`,
  type: "npc",
  src: "mods/nagmon/npcs/x.lines.he.yaml",
  key: `greet_first/${n}`,
  he: `שורה ${n}`,
  ctx: "אופיר האופה",
  hash: `h${n}`,
  ...over,
});

describe("placeholders", () => {
  it("lists them sorted, and says which a correction lost", () => {
    expect(placeholders("שלום {name}! ראינו את {who}")).toEqual(["{name}", "{who}"]);
    expect(placeholderProblem("שלום {name}", "היי {name}")).toBeNull();
    expect(placeholderProblem("שלום {name}", "היי")).toBe("{name}");
    expect(placeholderProblem("שלום", "היי {name}")).toBe("");
  });
});

describe("game/review.json", () => {
  it("keeps real lines and drops anything else", () => {
    const items = parseItems({
      items: [
        { id: "a", type: "npc", src: "s", key: "k", he: "שלום", ctx: "c", hash: "h" },
        { id: "b", type: "weird", he: "x", hash: "h" },
        { id: "c", type: "fact", he: "", hash: "h" },
        "nope",
        { id: "d", type: "quest", he: "היי", en: "Hi", hash: "h2" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["a", "d"]);
    expect(items[1]!.en).toBe("Hi");
    expect(parseItems(null)).toEqual([]);
  });

  it("loads through the fetcher and fails on a bad status", async () => {
    const ok = await loadReviewItems(async () => new Response(JSON.stringify({ items: [item(1)] })));
    expect(ok).toHaveLength(1);
    await expect(loadReviewItems(async () => new Response("", { status: 404 }))).rejects.toThrow("404");
  });
});

describe("the queue", () => {
  it("hides decided lines, by filter, and counts progress", async () => {
    const store = new ReviewStore(new MemoryFileStore());
    const items = [item(1), item(2), item(3, { type: "fact" })];
    await store.decide({ id: items[0]!.id, action: "approve", baseHash: "h1" });
    const all = await store.all();
    expect(queue(items, all, "all").map((i) => i.id)).toEqual([items[1]!.id, items[2]!.id]);
    expect(queue(items, all, "fact").map((i) => i.id)).toEqual([items[2]!.id]);
    expect(progress(items, all, "all")).toEqual({ done: 1, total: 3 });
    expect(progress(items, all, "npc")).toEqual({ done: 1, total: 2 });
  });

  it("a line that changed since the decision comes back", async () => {
    const store = new ReviewStore(new MemoryFileStore());
    await store.decide({ id: item(1).id, action: "skip", baseHash: "h1" });
    const all = await store.all();
    expect(decisionFor(item(1), all)).toBeDefined();
    expect(decisionFor(item(1, { hash: "new" }), all)).toBeUndefined();
    expect(queue([item(1, { hash: "new" })], all, "all")).toHaveLength(1);
  });
});

describe("the store", () => {
  it("survives a restart (a new store on the same files)", async () => {
    const fs = new MemoryFileStore();
    await new ReviewStore(fs).decide({ id: "a", action: "edit", newText: "נוסח חדש", baseHash: "h" });
    const again = await new ReviewStore(fs).all();
    expect(again.a).toMatchObject({ action: "edit", newText: "נוסח חדש", baseHash: "h", sent: false });
    expect(await fs.stat(DATA_FILES.review)).toBe("file");
  });

  it("keeps every decision when two are made at once", async () => {
    const store = new ReviewStore(new MemoryFileStore());
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.decide({ id: `i${n}`, action: "approve", baseHash: "h" })));
    expect(Object.keys(await store.all())).toHaveLength(5);
  });

  it("a decision changed after it was sent stays queued", async () => {
    const store = new ReviewStore(new MemoryFileStore());
    await store.decide({ id: "a", action: "approve", baseHash: "h" });
    await store.decide({ id: "b", action: "approve", baseHash: "h" });
    const sending = await store.unsent();
    expect(sending).toHaveLength(2);
    // the parent corrects "a" while the upload is on its way
    await store.decide({ id: "a", action: "edit", newText: "תיקון", baseHash: "h" });
    await store.markSent(sending);
    expect((await store.unsent()).map((d) => d.id)).toEqual(["a"]);
    expect(await store.waiting()).toBe(1);
  });

  it("forgets skipped lines on request, and only those", async () => {
    const store = new ReviewStore(new MemoryFileStore());
    await store.decide({ id: "a", action: "skip", baseHash: "h" });
    await store.decide({ id: "b", action: "approve", baseHash: "h" });
    expect(await store.clearSkipped()).toBe(1);
    expect(Object.keys(await store.all())).toEqual(["b"]);
  });

  it("ignores damaged entries in the file", async () => {
    const fs = new MemoryFileStore();
    await fs.writeText(
      DATA_FILES.review,
      JSON.stringify({ decisions: { a: { action: "edit", baseHash: "h" }, b: { action: "zap", baseHash: "h" }, c: { action: "approve", baseHash: "h" } } }),
    );
    expect(Object.keys(await new ReviewStore(fs).all())).toEqual(["c"]);
  });
});

describe("decisions.json", () => {
  it("has only id, action, newText (edits) and baseHash", async () => {
    const store = new ReviewStore(new MemoryFileStore());
    await store.decide({ id: "b", action: "edit", newText: "תיקון", baseHash: "h2" });
    await store.decide({ id: "a", action: "approve", baseHash: "h1" });
    await store.decide({ id: "c", action: "skip", baseHash: "h3" });
    const file = JSON.parse(decisionsFile(await store.unsent()));
    expect(file).toEqual({
      schema_version: 1,
      decisions: [
        { id: "a", action: "approve", baseHash: "h1" },
        { id: "b", action: "edit", newText: "תיקון", baseHash: "h2" },
        { id: "c", action: "skip", baseHash: "h3" },
      ],
    });
  });
});
