/**
 * Text review (docs/app/TEXT_REVIEW.md): the Hebrew lines a native speaker
 * checks, and what the parent decided, kept on the phone until it is sent.
 *
 *     game/review.json            the lines not yet approved (tools/app/review.py), read by the screen only
 *     review/decisions.json       what the parent decided, by line id (this file)
 *
 * A decision is about one line as it was (`baseHash`): when a later build
 * ships the same id with other text, the old decision does not hide it.
 * A decision stays here with `sent: false` until it is in the data repo
 * (FieldData.deliverReview).
 */
import { DATA_FILES, type FileStore, isJsonObject, type JsonObject, readJson, writeJson } from "../../platform/storage";

export const REVIEW_TYPES = ["quest", "npc", "mail", "fact", "ui"] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

/** One line to check, as game/review.json ships it. */
export interface ReviewItem {
  id: string;
  type: ReviewType;
  src: string;
  key: string;
  he: string;
  en?: string;
  /** Who says it, and when: for the parent. */
  ctx: string;
  /** Hash of `he` (what a decision is about). */
  hash: string;
}

export type ReviewAction = "approve" | "edit" | "skip";

/** What goes up (decisions.json): the same four fields the apply tool reads. */
export interface Decision {
  id: string;
  action: ReviewAction;
  /** Only for "edit". */
  newText?: string;
  baseHash: string;
}

/** A decision as kept on the phone. */
export interface StoredDecision extends Decision {
  /** Counts the changes of this line's decision: a send marks only the one it carried. */
  rev: number;
  sent: boolean;
}

export const DECISIONS_VERSION = 1;

/** The `{placeholders}` of a line, sorted: a correction must keep them. */
export function placeholders(text: string): string[] {
  return (text.match(/\{\w+\}/g) ?? []).sort();
}

/** The placeholders `original` has and `text` lacks (or has too many of). */
export function placeholderProblem(original: string, text: string): string | null {
  const want = placeholders(original);
  const have = placeholders(text);
  return want.join(" ") === have.join(" ") ? null : want.join(" ");
}

/** The items of a parsed review.json; anything that is not a line is left out. */
export function parseItems(data: unknown): ReviewItem[] {
  if (!isJsonObject(data) || !Array.isArray(data.items)) return [];
  const out: ReviewItem[] = [];
  for (const raw of data.items) {
    if (!isJsonObject(raw)) continue;
    const { id, type, src, key, he, en, ctx, hash } = raw;
    if (typeof id !== "string" || typeof he !== "string" || typeof hash !== "string" || !he) continue;
    if (!REVIEW_TYPES.includes(type as ReviewType)) continue;
    out.push({
      id,
      type: type as ReviewType,
      src: typeof src === "string" ? src : "",
      key: typeof key === "string" ? key : "",
      he,
      en: typeof en === "string" ? en : undefined,
      ctx: typeof ctx === "string" ? ctx : "",
      hash,
    });
  }
  return out;
}

export type Fetcher = (url: string) => Promise<Response>;

/** game/review.json; an empty list when the build has none. */
export async function loadReviewItems(fetcher: Fetcher = (u) => fetch(u)): Promise<ReviewItem[]> {
  const r = await fetcher("game/review.json");
  if (!r.ok) throw new Error(`game/review.json: ${r.status}`);
  return parseItems(await r.json());
}

/** The decision made about this exact line, or undefined. */
export function decisionFor(item: ReviewItem, all: Readonly<Record<string, StoredDecision>>): StoredDecision | undefined {
  const d = all[item.id];
  return d && d.baseHash === item.hash ? d : undefined;
}

/** The lines still to decide (in the order shipped), for a filter of one type or all. */
export function queue(items: readonly ReviewItem[], all: Readonly<Record<string, StoredDecision>>, filter: ReviewType | "all"): ReviewItem[] {
  return items.filter((i) => (filter === "all" || i.type === filter) && decisionFor(i, all) === undefined);
}

