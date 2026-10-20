/**
 * Leitner spaced repetition with an injected clock (SDD_LEARNING s.5),
 * a port of `srs.py`. Times are seconds since the epoch, as in Python.
 */

export const DAY = 86400.0;
export const INTERVALS_DAYS: readonly number[] = [1, 3, 7, 14, 30];
export const MAX_BOX = INTERVALS_DAYS.length;

export type Clock = () => number;

/** Seconds now, as Python's `time.time()`. */
export const systemClock: Clock = () => Date.now() / 1000;

export function intervalS(box: number): number {
  const b = Math.min(Math.max(box, 1), MAX_BOX);
  return INTERVALS_DAYS[b - 1]! * DAY;
}

/**
 * One card. `seed` regenerates the question: a seed for `PyRandom`, which
 * replays Python's `random.Random`, so a card saved by the old app still
 * regenerates its item when the generator is a verified port.
 */
export interface Card {
  item_id: string;
  skill_id: string;
  seed: number | null;
  box: number;
  due: number;
  reviews: number;
  lapses: number;
  last: number;
}

export interface ReviewOptions {
  hinted?: boolean;
  now?: number;
}

export class LeitnerDeck {
  clock: Clock;
  cards = new Map<string, Card>();

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  get size(): number {
    return this.cards.size;
  }

  has(itemId: string): boolean {
    return this.cards.has(itemId);
  }

  get(itemId: string): Card | undefined {
    return this.cards.get(itemId);
  }

  /** Record one answer: new right -> box 2, new wrong -> box 1, right moves up, wrong back to 1. */
  review(itemId: string, skillId: string, seed: number | null, correct: boolean, opts: ReviewOptions = {}): Card {
    const now = opts.now ?? this.clock();
    const hinted = opts.hinted ?? false;
    let card = this.cards.get(itemId);
    if (card === undefined) {
      card = { item_id: itemId, skill_id: skillId, seed, box: 1, due: 0, reviews: 0, lapses: 0, last: 0 };
      this.cards.set(itemId, card);
      if (correct && !hinted) card.box = 2;
    } else if (!correct) {
      card.box = 1;
      card.lapses += 1;
    } else if (!hinted) {
      card.box = Math.min(card.box + 1, MAX_BOX);
    }
    card.skill_id = skillId || card.skill_id;
    if (seed !== null && seed !== undefined) card.seed = seed;
    card.reviews += 1;
    card.last = now;
    card.due = now + intervalS(card.box);
    return card;
  }

  /** Cards whose time has come, most overdue first. */
  due(now?: number, skillFilter?: (skillId: string) => boolean): Card[] {
    const t = now ?? this.clock();
    const out = [...this.cards.values()].filter((c) => c.due <= t && (!skillFilter || skillFilter(c.skill_id)));
    out.sort((a, b) => a.due - b.due || (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0));
    return out;
  }

  toDict(): { cards: Card[] } {
    return { cards: [...this.cards.values()].map((c) => ({ ...c })) };
  }

  static fromDict(data: { cards?: readonly Partial<Card>[] } | null | undefined, clock: Clock = systemClock): LeitnerDeck {
    const deck = new LeitnerDeck(clock);
    for (const raw of data?.cards ?? []) {
      const card: Card = {
        item_id: String(raw.item_id),
        skill_id: String(raw.skill_id ?? ""),
        seed: raw.seed ?? null,
        box: raw.box ?? 1,
        due: raw.due ?? 0,
        reviews: raw.reviews ?? 0,
        lapses: raw.lapses ?? 0,
        last: raw.last ?? 0,
      };
      deck.cards.set(card.item_id, card);
    }
    return deck;
  }
}
