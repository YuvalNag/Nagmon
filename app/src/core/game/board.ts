/**
 * The notice board (docs/app/WORLD_V2.md 7.3 and 8, slice W2: the screen
 * and the data contract only; the real quest generator is slice W3).
 *
 * THE CONTRACT with the quest slice:
 * - a {@link PostingSource} gives the postings of a day (3 daily ones,
 *   one of each slot, and a weekly card on Sunday). W2 ships a static
 *   one, {@link staticPostings}, from the board's own definition; W3
 *   replaces it with the generator and the screen does not change;
 * - accepting a posting writes `world.board.accepted[postingId] = day`
 *   (additive, optional, kept for good: an accepted card never expires);
 *   W3's quest engine reads that map and turns an accepted posting into a
 *   quest card in the journal. W2 shows no progress and gives no reward:
 *   a posting here is a card to take, not yet something to finish.
 */
import type { WorldState } from "../world/worldState";
import { dayOfWeek, pickDistinct, weekOf } from "./dayPick";

export type Slot = "easy" | "normal" | "learning" | "weekly";
export const DAILY_SLOTS: readonly Slot[] = ["easy", "normal", "learning"];

export interface Posting {
  /** Stable: what `board.accepted` is keyed by. */
  id: string;
  slot: Slot;
  /** Who posted it, as the child sees them. */
  giver: string;
  /** The giver's slug, when they are a person of the town. */
  giverSlug: string | null;
  /** The picture's code in the emoji set. */
  emoji: string;
  /** The one-line goal. */
  goal: string;
}

export interface BoardData {
  pool: Posting[];
}

/** What the screen asks for. The quest slice implements it with the generator. */
export interface PostingSource {
  postings(day: string): Posting[];
}

export interface BoardSave {
  /** Posting id to the day it was accepted. */
  accepted: Record<string, string>;
}

export const noBoard = (): BoardSave => ({ accepted: {} });
export const boardIsEmpty = (b: BoardSave): boolean => !Object.keys(b.accepted).length;

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseBoard(v: unknown): BoardSave {
  const out = noBoard();
  for (const [id, d] of Object.entries(rec(rec(v)["accepted"]))) if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) out.accepted[id] = d;
  return out;
}

/** From the board's definition (a `postings` list); a posting with no goal or an unknown slot is left out. */
export function boardData(def: Record<string, unknown>): BoardData {
  const pool = (Array.isArray(def["postings"]) ? def["postings"] : []).flatMap((raw): Posting[] => {
    const p = rec(raw);
    const slot = p["slot"];
    if (typeof p["id"] !== "string" || typeof p["goal_he"] !== "string" || !p["goal_he"] || (slot !== "easy" && slot !== "normal" && slot !== "learning" && slot !== "weekly")) return [];
    return [{ id: p["id"], slot, giver: String(p["giver_he"] ?? ""), giverSlug: typeof p["giver"] === "string" ? p["giver"] : null, emoji: typeof p["emoji"] === "string" ? p["emoji"] : "1f4cc", goal: p["goal_he"] }];
  });
  return { pool };
}

/**
 * The static source: one posting for each daily slot, picked by the day,
 * never two from the same giver on a day; the weekly card on Sundays.
 */
export function staticPostings(data: BoardData): PostingSource {
  return {
    postings(day: string): Posting[] {
      const out: Posting[] = [];
      for (const slot of DAILY_SLOTS) {
        const choices = data.pool.filter((p) => p.slot === slot);
        const free = choices.filter((p) => !out.some((o) => o.giver === p.giver));
        const pick = pickDistinct(free.length ? free : choices, 1, `board:${slot}:${day}`)[0];
        if (pick) out.push(pick);
      }
      if (dayOfWeek(day) === 0) {
        const weekly = pickDistinct(data.pool.filter((p) => p.slot === "weekly"), 1, `board:weekly:${weekOf(day)}`)[0];
        if (weekly) out.push(weekly);
      }
      return out;
    },
  };
}

export const isAccepted = (world: WorldState, id: string): boolean => world.board.accepted[id] !== undefined;

/** Takes a posting: free, kept for good. False when it was taken already. */
export function accept(world: WorldState, id: string, day: string): boolean {
  if (isAccepted(world, id)) return false;
  world.board.accepted[id] = day;
  return true;
}
