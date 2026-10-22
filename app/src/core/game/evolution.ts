/**
 * Evolution (docs/app/BATTLE_V3.md 7): the child chooses when. Four gates
 * (level, Know-how in the creature's own subject, the subject's stars from
 * the learning engine, hearts), a lesson on some species and the home zone on
 * the second stage; or an Evolution Card, which skips the learning gates but
 * not the level (the gate level minus 3). Growth never evolves a creature by
 * itself: readiness is a question the screens ask after a fight, in the
 * Friends screen or when a card is chosen. Pure functions over the world's
 * save; every number is the rules file's (`mods/nagmon/battle/rules.yaml`).
 */
import type { BattleData, BattleRules } from "../data/battleTypes";
import type { Creature, WorldState } from "../world/worldState";
import { PARTY_SIZE } from "./collection";
import { countOf, type Economy, type Item, take } from "./items";
import type { MonsterTable } from "./monsters";

export type EvolveRules = BattleRules["evolution"];
export type GateId = "level" | "know_how" | "stars" | "hearts" | "lesson" | "place";

/** What the checks need to know about the child and the game. */
export interface EvolveCtx {
  monsters: MonsterTable;
  /** The battle's data; null in a build without it (the rules' gates are then used for every species). */
  battle: BattleData | null;
  rules: EvolveRules;
  /** The child's stars in a subject (`learner.stars`, one for each mastered skill). */
  stars: (subject: string) => number;
  /** The tutor lessons passed (ids). */
  lessons: readonly string[];
  /** The zone the child stands in now (its id), or null in the town. */
  zone: string | null;
  /** The home subject of a species. */
  subjectOf: (species: string) => string;
}

/** The next form of a species and what it takes. */
export interface Form {
  from: string;
  to: string;
  /** 0: basic to the first form; 1: first to the second. */
  stage: 0 | 1;
  level: number;
  knowHow: number;
  stars: number;
  hearts: number;
  lesson: string | null;
  place: string | null;
}

/** One line of the checklist: "Know-how 31 of 40". */
export interface GateRow {
  id: GateId;
  have: number;
  need: number;
  met: boolean;
  /** The subject to practise (the stars and Know-how rows). */
  subject?: string;
}

export interface Check {
  form: Form;
  rows: GateRow[];
  /** Every gate is met. */
  ready: boolean;
}

const stageOf = (species: string, ctx: EvolveCtx): 0 | 1 | 2 => {
  const s = ctx.battle?.species[species];
  if (s) return s.stage;
  const old = ctx.monsters[species]?.stage;
  return old === "stage2" ? 2 : old === "stage1" ? 1 : 0;
};

/** The next form of a species (one with a picture), or null when it has none. */
export function nextForm(species: string, ctx: EvolveCtx): Form | null {
  const at = stageOf(species, ctx);
  if (at > 1) return null;
  const stage: 0 | 1 = at === 1 ? 1 : 0;
  const r = ctx.rules;
  const gates = ctx.battle?.species[species]?.evolve;
  const to = gates?.to ?? (ctx.battle?.species[species] ? undefined : ctx.monsters[species]?.evolutions[0]?.monster_slug);
  if (!to || !ctx.monsters[to]?.hasSprite) return null;
  return {
    from: species,
    to,
    stage,
    level: gates?.level ?? r.level[stage],
    knowHow: gates?.know_how ?? r.know_how[stage],
    stars: gates?.stars ?? r.stars[stage],
    hearts: gates?.hearts ?? r.hearts[stage],
    lesson: gates?.lesson ?? null,
    place: gates?.place ?? null,
  };
}

/** Every species that has a next form (the tests and the checklist's coverage). */
export const forms = (ctx: EvolveCtx): Form[] => Object.keys(ctx.monsters).flatMap((s) => nextForm(s, ctx) ?? []);

/** The checklist of a creature for a form, in the order the child reads it. */
export function gateRows(c: Creature, f: Form, ctx: EvolveCtx): GateRow[] {
  const subject = ctx.subjectOf(c.species);
  const stars = ctx.stars(subject);
  const rows: GateRow[] = [
    { id: "level", have: c.level, need: f.level, met: c.level >= f.level },
    { id: "know_how", have: c.knowHow ?? 0, need: f.knowHow, met: (c.knowHow ?? 0) >= f.knowHow, subject },
    { id: "stars", have: stars, need: f.stars, met: stars >= f.stars, subject },
    { id: "hearts", have: c.hearts ?? 0, need: f.hearts, met: (c.hearts ?? 0) >= f.hearts },
  ];
  if (f.lesson) {
    const done = ctx.lessons.includes(f.lesson);
    rows.push({ id: "lesson", have: done ? 1 : 0, need: 1, met: done });
  }
  if (f.place) rows.push({ id: "place", have: ctx.zone === f.place ? 1 : 0, need: 1, met: ctx.zone === f.place });
  return rows;
}

/** The creature against the gates of its next form; null when it has no next form. */
export function checkGates(c: Creature, ctx: EvolveCtx): Check | null {
  const form = nextForm(c.species, ctx);
  if (!form) return null;
  const rows = gateRows(c, form, ctx);
  return { form, rows, ready: rows.every((r) => r.met) };
}