/** How many of the filter's lines have a decision, and how many lines it has. */
export function progress(items: readonly ReviewItem[], all: Readonly<Record<string, StoredDecision>>, filter: ReviewType | "all"): { done: number; total: number } {
  const of = items.filter((i) => filter === "all" || i.type === filter);
  return { done: of.filter((i) => decisionFor(i, all) !== undefined).length, total: of.length };
}

function parseStored(data: JsonObject | null): Record<string, StoredDecision> {
  const out: Record<string, StoredDecision> = {};
  const all = data?.decisions;
  if (!isJsonObject(all)) return out;
  for (const [id, raw] of Object.entries(all)) {
    if (!isJsonObject(raw)) continue;
    const { action, newText, baseHash, rev, sent } = raw;
    if (action !== "approve" && action !== "edit" && action !== "skip") continue;
    if (typeof baseHash !== "string") continue;
    if (action === "edit" && (typeof newText !== "string" || !newText)) continue;
    out[id] = {
      id,
      action,
      ...(action === "edit" ? { newText: newText as string } : {}),
      baseHash,
      rev: typeof rev === "number" ? rev : 1,
      sent: sent === true,
    };
  }
  return out;
}

/** The decisions kept on the phone. One write at a time, atomic like every saved file. */
export class ReviewStore {
  #fs: FileStore;
  #chain: Promise<unknown> = Promise.resolve();

  constructor(fs: FileStore) {
    this.#fs = fs;
  }

  async all(): Promise<Record<string, StoredDecision>> {
    // after the writes already asked for
    await this.#chain.catch(() => undefined);
    return parseStored((await readJson(this.#fs, DATA_FILES.review)).data);
  }

  #update<T>(change: (all: Record<string, StoredDecision>) => T): Promise<T> {
    const run = this.#chain
      .catch(() => undefined)
      .then(async () => {
        const all = parseStored((await readJson(this.#fs, DATA_FILES.review)).data);
        const result = change(all);
        await writeJson(this.#fs, DATA_FILES.review, { schema_version: DECISIONS_VERSION, decisions: all });
        return result;
      });
    this.#chain = run;
    return run;
  }

  /** Keeps a decision (replacing an earlier one about the same line); it waits to be sent. */
  decide(d: Decision): Promise<StoredDecision> {
    return this.#update((all) => {
      const stored: StoredDecision = {
        id: d.id,
        action: d.action,
        ...(d.action === "edit" && d.newText !== undefined ? { newText: d.newText } : {}),
        baseHash: d.baseHash,
        rev: (all[d.id]?.rev ?? 0) + 1,
        sent: false,
      };
      all[d.id] = stored;
      return stored;
    });
  }

  /** The lines the parent skipped come back to the queue (their decision is forgotten). */
  clearSkipped(): Promise<number> {
    return this.#update((all) => {
      let n = 0;
      for (const [id, d] of Object.entries(all)) {
        if (d.action === "skip") {
          delete all[id];
          n++;
        }
      }
      return n;
    });
  }

  /** The decisions not yet in the data repo, oldest id first. */
  async unsent(): Promise<StoredDecision[]> {
    return Object.values(await this.all())
      .filter((d) => !d.sent)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async waiting(): Promise<number> {
    return (await this.unsent()).length;
  }

  /** The decisions that went up: only those still as they were sent (a changed one stays queued). */
  markSent(sent: readonly StoredDecision[]): Promise<void> {
    return this.#update((all) => {
      for (const s of sent) {
        const now = all[s.id];
        if (now && now.rev === s.rev) now.sent = true;
      }
    });
  }
}

/** The file a send puts in the repo. */
export function decisionsFile(list: readonly StoredDecision[]): string {
  const decisions: Decision[] = list.map((d) => ({
    id: d.id,
    action: d.action,
    ...(d.action === "edit" && d.newText !== undefined ? { newText: d.newText } : {}),
    baseHash: d.baseHash,
  }));
  return JSON.stringify({ schema_version: DECISIONS_VERSION, decisions }, null, 1) + "\n";
}
