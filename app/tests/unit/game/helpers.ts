/// <reference types="node" />
import { readFileSync } from "node:fs";
import { type ContentLibrary, LearningEngine, LearnerState, loadContent, PyRandom } from "../../../src/core/learning";
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
