/**
 * A seeded PRNG that reproduces Python's `random.Random` (MT19937) for
 * integer seeds, method by method: `random`, `getrandbits`, `randbelow`,
 * `randrange`, `randint`, `choice`, `choices`, `shuffle`, `sample` and
 * `uniform` consume the generator exactly as CPython 3.13 does.
 *
 * Why exact: a generator ported line by line and fed the same seed then
 * builds the same question as the old Python app. The golden tests check
 * that for every ported generator, so the Leitner cards saved on the phone
 * (which hold a Python seed) regenerate the same item. A generator that is
 * not verified that way cannot replay old seeds; see README.md.
 */
export class PyRandom {
  private readonly mt = new Uint32Array(624);
  private mti = 625;

  /** Seed like `random.Random(seed)` with a non-negative or negative integer. */
  constructor(seed: number | bigint = 0) {
    this.seed(seed);
  }

  /** Re-seed like `Random.seed(int)`: init_by_array on the 32-bit words of |seed|. */
  seed(seed: number | bigint): void {
    let n = typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed));
    if (n < 0n) n = -n;
    const key: number[] = [];
    while (n > 0n) {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    }
    if (key.length === 0) key.push(0);
    this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = 624;
  }

  private initByArray(key: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    const len = key.length;
    for (let k = Math.max(624, len); k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1664525)) + key[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= 624) {
        mt[0] = mt[623]!;
        i = 1;
      }
      if (j >= len) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) {
        mt[0] = mt[623]!;
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  /** One 32-bit output (genrand_uint32). */
  uint32(): number {
    const mt = this.mt;
    if (this.mti >= 624) {
      let kk = 0;
      for (; kk < 624 - 397; kk++) {
        const y = (mt[kk]! & 0x80000000) | (mt[kk + 1]! & 0x7fffffff);
        mt[kk] = mt[kk + 397]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      for (; kk < 623; kk++) {
        const y = (mt[kk]! & 0x80000000) | (mt[kk + 1]! & 0x7fffffff);
        mt[kk] = mt[kk + (397 - 624)]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      const y = (mt[623]! & 0x80000000) | (mt[0]! & 0x7fffffff);
      mt[623] = mt[396]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.mti = 0;
    }
    let y = mt[this.mti++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** A float in [0, 1) with 53 random bits, like `random()`. */
  random(): number {
    const a = this.uint32() >>> 5;
    const b = this.uint32() >>> 6;
    return (a * 67108864 + b) * (1 / 9007199254740992);
  }

  /** `getrandbits(k)` for 0 <= k <= 53. */
  getrandbits(k: number): number {
    if (k <= 0) return 0;
    if (k <= 32) return this.uint32() >>> (32 - k);
    const low = this.uint32();
    const high = this.uint32() >>> (64 - k);
    return high * 4294967296 + low;
  }

  /** `_randbelow(n)`: uniform in [0, n) by rejection on bit_length(n) bits. */
  randbelow(n: number): number {
    const k = bitLength(n);
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  /** `randrange(start, stop, step)`; with one argument, [0, start). */
  randrange(start: number, stop?: number, step = 1): number {
    if (stop === undefined) {
      if (start > 0) return this.randbelow(start);
      throw new RangeError("empty range for randrange()");
    }
    const width = stop - start;
    if (step === 1) {
      if (width > 0) return start + this.randbelow(width);
      throw new RangeError(`empty range in randrange(${start}, ${stop})`);
    }
    let n: number;
    if (step > 0) n = Math.floor((width + step - 1) / step);
    else if (step < 0) n = Math.floor((width + step + 1) / step);
    else throw new RangeError("zero step for randrange()");
    if (n <= 0) throw new RangeError("empty range for randrange()");
    return start + step * this.randbelow(n);
  }

  /** `randint(a, b)`: a <= N <= b. */
  randint(a: number, b: number): number {
    return this.randrange(a, b + 1);
  }

  /** `choice(seq)`. */
  choice<T>(seq: readonly T[]): T {
    if (seq.length === 0) throw new RangeError("Cannot choose from an empty sequence");
    return seq[this.randbelow(seq.length)]!;
  }

  /** `shuffle(x)` in place. */
  shuffle<T>(x: T[]): void {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      const t = x[i]!;
      x[i] = x[j]!;
      x[j] = t;
    }
  }

  /** `sample(population, k)`: k distinct picks, both CPython algorithms. */
  sample<T>(population: readonly T[], k: number): T[] {
    const n = population.length;
    if (k < 0 || k > n) throw new RangeError("Sample larger than population or is negative");
    const result: T[] = new Array<T>(k);
    let setsize = 21;
    if (k > 5) setsize += 4 ** Math.ceil(Math.log(k * 3) / Math.log(4));
    if (n <= setsize) {
      const pool = population.slice();
      for (let i = 0; i < k; i++) {
        const j = this.randbelow(n - i);
        result[i] = pool[j]!;
        pool[j] = pool[n - i - 1]!;
      }
    } else {
      const selected = new Set<number>();
      for (let i = 0; i < k; i++) {
        let j = this.randbelow(n);
        while (selected.has(j)) j = this.randbelow(n);
        selected.add(j);
        result[i] = population[j]!;
      }
    }
    return result;
  }

  /** `choices(population, weights, k)` with `bisect_right` on the cumulative weights. */
  choices<T>(population: readonly T[], weights?: readonly number[], k = 1): T[] {
    const n = population.length;
    const out: T[] = [];
    if (weights === undefined) {
      for (let i = 0; i < k; i++) out.push(population[Math.floor(this.random() * n)]!);
      return out;
    }
    const cum: number[] = [];
    let acc = 0;
    for (const w of weights) {
      acc += w;
      cum.push(acc);
    }
    if (cum.length !== n) throw new RangeError("The number of weights does not match the population");
    const total = cum[n - 1]!;
    if (!(total > 0)) throw new RangeError("Total of weights must be greater than zero");
    const hi = n - 1;
    for (let i = 0; i < k; i++) {
      const x = this.random() * total;
      let lo = 0;
      let h = hi;
      while (lo < h) {
        const mid = (lo + h) >> 1;
        if (x < cum[mid]!) h = mid;
        else lo = mid + 1;
      }
      out.push(population[lo]!);
    }
    return out;
  }

  /** `uniform(a, b)`. */
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }
}

/** Python's `int.bit_length()` for a non-negative safe integer. */
export function bitLength(n: number): number {
  if (n <= 0) return 0;
  if (n < 4294967296) return 32 - Math.clz32(n);
  return 32 + bitLength(Math.floor(n / 4294967296));
}

/** A fresh random 32-bit seed (for a learner without an injected rng). */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]!;
  return Math.floor(Math.random() * 4294967296);
}
