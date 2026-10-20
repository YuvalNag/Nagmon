/**
 * Math inside Hebrew text keeps its left-to-right order on screen (a port
 * of `isolate_math` from `nagmon/ui/game_helpers.py`). React renders the
 * isolates; a canvas that cannot strips them with `stripBidi`.
 */

import { PY_SPACE } from "./py";

const HEBREW = /[֐-׿]/;
const ISOLATED = /⁦[^⁩]*⁩/g;
/**
 * Two or more numbers joined by math operators (+ - × ÷ * / = < > :), with
 * Python's `\d` (any Unicode digit) and `\s`.
 */
const MATH = new RegExp(String.raw`\p{Nd}+(?:[.,]\p{Nd}+)?(?:[${PY_SPACE}]*[-+=×÷*/<>:][${PY_SPACE}]*\p{Nd}+(?:[.,]\p{Nd}+)?)+`, "gu");

function wrap(part: string): string {
  return part.replace(MATH, (m) => `⁦${m}⁩`);
}

/**
 * Wraps math expressions in Hebrew text in left-to-right isolates, so
 * "20 - 9 = 11" is not shown as "11 = 9 - 20". Parts that are already
 * isolated, and text without Hebrew, are left alone.
 */
export function isolateMath(text: string): string {
  if (!text || !HEBREW.test(text)) return text;
  const out: string[] = [];
  let pos = 0;
  for (const done of text.matchAll(ISOLATED)) {
    out.push(wrap(text.slice(pos, done.index)));
    out.push(done[0]);
    pos = done.index + done[0].length;
  }
  out.push(wrap(text.slice(pos)));
  return out.join("");
}
