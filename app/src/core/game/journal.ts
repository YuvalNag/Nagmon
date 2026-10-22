/**
 * The learning journal and the bookshelf (docs/app/WORLD_V2.md 8, the PC's
 * Journal tab and the Bookshelf): "What I learned" is the facts the child
 * has read, by subject, with the day; the progress of each subject is
 * told in kind words (never a score, a percentage or a "weak" subject).
 * Reading three different books in a day gives a reading stamp (once a
 * day), ten stamps a bookmark charm and 20 coins. A Recap asks quick
 * recall questions from the last 7 days in practice mode: it never
 * touches the learner, the rating or the helpers.
 *
 * Saved (additive, optional): the facts read with their day, the stamps,
 * the bookmarks, and the books of today. Nothing the child typed.
 */
import type { WorldState } from "../world/worldState";
import { dayNumber, hashOf, pickDistinct } from "./dayPick";
import { type Facts, factsOf, SUBJECTS } from "./facts";

export const BOOKS_PER_DAY = 3;
export const STAMPS_PER_BOOKMARK = 10;
export const BOOKMARK_COINS = 20;
export const FACTS_PER_STAMP = 10;
export const RECAP_DAYS = 7;
export const RECAP_QUESTIONS = 3;

export interface JournalSave {
  /** Fact id to the day it was first read. */
  read: Record<string, string>;
  /** Reading stamps earned (three different books in a day). */
  stamps: number;
  /** Bookmark charms earned (every tenth stamp). */
  bookmarks: number;
  /** The last day a stamp was given. */
  stampDay: string | null;
  /** The books read today. */
  books: { day: string; ids: string[] } | null;
}

export const noJournal = (): JournalSave => ({ read: {}, stamps: 0, bookmarks: 0, stampDay: null, books: null });
export const journalIsEmpty = (j: JournalSave): boolean => !Object.keys(j.read).length && !j.stamps && !j.bookmarks && !j.stampDay && !j.books;

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const whole = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function parseJournal(v: unknown): JournalSave {
  const j = noJournal();
  const r = rec(v);
  for (const [id, d] of Object.entries(rec(r["read"]))) if (day(d)) j.read[id] = d as string;
  j.stamps = whole(r["stamps"]);
  j.bookmarks = whole(r["bookmarks"]);
  j.stampDay = day(r["stampDay"]);
  const b = rec(r["books"]);
  const bd = day(b["day"]);
  if (bd) j.books = { day: bd, ids: (Array.isArray(b["ids"]) ? b["ids"] : []).filter((x): x is string => typeof x === "string").slice(0, 12) };
  return j;
}

/** Marks a fact as read (the first time keeps its day). True when it was new. */
export function readFact(world: WorldState, id: string, today: string): boolean {
  if (world.journal.read[id] !== undefined) return false;
  world.journal.read[id] = today;
  return true;
}

export const factsRead = (world: WorldState): number => Object.keys(world.journal.read).length;

/** A stamp for every ten facts read (the PC's journal shows them). */
export const factStamps = (world: WorldState): number => Math.floor(factsRead(world) / FACTS_PER_STAMP);

export interface JournalLine {
  id: string;
  day: string;
}

/** The facts read, by subject, newest first; a fact the base no longer has is left out. */
export function bySubject(world: WorldState, all: Facts): Record<string, JournalLine[]> {
  const out: Record<string, JournalLine[]> = {};
  for (const s of SUBJECTS) out[s] = [];
  for (const [id, d] of Object.entries(world.journal.read)) {
    const f = all[id];
    if (!f) continue;
    (out[f.subject] ??= []).push({ id, day: d });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.day === b.day ? (a.id < b.id ? -1 : 1) : a.day < b.day ? 1 : -1));
  return out;
}

/** What a subject's page shows of the learning engine: counts only, never a score. */
export interface SubjectStats {
  /** Questions answered in the last 7 days. */
  answered7d: number;
  /** Skills mastered. */
  mastered: number;
  /** Facts read in this subject. */
  factsRead: number;
}

