/**
 * Small, deterministic randomness for the people of the world: the same
 * words in give the same number out, on every phone, so a test can pin a
 * day and the town looks the same when the child comes back to it
 * (docs/app/WORLD_V2.md 5.4 R2). Not for secrets.
 */

/** FNV-1a over the parts joined with "|": an unsigned 32-bit number. */
export function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A generator of numbers in [0, 1) from a seed (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The generator for these parts. */
export function rngFor(...parts: (string | number)[]): () => number {
  return mulberry32(hash(...parts));
}

/** `n` items 0..n-1 in an order fixed by the generator (Fisher-Yates). */
export function shuffled(n: number, rng: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The days since 1970-01-01 of a `YYYY-MM-DD` day (the phone's local date, taken as a date). */
export function dayNumber(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return 0;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** 0 (Sunday) to 6 (Saturday) of a `YYYY-MM-DD` day. */
export function weekdayOf(day: string): number {
  return (((dayNumber(day) + 4) % 7) + 7) % 7;
}

/** The `YYYY-MM-DD` day `n` days after `day`. */
export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * 86_400_000).toISOString().slice(0, 10);
}
