/// <reference types="node" />
import { readFileSync } from "node:fs";
import { type ContentLibrary, LearningEngine, LearnerState, loadContent, PyRandom } from "../../../src/core/learning";
import type { Battle, Round } from "../../../src/core/game/battle";
import type { QuizSession } from "../../../src/core/world/quiz";

/** The learning content as the app ships it (public/game/content). */
export function shipped(): ContentLibrary {
  const dir = "public/game/content";
  const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { files: { file: string }[] };
  const docs: Record<string, unknown> = {};
  for (const f of index.files) docs[f.file] = JSON.parse(readFileSync(`${dir}/${f.file}`, "utf8"));
  return loadContent(docs);
}

export function gameJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(`public/game/${path}`, "utf8")) as T;
}

export function engineFor(content: ContentLibrary, grade: number, seed = 1, settings: Record<string, unknown> = {}): LearningEngine {
  const learner = new LearnerState({ grade, age: grade + 6, settings });
  return new LearningEngine(content, learner, { rng: new PyRandom(seed), clock: () => 1_760_000_000 });
}

/** Gives the right answer (typed on the pad, or the right card). */
export function answerRight(s: QuizSession): void {
  if (s.phase === "example") s.exampleDone();
  const q = s.question!;
  if (s.usesPad) {
    for (const ch of String(q.answer)) s.press(ch);
    s.check();
  } else s.choose(String(q.answer));
}

/** "I don't know": always wrong, never blocks. */
export function answerWrong(s: QuizSession): void {
  if (s.phase === "example") s.exampleDone();
  s.dontKnow();
}

/** Gives the right answer to any kind of question (pad, card, ordered tiles, spelled letters). */
export function answerRightAny(s: QuizSession): void {
  if (s.phase === "example") s.exampleDone();
  const q = s.question!;
  if (s.input === "order") s.arrange(q.answer as unknown as string[]);
  else if (s.input === "letters") s.spell(String(q.answer));
  else answerRight(s);
}

/**
 * One cast of the battle: the first card that is open (or the one named), answered right or wrong.
 * Returns the round that played.
 */
export function cast(battle: Battle, right = true, moveId?: string): Round {
  const card = moveId ? battle.cards().find((c) => c.move.id === moveId)! : battle.cards().find((c) => !c.dimmed)!;
  const c = battle.choose(card.move.id);
  if (!c) throw new Error(`card ${card.move.id} is not open`);
  if (c.round) return c.round;
  if (right) answerRightAny(c.session!);
  else answerWrong(c.session!);
  return battle.last!;
}

/** Casts right answers until the creature is calm (or won); false if it took more than `max` casts. */
export function calmIt(battle: Battle, max = 40): boolean {
  for (let i = 0; i < max && battle.phase === "fighting"; i++) {
    if (battle.needSwap) {
      const next = battle.team().find((c) => !c.fainted && c.id !== battle.partner.id);
      if (!next) return false;
      battle.swap(next.id);
    }
    cast(battle, true);
  }
  return battle.phase !== "fighting";
}

/** A fixed "random" number, or a repeating list of them. */
export const fixedRng = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

/** A seeded generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
