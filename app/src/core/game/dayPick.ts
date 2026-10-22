/**
 * Picks that depend on the phone's local day and nothing else (the
 * postcard's sender, the books on the shelf, the news, the snacks in the
 * fridge): the same day gives the same picks, on every phone, with no
 * network and no clock but the date. `day` is `YYYY-MM-DD`
 * (core/world/worldState.ts `localDay`).
 */

const MS_DAY = 86_400_000;

function parts(day: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [1970, 1, 1];
}

/** Whole days since 1970-01-01 (the date alone, no time zone). */
export function dayNumber(day: string): number {
  const [y, m, d] = parts(day);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

/** 0 is Sunday. */
export function dayOfWeek(day: string): number {
  // 1970-01-01 was a Thursday
  return (((dayNumber(day) + 4) % 7) + 7) % 7;
}

/** A number that is the same for the seven days from Sunday to Saturday. */
export function weekOf(day: string): number {
  return Math.floor((dayNumber(day) + 4) / 7);
}

/** A small, stable hash of a string (FNV-1a, then murmur's finishing mix so the low bits are spread too), not for secrets. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** `n` different entries of `pool` (fewer when it is short), chosen by `seed`; the pool is not changed. */
export function pickDistinct<T>(pool: readonly T[], n: number, seed: string): T[] {
  const rest = [...pool];
  const out: T[] = [];
  let h = hashOf(seed);
  while (out.length < n && rest.length) {
    out.push(rest.splice(h % rest.length, 1)[0]!);
    h = hashOf(`${seed}:${out.length}:${h}`);
  }
  return out;
}
