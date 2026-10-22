/**
 * The notice board's data contract (docs/app/WORLD_V2.md 7.3 and 8). W2 built the screen and this contract;
 * W3 replaced the posting source with the quest generator (core/game/boardGen.ts) and the quest engine
 * (core/game/questFlow.ts) reads what was accepted:
 * - a {@link PostingSource} gives the postings of a day (3 daily ones, one of each slot, and a weekly card on
 *   Sunday); the generator is the source and the screen does not change;
 * - accepting a posting writes `world.board.accepted[postingId] = day` (additive, optional, kept for good: an
 *   accepted card never expires); the quest engine turns an accepted posting into a quest card in the journal.
 */
import type { WorldState } from "../world/worldState";
import type { Slot } from "./quests";

export type { Slot };

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
  /** The quest the card is for. */
  quest?: string;
}

/** What the screen asks for. The quest generator implements it. */
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

export const isAccepted = (world: WorldState, id: string): boolean => world.board.accepted[id] !== undefined;

/** Takes a posting: free, kept for good. False when it was taken already. */
export function accept(world: WorldState, id: string, day: string): boolean {
  if (isAccepted(world, id)) return false;
  world.board.accepted[id] = day;
  return true;
}
