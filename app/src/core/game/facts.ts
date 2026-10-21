/**
 * The facts of signs and notice boards (`show_fact <id>`): a picture from
 * the emoji set and one short line. From `mods/nagmon/economy/facts.yaml`,
 * shipped as game/facts.json.
 */
export interface Fact {
  /** The picture's code in the emoji set (game/emoji/<code>.svg). */
  emoji: string;
  text: string;
}

export type Facts = Record<string, Fact>;

/** From the parsed game/facts.json; a fact with no picture or no line is left out. */
export function facts(doc: unknown): Facts {
  const raw = (typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>)["facts"] : null) as Record<string, unknown> | null;
  const out: Facts = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [id, f] of Object.entries(raw)) {
    const r = (typeof f === "object" && f !== null ? f : {}) as Record<string, unknown>;
    if (typeof r["emoji"] === "string" && r["emoji"] && typeof r["text_he"] === "string" && r["text_he"].trim()) out[id] = { emoji: r["emoji"], text: r["text_he"].trim() };
  }
  return out;
}
