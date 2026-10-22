/**
 * The facts of signs, books, postcards and the journal (`show_fact <id>`,
 * docs/app/WORLD_V2.md 8.2): a picture from the emoji set, one short
 * line and the subject it belongs to. From
 * `mods/nagmon/economy/facts.yaml`, shipped as game/facts.json.
 */

/** The subjects a fact may belong to (mods/nagmon/learning/subjects.yaml). */
export const SUBJECTS = ["math", "geometry", "english", "science", "logic", "hebrew"] as const;
export type FactSubject = (typeof SUBJECTS)[number];

export interface Fact {
  /** The picture's code in the emoji set (game/emoji/<code>.svg). */
  emoji: string;
  text: string;
  /** The school subject; a fact with none (an old file) belongs to science. */
  subject: string;
}

export type Facts = Record<string, Fact>;

/** From the parsed game/facts.json; a fact with no picture or no line is left out. */
export function facts(doc: unknown): Facts {
  const raw = (typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>)["facts"] : null) as Record<string, unknown> | null;
  const out: Facts = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [id, f] of Object.entries(raw)) {
    const r = (typeof f === "object" && f !== null ? f : {}) as Record<string, unknown>;
    if (typeof r["emoji"] === "string" && r["emoji"] && typeof r["text_he"] === "string" && r["text_he"].trim()) {
      out[id] = { emoji: r["emoji"], text: r["text_he"].trim(), subject: typeof r["subject"] === "string" && r["subject"] ? r["subject"] : "science" };
    }
  }
  return out;
}

/** Every fact id, sorted: the order a day's pick is made in, whatever the order of the file. */
export const factIds = (all: Facts): string[] => Object.keys(all).sort();

/** The ids of one subject's facts, sorted. */
export const factsOf = (all: Facts, subject: string): string[] => factIds(all).filter((id) => all[id]!.subject === subject);