/** Friends of the party that are ready and have no "Keep small" ribbon: the ones to ask after a fight. */
export function readyToEvolve(world: WorldState, ctx: EvolveCtx): Creature[] {
  return world.creatures.slice(0, PARTY_SIZE).filter((c) => !c.keepSmall && checkGates(c, ctx)?.ready === true);
}

export function setKeepSmall(c: Creature, on: boolean): void {
  if (on) c.keepSmall = true;
  else delete c.keepSmall;
}

/** Know-how: right answers in the home subject while it was the partner. Never below zero. */
export function addKnowHow(c: Creature, n: number): void {
  c.knowHow = Math.max(0, (c.knowHow ?? 0) + Math.trunc(n));
}

export interface Evolved {
  id: string;
  before: string;
  after: string;
  how: "learning" | "card";
}

/**
 * The creature becomes its next form: only the species changes (level, growth
 * points, Know-how, hearts, name and moves stay). Evolving by learning gives
 * the Shimmer. The Book gets the new form. Null for an unknown friend.
 */
export function evolve(world: WorldState, creatureId: string, to: string, how: "learning" | "card"): Evolved | null {
  const c = world.creatures.find((x) => x.id === creatureId);
  if (!c) return null;
  const before = c.species;
  c.species = to;
  world.seen.add(to);
  world.caught.add(to);
  if (how === "learning") c.shimmer = true;
  return { id: c.id, before, after: to, how };
}

export interface CardCheck {
  ok: boolean;
  /** Why not: the level is too low, the stage does not fit, another zone or subject, or no next form. */
  why?: "level" | "stage" | "zone" | "subject" | "none";
}

/** Does this card work on this creature (7.2)? The learning gates do not count; the level does. */
export function cardCheck(item: Item, c: Creature, ctx: EvolveCtx): CardCheck {
  const form = nextForm(c.species, ctx);
  if (item.kind !== "evolution_card" || !form) return { ok: false, why: "none" };
  if (item.fromStage !== "any" && item.fromStage !== form.stage) return { ok: false, why: "stage" };
  if (item.card === "zone" && ctx.battle?.species[c.species]?.zone !== item.scopeId) return { ok: false, why: "zone" };
  if (item.card === "subject" && ctx.subjectOf(c.species) !== item.scopeId) return { ok: false, why: "subject" };
  const lowest = item.card === "rainbow" ? item.minLevel : form.level + ctx.rules.card_level_offset;
  if (c.level < lowest) return { ok: false, why: "level" };
  return { ok: true };
}

/** The friends of the world a card works on, in order (the ones that glow). */
export const qualifying = (world: WorldState, item: Item, ctx: EvolveCtx): Creature[] => world.creatures.filter((c) => cardCheck(item, c, ctx).ok);

/** Uses a card from the Bag on a friend: evolves it and uses the card up. Null (and nothing used) when it does not fit or there is none. */
export function evolveWithCard(world: WorldState, eco: Economy, ctx: EvolveCtx, itemId: string, creatureId: string): Evolved | null {
  const item = eco.items[itemId];
  const c = world.creatures.find((x) => x.id === creatureId);
  if (!item || !c || countOf(world, itemId) < 1 || !cardCheck(item, c, ctx).ok) return null;
  const form = nextForm(c.species, ctx)!;
  take(world, itemId);
  return evolve(world, creatureId, form.to, "card");
}

const cardFor = (eco: Economy, card: Item["card"], scopeId?: string | null): Item | undefined =>
  eco.order.map((id) => eco.items[id]!).find((i) => i.kind === "evolution_card" && i.card === card && (scopeId === undefined || i.scopeId === scopeId));

/**
 * A card found after a calmed wild creature (7.2): one roll, one card at most, and only one that would help the
 * partner: its zone card, then its subject card (stage 0), or a Bright Card (stage 1). Chances are the rules'.
 * Returns the item's id, or null.
 */
export function findCard(eco: Economy, rules: EvolveRules, monsters: MonsterTable, battle: BattleData | null, partner: Creature, rng: () => number): string | null {
  const sp = battle?.species[partner.species];
  const next = sp ? sp.evolve !== null : (monsters[partner.species]?.evolutions.length ?? 0) > 0;
  if (!sp || !next) return null;
  const chances = rules.find.wild_win;
  const list: [Item | undefined, number][] =
    sp.stage === 0
      ? [
          [cardFor(eco, "zone", sp.zone), chances.zone],
          [cardFor(eco, "subject", sp.subject), chances.subject],
        ]
      : [[cardFor(eco, "bright"), chances.bright]];
  const r = rng();
  let edge = 0;
  for (const [item, chance] of list) {
    edge += chance;
    if (item && r < edge) return item.id;
  }
  return null;
}

/**
 * The tutor's gift (7.2): every Nth lesson passed for the first time in a subject gives that subject's Evolution
 * Card. `done` already holds the lesson that was just passed. Null when it is not the Nth, or no card of that subject.
 */
export function tutorGift(eco: Economy, rules: EvolveRules, done: readonly string[], lessonId: string, subjectOfLesson: (id: string) => string): string | null {
  const subject = subjectOfLesson(lessonId);
  const n = done.filter((id) => subjectOfLesson(id) === subject).length;
  if (n === 0 || n % rules.find.tutor_every !== 0) return null;
  return cardFor(eco, "subject", subject)?.id ?? null;
}
