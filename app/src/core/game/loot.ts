/**
 * What the world gives (docs/app/FEATURES.md 4.4 and 5.3): the Rest
 * Center's daily gift and the chests, from `mods/nagmon/economy/loot.yaml`
 * shipped as game/loot.json. Nothing is random: a list is walked round
 * and round, so nobody gets nothing, and a prize that does not fit in a
 * full Bag turns into coins.
 */
import { countOneMore, countToday, type WorldState } from "../world/worldState";
import { type Economy, give } from "./items";

/** The hint token is the hint feather; an egg is the mystery egg. */
export const HINT_ITEM = "hint_feather";
export const EGG_ITEM = "mystery_egg";
/** Coins instead of a prize that cannot be given. */
export const FALLBACK_COINS = 10;

/** Coins, or an item (`item` set, `n` of them): one or the other. */
export interface Prize {
  coins: number;
  item: string | null;
  n: number;
}

export interface Chest {
  id: string;
  /** daily: opens again each day; once: one time ever. */
  repeat: "daily" | "once";
  prizes: Prize[];
  /** The small gift a child may take after a wrong answer. */
  consolation: Prize;
}

export interface Loot {
  dailyGift: Prize[];
  chests: Record<string, Chest>;
}

const whole = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.trunc(v) : 0);

function prize(raw: unknown): Prize | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (whole(r["coins"])) return { coins: whole(r["coins"]), item: null, n: 0 };
  if (typeof r["item"] === "string" && r["item"]) return { coins: 0, item: r["item"], n: whole(r["n"] ?? 1) || 1 };
  if (whole(r["hint"])) return { coins: 0, item: HINT_ITEM, n: whole(r["hint"]) };
  if (whole(r["egg"])) return { coins: 0, item: EGG_ITEM, n: 1 };
  return null;
}

const prizes = (v: unknown): Prize[] => (Array.isArray(v) ? v.flatMap((x) => prize(x) ?? []) : []);

/** From the parsed game/loot.json; what cannot be read is left out. */
export function loot(doc: unknown): Loot {
  const d = (typeof doc === "object" && doc !== null ? doc : {}) as Record<string, unknown>;
  const chests: Record<string, Chest> = {};
  const raw = d["chests"];
  if (typeof raw === "object" && raw !== null) {
    for (const [id, c] of Object.entries(raw as Record<string, unknown>)) {
      const o = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>;
      const list = prizes(o["prizes"]);
      const consolation = prize(o["consolation"]);
      if ((o["repeat"] !== "daily" && o["repeat"] !== "once") || !list.length || !consolation) continue;
      chests[id] = { id, repeat: o["repeat"], prizes: list, consolation };
    }
  }
  return { dailyGift: prizes(d["daily_gift"]), chests };
}

/** Puts a prize in the wallet or the Bag; returns what was really given (coins when the item cannot go in). */
export function grant(world: WorldState, eco: Economy, p: Prize): Prize {
  if (p.item) {
    const added = give(world, eco, p.item, p.n);
    if (added > 0) return { coins: 0, item: p.item, n: added };
    world.addMoney(FALLBACK_COINS);
    return { coins: FALLBACK_COINS, item: null, n: 0 };
  }
  world.addMoney(p.coins);
  return { ...p };
}

/** Days since 1970 of a `YYYY-MM-DD` date (0 for one that is not a date). */
export function dayNumber(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return 0;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** The prize at `n` of a list walked round and round (a list with none: a few coins). */
export function pickPrize(list: readonly Prize[], n: number): Prize {
  if (!list.length) return { coins: FALLBACK_COINS, item: null, n: 0 };
  return list[((Math.trunc(n) % list.length) + list.length) % list.length]!;
}

export interface Claimed {
  claimed: boolean;
  prize?: Prize;
}

const GIFT = "rest_gift";

/** Whether the Rest Center's gift for `today` was taken already. */
export const giftTaken = (world: WorldState, today: string): boolean => countToday(world.variables, GIFT, today) >= 1;

/** The Rest Center's daily gift: one a day for each child, by the phone's local date. */
export function claimDailyGift(world: WorldState, eco: Economy, table: Loot, today: string): Claimed {
  if (!table.dailyGift.length || giftTaken(world, today)) return { claimed: false };
  const got = grant(world, eco, pickPrize(table.dailyGift, dayNumber(today)));
  countOneMore(world.variables, GIFT, today);
  return { claimed: true, prize: got };
}
