/**
 * The fridge (docs/app/WORLD_V2.md 8): once a day the child picks one of
 * three snacks; the partner gets a heart and is happy. Free, once a day
 * by the phone's local date; a second try says "tomorrow". The three
 * change with the day (from a pool in the object's definition).
 */
import { countOneMore, countToday, type Creature, type WorldState } from "../world/worldState";
import { pickDistinct } from "./dayPick";

export const SNACKS_SHOWN = 3;
export const FRIDGE_KEY = "fridge";

export interface Snack {
  id: string;
  /** The picture's code in the emoji set. */
  emoji: string;
  name: string;
}

export interface FridgeData {
  snacks: Snack[];
}

export function fridgeData(def: Record<string, unknown>): FridgeData {
  const snacks = (Array.isArray(def["snacks"]) ? def["snacks"] : []).flatMap((raw): Snack[] => {
    const s = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    return typeof s["id"] === "string" && typeof s["emoji"] === "string" && typeof s["name_he"] === "string" ? [{ id: s["id"], emoji: s["emoji"], name: s["name_he"] }] : [];
  });
  return { snacks };
}

/** The three snacks of the day. */
export const choicesFor = (data: FridgeData, today: string): Snack[] => pickDistinct(data.snacks, SNACKS_SHOWN, `fridge:${today}`);

export const fridgeOpened = (world: WorldState, today: string): boolean => countToday(world.variables, FRIDGE_KEY, today) > 0;

export type Eaten = { ok: true; creature: Creature; hearts: number; gained: boolean } | { ok: false; reason: "tomorrow" | "nofriend" | "unknown" };

/**
 * Picks a snack: the partner gets one heart (up to five; a friend with all
 * five is just as happy). Nothing is used up when it cannot be taken: no
 * friend yet (the day is not spent), or already taken today.
 */
export function eat(world: WorldState, data: FridgeData, snackId: string, today: string): Eaten {
  if (fridgeOpened(world, today)) return { ok: false, reason: "tomorrow" };
  if (!choicesFor(data, today).some((s) => s.id === snackId)) return { ok: false, reason: "unknown" };
  const partner = world.creatures[0];
  if (!partner) return { ok: false, reason: "nofriend" };
  const before = partner.hearts ?? 0;
  partner.hearts = Math.min(5, before + 1);
  countOneMore(world.variables, FRIDGE_KEY, today);
  return { ok: true, creature: partner, hearts: partner.hearts, gained: partner.hearts > before };
}
