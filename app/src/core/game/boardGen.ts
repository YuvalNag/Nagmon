/**
 * The notice board's generator (docs/app/WORLD_V2.md 7.3 and 7.4, slice W3): the day's postings, made from the
 * quests, with the anti-repetition rules. It replaces W2's static source behind the same contract
 * (core/game/board.ts `PostingSource`): the screen does not change.
 *
 * The day's cards are decided once and kept in the save (`quests.board`), so the board is the same all day
 * however often it is opened, and a test (or a phone that was off) cannot make it differ. They are chosen by
 * the day and a local seed alone: no clock, no network.
 *
 * The rules, each of them held on every day, whatever the pool (a slot with no card that satisfies them is left
 * empty rather than break one):
 * - one card per slot: easy, normal, learning; a weekly card on the rules' weekday; a second easy card once a
 *   quest that opens a 4th slot is done;
 * - no two cards of the same type in a day, and no two from the same giver;
 * - a giver is not in the last `giverGap` postings (with a small pool, at least not in the one before), and has
 *   at most `giverWeekMax` postings a week;
 * - a quest with variants is posted only with a variant that is not in its last `variantCooldown` postings;
 * - at least `weakPct` (40%) of the learning cards go to the child's two weakest subjects (computed on the phone, never sent).
 */
import { dayOfWeek, hashOf, weekOf } from "./dayPick";
import { boardSlotUnlocked, type Card, freshVariants, isEligible, type LogEntry, type QuestData, type QuestDef, type QuestSave, type Slot, useVariant } from "./quests";

export interface BoardCtx {
  today: string;
  grade: number;
  /** The child's weakest subjects, if known (never sent anywhere). */
  weak?: readonly string[];
  /** The child's own number (the world's `npc_seed`): another child's board has other days. */
  seed: number;
}

/** The posting id of a card: stable, and enough to rebuild the quest and its variant later. */
export const cardId = (quest: string, day: string, variant?: string): string => `${quest}@${day}${variant ? `:${variant}` : ""}`;

/** The quest and variant a posting id names, or null when it is not one of ours. */
export function parseCardId(id: string): { quest: string; day: string; variant?: string } | null {
  const m = /^([A-Za-z0-9_]+)@(\d{4}-\d{2}-\d{2})(?::([A-Za-z0-9_]+))?$/.exec(id);
  return m ? { quest: m[1]!, day: m[2]!, ...(m[3] ? { variant: m[3] } : {}) } : null;
}

const unit = (seed: string): number => hashOf(seed) / 0x100000000;

/** The slots of a day, in the order they are filled. */
export function slotsOf(data: QuestData, save: QuestSave, today: string): Slot[] {
  const out: Slot[] = ["easy", "normal", "learning"];
  if (boardSlotUnlocked(data, save)) out.splice(1, 0, "easy");
  if (dayOfWeek(today) === data.rules.board.weeklyDay) out.push("weekly");
  return out;
}

function candidatesFor(slot: Slot, data: QuestData, save: QuestSave, ctx: BoardCtx, today: Card[], nth: number, gap: number): { def: QuestDef; variant: string | undefined }[] {
  const r = data.rules;
  const lastGivers = save.log.slice(-gap).map((e) => e.giver);
  const thisWeek = save.log.filter((e) => weekOf(e.day) === weekOf(ctx.today));
  const todayDefs = today.map((c) => data.quests[c.quest]!).filter(Boolean);
  const cands: { def: QuestDef; variant: string | undefined }[] = [];
  for (const def of Object.values(data.quests)) {
    if (def.board?.slot !== slot) continue;
    if (!isEligible(def, save, ctx)) continue;
    if (todayDefs.some((d) => d.id === def.id || d.type === def.type || d.giver === def.giver)) continue;
    if (lastGivers.includes(def.giver)) continue;
    if (thisWeek.filter((e) => e.giver === def.giver).length >= r.board.giverWeekMax) continue;
    let variant: string | undefined;
    if (def.variants.length) {
      const fresh = freshVariants(def, save, ctx.grade, r);
      if (!fresh.length) continue;
      variant = fresh[hashOf(`${ctx.seed}|variant|${ctx.today}|${def.id}|${nth}`) % fresh.length]!.id;
    }
    cands.push({ def, variant });
  }
  return cands;
}

function pickCard(slot: Slot, data: QuestData, save: QuestSave, ctx: BoardCtx, today: Card[], nth: number): Card | null {
  const r = data.rules;
  // The gap of `giverGap` postings is held when the pool allows; with a small pool it shrinks to the one rule
  // that is never broken, no giver twice in a row (the same giver in two consecutive postings).
  let cands = candidatesFor(slot, data, save, ctx, today, nth, r.board.giverGap);
  if (!cands.length && r.board.giverGap > 1) cands = candidatesFor(slot, data, save, ctx, today, nth, 1);
  if (!cands.length) return null;
  let pool = cands;
  if (slot === "learning" && ctx.weak?.length) {
    const weak = cands.filter((c) => c.def.subject && ctx.weak!.includes(c.def.subject));
    const rest = cands.filter((c) => !weak.includes(c));
    // at least weakPct of the learning cards go to the weak subjects (their own share, when that is more)
    if (weak.length && rest.length) pool = unit(`${ctx.seed}|weak|${ctx.today}|${nth}`) * 100 < Math.max(r.board.weakPct, (100 * weak.length) / cands.length) ? weak : rest;
  }
  // a stable order, so the pick depends on the seed and the day and not on the order of the quests' files
  pool = [...pool].sort((a, b) => (a.def.id < b.def.id ? -1 : 1));
  const pick = pool[hashOf(`${ctx.seed}|card|${ctx.today}|${slot}|${nth}`) % pool.length]!;
  return { id: cardId(pick.def.id, ctx.today, pick.variant), quest: pick.def.id, slot, ...(pick.variant ? { variant: pick.variant } : {}) };
}

/**
 * The day's cards. Made the first time they are asked for on a day, and saved: the same day gives the same
 * cards however many times this is called. The history (`save.log`) is extended with what was posted.
 */
export function boardFor(data: QuestData, save: QuestSave, ctx: BoardCtx): Card[] {
  if (save.board?.day === ctx.today) return save.board.cards;
  const cards: Card[] = [];
  slotsOf(data, save, ctx.today).forEach((slot, nth) => {
    const card = pickCard(slot, data, save, ctx, cards, nth);
    if (card) cards.push(card);
  });
  const added: LogEntry[] = cards.map((c) => {
    const def = data.quests[c.quest]!;
    return { day: ctx.today, quest: c.quest, type: def.type, giver: def.giver, ...(c.variant ? { variant: c.variant } : {}) };
  });
  save.log = [...save.log, ...added].slice(-data.rules.board.history);
  for (const c of cards) if (c.variant) useVariant(save, c.quest, c.variant);
  save.board = { day: ctx.today, cards };
  return cards;
}