/** 0 to 3: how warm the words are. Only ever up: more practice, kinder words; nothing says "weak". */
export function progressTier(s: SubjectStats): 0 | 1 | 2 | 3 {
  if (s.mastered >= 3) return 3;
  if (s.mastered >= 1 || s.answered7d >= 10) return 2;
  if (s.answered7d >= 1 || s.factsRead >= 1) return 1;
  return 0;
}

/** The facts read in the last 7 days (today included), newest first. */
export function recentFacts(world: WorldState, today: string): string[] {
  const t = dayNumber(today);
  return Object.entries(world.journal.read)
    .filter(([, d]) => t - dayNumber(d) >= 0 && t - dayNumber(d) < RECAP_DAYS)
    .sort(([ai, a], [bi, b]) => (a === b ? (ai < bi ? -1 : 1) : a < b ? 1 : -1))
    .map(([id]) => id);
}

export interface Recall {
  /** The fact asked about: its picture is the question. */
  fact: string;
  /** Three fact ids, one of them the fact: the child picks the line that goes with the picture. */
  choices: string[];
}

/** A recall question: the picture of `factId`, and three lines to choose from (the true one and two other facts, with other pictures). */
export function recallFor(factId: string, all: Facts, seed: string): Recall | null {
  const f = all[factId];
  if (!f) return null;
  const others = Object.keys(all)
    .filter((id) => id !== factId && all[id]!.emoji !== f.emoji && all[id]!.text !== f.text)
    .sort();
  const same = others.filter((id) => all[id]!.subject === f.subject);
  const pool = same.length >= 2 ? same : others;
  const picks = pickDistinct(pool, 2, `${seed}:${factId}`);
  if (picks.length < 2) return null;
  const choices = pickDistinct([factId, ...picks], 3, `${seed}:order:${factId}`);
  return { fact: factId, choices };
}

/** The Recap: up to three questions from the facts of the last 7 days (none when nothing was read). Touches nothing. */
export function recap(world: WorldState, all: Facts, today: string): Recall[] {
  const ids = recentFacts(world, today).filter((id) => all[id]);
  return pickDistinct(ids, RECAP_QUESTIONS, `recap:${today}`).flatMap((id) => recallFor(id, all, `recap:${today}`) ?? []);
}

/**
 * The three books out on the home shelf today: one fact each from three
 * different subjects, chosen by the day. The library has all of them.
 */
export function booksToday(all: Facts, today: string): string[] {
  const subjects = pickDistinct(
    SUBJECTS.filter((s) => factsOf(all, s).length > 0),
    BOOKS_PER_DAY,
    `books:${today}`,
  );
  return subjects.map((s) => {
    const ids = factsOf(all, s);
    return ids[hashOf(`book:${today}:${s}`) % ids.length]!;
  });
}

export interface BookRead {
  /** The fact was new in the journal. */
  isNew: boolean;
  /** This reading made the third different book of the day: a stamp. */
  stamp: boolean;
  /** The stamp was the tenth: a bookmark charm and coins. */
  bookmark: boolean;
  coins: number;
}

/** Reads a book: the fact goes in the journal, and the day's books are counted for the stamp. */
export function readBook(world: WorldState, factId: string, today: string): BookRead {
  const j = world.journal;
  const isNew = readFact(world, factId, today);
  if (!j.books || j.books.day !== today) j.books = { day: today, ids: [] };
  if (!j.books.ids.includes(factId)) j.books.ids.push(factId);
  const out: BookRead = { isNew, stamp: false, bookmark: false, coins: 0 };
  if (j.books.ids.length >= BOOKS_PER_DAY && j.stampDay !== today) {
    j.stampDay = today;
    j.stamps += 1;
    out.stamp = true;
    if (j.stamps % STAMPS_PER_BOOKMARK === 0) {
      j.bookmarks += 1;
      out.bookmark = true;
      out.coins = world.addMoney(BOOKMARK_COINS);
    }
  }
  return out;
}

/** Books read today (for the shelf's little counter). */
export const booksReadToday = (world: WorldState, today: string): number => (world.journal.books?.day === today ? world.journal.books.ids.length : 0);
