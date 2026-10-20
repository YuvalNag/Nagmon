/**
 * Exact rational numbers, like Python's `fractions.Fraction`: always
 * reduced, the sign on the numerator. BigInt inside, so a float turned
 * into a fraction (denominator 2^55, say) stays exact.
 */
export type FracLike = Fraction | number | bigint;

function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function toBig(n: number): bigint {
  if (!Number.isInteger(n)) throw new RangeError(`not an integer: ${n}`);
  return BigInt(n);
}

export class Fraction {
  readonly n: bigint;
  readonly d: bigint;

  /** `new Fraction(3)`, `new Fraction(1, 2)`; a non-integer number is taken exactly. */
  constructor(num: FracLike, den: FracLike = 1n) {
    const a = Fraction.coerce(num);
    const b = Fraction.coerce(den);
    if (b.n === 0n) throw new RangeError("Fraction(_, 0)");
    let n = a.n * b.d;
    let d = a.d * b.n;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  private static raw(n: bigint, d: bigint): Fraction {
    const f = Object.create(Fraction.prototype) as { n: bigint; d: bigint };
    f.n = n;
    f.d = d;
    return f as Fraction;
  }

  /** A Fraction from a number (exact, as `Fraction(float)`), a bigint or a Fraction. */
  static coerce(x: FracLike): Fraction {
    if (x instanceof Fraction) return x;
    if (typeof x === "bigint") return Fraction.raw(x, 1n);
    if (Number.isInteger(x)) return Fraction.raw(toBig(x), 1n);
    if (!Number.isFinite(x)) throw new RangeError(`cannot convert ${x} to Fraction`);
    // Exact binary value: x = m * 2^e.
    let m = x;
    let e = 0;
    while (!Number.isInteger(m)) {
      m *= 2;
      e += 1;
    }
    return new Fraction(toBig(m), 1n << BigInt(e));
  }

  /** Parse "3", "-3.25", "1/2" (as Python's `Fraction(str)` for these forms). */
  static parse(text: string): Fraction {
    const s = text.trim();
    let m = /^([+-]?)(\d*)\.?(\d*)$/.exec(s);
    if (m && (m[2] || m[3])) {
      const digits = (m[2] ?? "") + (m[3] ?? "");
      const scale = 10n ** BigInt((m[3] ?? "").length);
      const f = new Fraction(BigInt(digits || "0"), scale);
      return m[1] === "-" ? f.neg() : f;
    }
    m = /^([+-]?)(\d+)\/(\d+)$/.exec(s);
    if (m) {
      const f = new Fraction(BigInt(m[2]!), BigInt(m[3]!));
      return m[1] === "-" ? f.neg() : f;
    }
    throw new RangeError(`Invalid literal for Fraction: ${JSON.stringify(text)}`);
  }

  add(o: FracLike): Fraction {
    const b = Fraction.coerce(o);
    return new Fraction(this.n * b.d + b.n * this.d, this.d * b.d);
  }

  sub(o: FracLike): Fraction {
    const b = Fraction.coerce(o);
    return new Fraction(this.n * b.d - b.n * this.d, this.d * b.d);
  }

  mul(o: FracLike): Fraction {
    const b = Fraction.coerce(o);
    return new Fraction(this.n * b.n, this.d * b.d);
  }

  div(o: FracLike): Fraction {
    const b = Fraction.coerce(o);
    return new Fraction(this.n * b.d, this.d * b.n);
  }

  neg(): Fraction {
    return Fraction.raw(-this.n, this.d);
  }

  abs(): Fraction {
    return this.n < 0n ? this.neg() : this;
  }

  /** -1, 0 or 1. */
  cmp(o: FracLike): number {
    const b = Fraction.coerce(o);
    const l = this.n * b.d;
    const r = b.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }

  eq(o: FracLike): boolean {
    return this.cmp(o) === 0;
  }

  lt(o: FracLike): boolean {
    return this.cmp(o) < 0;
  }

  le(o: FracLike): boolean {
    return this.cmp(o) <= 0;
  }

  gt(o: FracLike): boolean {
    return this.cmp(o) > 0;
  }

  ge(o: FracLike): boolean {
    return this.cmp(o) >= 0;
  }

  isInt(): boolean {
    return this.d === 1n;
  }

  isZero(): boolean {
    return this.n === 0n;
  }

  /** Floor division, as Python `//` (toward minus infinity). */
  floor(): bigint {
    const q = this.n / this.d;
    return this.n < 0n && q * this.d !== this.n ? q - 1n : q;
  }

  /** Python `round(Fraction)`: nearest integer, ties to even. */
  round(): bigint {
    const fl = this.floor();
    const rest = this.sub(fl);
    const c = rest.cmp(new Fraction(1, 2));
    if (c > 0 || (c === 0 && fl % 2n !== 0n)) return fl + 1n;
    return fl;
  }

  /** `float(f)` (nearest double). */
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  /** The integer value; throws when not an integer or not a safe number. */
  toInt(): number {
    if (this.d !== 1n) throw new RangeError(`not an integer: ${this.toString()}`);
    const v = Number(this.n);
    if (!Number.isSafeInteger(v)) throw new RangeError(`too large: ${this.n}`);
    return v;
  }

  /** A string key for maps and sets ("n/d"). */
  key(): string {
    return `${this.n}/${this.d}`;
  }

  /** Python `str(Fraction)`: "3" or "3/4". */
  toString(): string {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

/** Short constructor, as the generators' `F(a, b)`. */
export function F(num: FracLike, den: FracLike = 1n): Fraction {
  return new Fraction(num, den);
}
