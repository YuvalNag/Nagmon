/**
 * The starter choice (the old owl's three creatures): whatever the
 * placement answers were, the child always chooses one of three. They
 * are of three different subjects, matched to the child and the chapter:
 * one of the chapter's subject (the first trip is science), one of the
 * subject the child is strongest in, and one of the subject they are
 * least far along in (a friend to practise it with).
 */
import type { SubjectMap } from "../learning/quiz_flow";
import type { MonsterTable } from "./monsters";

export interface StarterOption {
  species: string;
  subject: string;
  reason: "chapter" | "strong" | "friend" | "other";
}

export interface StarterInput {
  monsters: MonsterTable;
  subjects: SubjectMap;
  /** The start level of each subject (the placement). */
  levels: Readonly<Record<string, number>>;
  /** The subject of the chapter the child is about to start, if any. */
  chapterSubject: string | null;
  seed: number;
}

/** A starter's level follows its subject's level. */
export function starterLevel(subjectLevel: number): number {
  return Math.max(3, Math.min(12, 3 + subjectLevel));
}

/** A small seeded generator: the same seed, the same picks. */
function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pickStarters(input: StarterInput): StarterOption[] {
  const { monsters, subjects, levels, chapterSubject } = input;
  const rand = lcg(input.seed);
  // basic creatures that can grow, by their subject
  const bySubject = new Map<string, string[]>();
  for (const m of Object.values(monsters).sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    if (m.stage !== "basic" || !m.hasSprite || m.evolutions.length === 0) continue;
    const subject = subjects.subjectFor(m.types, null, m.slug);
    bySubject.set(subject, [...(bySubject.get(subject) ?? []), m.slug]);
  }
  const available = [...bySubject.keys()];
  const level = (s: string) => levels[s] ?? 0;
  const ranked = [...available].sort((a, b) => level(b) - level(a) || (a < b ? -1 : 1));
  const chosen: StarterOption["subject"][] = [];
  const reasons = new Map<string, StarterOption["reason"]>();
  const take = (subject: string | undefined, reason: StarterOption["reason"]) => {
    if (!subject || chosen.includes(subject) || !bySubject.has(subject)) return;
    chosen.push(subject);
    reasons.set(subject, reason);
  };
  take(chapterSubject ?? undefined, "chapter");
  take(ranked.find((s) => !chosen.includes(s)), "strong");
  take([...ranked].reverse().find((s) => !chosen.includes(s)), "friend");
  for (const s of ranked) {
    if (chosen.length >= 3) break;
    take(s, "other");
  }
  const out: StarterOption[] = [];
  for (const subject of chosen.slice(0, 3)) {
    const pool = bySubject.get(subject)!;
    out.push({ species: pool[Math.floor(rand() * pool.length)]!, subject, reason: reasons.get(subject)! });
  }
  // fewer than three subjects with a creature: more creatures of the ones there are
  const rest = [...bySubject.values()].flat().filter((sp) => !out.some((o) => o.species === sp));
  while (out.length < 3 && rest.length) {
    const sp = rest.splice(Math.floor(rand() * rest.length), 1)[0]!;
    out.push({ species: sp, subject: subjects.subjectFor(monsters[sp]!.types, null, sp), reason: "other" });
  }
  return out;
}
