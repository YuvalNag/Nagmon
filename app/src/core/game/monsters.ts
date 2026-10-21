/**
 * The monsters table (db/monsters.json), as much of it as the game uses.
 */
import type { MonsterInfo } from "./collection";

export interface MonsterSprites {
  sheet: string;
  scale: number;
  front: [number, number, number, number];
  back: [number, number, number, number];
}

export type MonsterTable = Record<string, MonsterInfo & { sprites: MonsterSprites | null }>;

/** From the parsed db/monsters.json; an entry with no readable fields is left out. */
export function monsterTable(doc: unknown): MonsterTable {
  const out: MonsterTable = {};
  if (typeof doc !== "object" || doc === null) return out;
  for (const [slug, raw] of Object.entries(doc as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Record<string, unknown>;
    const sp = m["sprites"] as Record<string, unknown> | undefined;
    const rect = (v: unknown): [number, number, number, number] | null =>
      Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number") ? (v as [number, number, number, number]) : null;
    const front = rect(sp?.["front"]);
    const back = rect(sp?.["back"]);
    const sheet = typeof sp?.["sheet"] === "string" ? sp["sheet"] : null;
    const sprites = front && sheet ? { sheet, scale: Number(sp?.["scale"] ?? 1) || 1, front, back: back ?? front } : null;
    const evolutions = Array.isArray(m["evolutions"])
      ? (m["evolutions"] as Record<string, unknown>[])
          .filter((e) => typeof e["monster_slug"] === "string" && Number.isFinite(Number(e["at_level"])))
          .map((e) => ({ at_level: Number(e["at_level"]), monster_slug: String(e["monster_slug"]) }))
      : [];
    out[slug] = {
      slug,
      types: Array.isArray(m["types"]) ? (m["types"] as unknown[]).map(String) : [],
      stage: typeof m["stage"] === "string" ? m["stage"] : "basic",
      evolutions,
      hasSprite: sprites !== null,
      sprites,
    };
  }
  return out;
}
