/**
 * What a child's game keeps between visits, apart from the learner: the
 * coins and the map scripts' variables (the old Tuxemon save's `money`
 * and `game_variables`). Saved as `profiles/<id>/saves/world.json`.
 *
 * Rules kept from the old game (docs/kids/SDD_WORLD.md):
 * - coins are never taken away: the wallet never goes below zero;
 * - a small world reward is capped per person per day by a counter,
 *   `nagmon_daily_<key>` = `<local date>:<count>`, that starts again on a
 *   new day (mods/nagmon/event/conditions/nagmon_daily.py). Testing the
 *   counter never writes anything.
 */

export const WORLD_SCHEMA_VERSION = 1;

export interface WorldData {
  schema_version: number;
  money: number;
  variables: Record<string, string>;
}

export class WorldState {
  money = 0;
  readonly variables = new Map<string, string>();

  /** A saved world.json; anything unreadable starts afresh (no coins are made up). */
  static fromDict(data: unknown): WorldState {
    const w = new WorldState();
    if (typeof data !== "object" || data === null || Array.isArray(data)) return w;
    const d = data as Record<string, unknown>;
    const money = d["money"];
    if (typeof money === "number" && Number.isFinite(money) && money > 0) w.money = Math.trunc(money);
    const vars = d["variables"];
    if (typeof vars === "object" && vars !== null && !Array.isArray(vars)) {
      for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number") w.variables.set(k, String(v));
      }
    }
    return w;
  }

  toDict(): WorldData {
    return {
      schema_version: WORLD_SCHEMA_VERSION,
      money: this.money,
      variables: Object.fromEntries([...this.variables].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    };
  }

  /** Adds (or takes) coins; the wallet never goes below zero. Returns the change made. */
  addMoney(amount: number): number {
    const before = this.money;
    this.money = Math.max(0, before + Math.trunc(amount));
    return this.money - before;
  }
}

/** The day as the old game wrote it: the phone's local date, `YYYY-MM-DD`. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const dailyVariable = (key: string) => `nagmon_daily_${key}`;

/** How many times the counter `key` was used on `today`. */
export function countToday(variables: ReadonlyMap<string, string>, key: string, today: string): number {
  const raw = variables.get(dailyVariable(key));
  if (!raw) return 0;
  const at = raw.lastIndexOf(":");
  if (at < 0 || raw.slice(0, at) !== today) return 0;
  const n = Number(raw.slice(at + 1));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Counts one more use of `key` today. */
export function countOneMore(variables: Map<string, string>, key: string, today: string): number {
  const n = countToday(variables, key, today) + 1;
  variables.set(dailyVariable(key), `${today}:${n}`);
  return n;
}
