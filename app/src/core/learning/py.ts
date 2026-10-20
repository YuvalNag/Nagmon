/**
 * Small Python semantics the port needs to give the same numbers:
 * banker's rounding, `%` and `//` on negatives, `{:g}`, `str.strip(chars)`.
 */

/** Python `round(x)` for a float: nearest integer, ties to even. */
export function pyRoundInt(x: number): number {
  const fl = Math.floor(x);
  const diff = x - fl;
  if (diff > 0.5) return fl + 1;
  if (diff < 0.5) return fl;
  return fl % 2 === 0 ? fl : fl + 1;
}

/**
 * Python `round(x, ndigits)` for a float: rounds the exact binary value,
 * ties to even (JS `toFixed` sends ties up).
 */
export function pyRound(x: number, ndigits: number): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0 || Object.is(x, -0);
  const exact = Math.abs(x).toFixed(100); // the exact decimal value of the double
  const [whole, frac = ""] = exact.split(".");
  const keep = frac.slice(0, ndigits);
  const rest = frac.slice(ndigits);
  let digits = (whole ?? "0") + keep;
  const first = rest.charAt(0);
  const tail = rest.slice(1);
  let up = false;
  if (first > "5") up = true;
  else if (first === "5") {
    if (/[1-9]/.test(tail)) up = true;
    else up = Number(digits.charAt(digits.length - 1)) % 2 === 1;
  }
  if (up) digits = (BigInt(digits) + 1n).toString();
  const padded = digits.padStart(ndigits + 1, "0");
  const text = `${padded.slice(0, padded.length - ndigits)}${ndigits ? "." + padded.slice(padded.length - ndigits) : ""}`;
  const v = Number(text);
  return neg ? -v : v;
}

/** Python `a % b` for numbers (the result has the sign of b). */
export function pyMod(a: number, b: number): number {
  const r = a % b;
  return r !== 0 && r < 0 !== b < 0 ? r + b : r;
}

/** Python `a // b` for integers. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Python `divmod(a, b)` for integers. */
export function divmod(a: number, b: number): [number, number] {
  return [floorDiv(a, b), pyMod(a, b)];
}

/** Python `f"{x:g}"`. */
export function formatG(x: number, precision = 6): string {
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : x > 0 ? "inf" : "-inf";
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(precision)))));
  if (exp < -4 || exp >= precision) {
    const [m = "", e = "0"] = x.toExponential(precision - 1).split("e");
    const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const en = Number(e);
    return `${mant}e${en < 0 ? "-" : "+"}${String(Math.abs(en)).padStart(2, "0")}`;
  }
  const s = x.toFixed(Math.max(0, precision - 1 - exp));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

const WHITESPACE = " \t\n\r\v\f\x1c\x1d\x1e\x1f\x85\xa0                　";

/** Python `str.strip(chars)`; without chars, Unicode whitespace. */
export function strip(s: string, chars: string = WHITESPACE): string {
  const set = new Set(Array.from(chars));
  const cps = Array.from(s);
  let i = 0;
  let j = cps.length;
  while (i < j && set.has(cps[i]!)) i++;
  while (j > i && set.has(cps[j - 1]!)) j--;
  return cps.slice(i, j).join("");
}

/** Python `str.lstrip(chars)`. */
export function lstrip(s: string, chars: string = WHITESPACE): string {
  const set = new Set(Array.from(chars));
  const cps = Array.from(s);
  let i = 0;
  while (i < cps.length && set.has(cps[i]!)) i++;
  return cps.slice(i).join("");
}

/** Python `str.casefold()` for the scripts the game uses. */
export function casefold(s: string): string {
  return s.toLowerCase().replace(/ß/g, "ss").replace(/ς/g, "σ");
}

/** Python `len(str)`: code points, not UTF-16 units. */
export function pyLen(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/**
 * Python's `\s` (str patterns, the `str.isspace()` characters) as a
 * character-class body. JS `\s` differs: it also matches U+FEFF.
 */
export const PY_SPACE = Array.from(WHITESPACE)
  .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
  .join("");

/** Python's `\d` (str patterns): any Unicode decimal digit. */
export const PY_DIGIT = "\\p{Nd}";

const ND = /\p{Nd}/u;

/**
 * Unicode decimal digits to ASCII ("٣" -> "3"), as Python's `int()` reads
 * them. Unicode encodes each set of decimal digits as a run of ten, 0 to 9.
 */
export function asciiDigits(s: string): string {
  return Array.from(s)
    .map((c) => {
      if (c >= "0" && c <= "9") return c;
      if (!ND.test(c)) return c;
      let cp = c.codePointAt(0)!;
      let k = 0;
      while (ND.test(String.fromCodePoint(cp - 1))) {
        cp -= 1;
        k += 1;
      }
      return String(k % 10);
    })
    .join("");
}
