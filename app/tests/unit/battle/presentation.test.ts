import { describe, expect, it } from "vitest";
import { MAX_FLOATING, MAX_SHOWN, pickOptions } from "../../../src/ui/battle/effects";
import { presentationOf, usesSide } from "../../../src/ui/battle/presentation";

const cards = (n: number, image = false) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, image: image ? "x" : null }));

describe("how a question is drawn", () => {
  it("a number is the pad; order and letters have their own tiles", () => {
    expect(presentationOf({ input: "pad", kind: "number", choices: [] })).toBe("pad");
    expect(presentationOf({ input: "order", kind: "order", choices: cards(3) })).toBe("order");
    expect(presentationOf({ input: "letters", kind: "letters", choices: cards(5) })).toBe("letters");
  });

  it("true or false is two big thumbs", () => {
    expect(presentationOf({ input: "choice", kind: "true_false", choices: cards(2) })).toBe("thumbs");
  });

  it("a choice with pictures on every answer is picture tiles; a mix is plain cards", () => {
    expect(presentationOf({ input: "choice", kind: "choice", choices: cards(3, true) })).toBe("pictures");
    expect(presentationOf({ input: "choice", kind: "tap_figure", choices: cards(4, true) })).toBe("pictures");
    expect(presentationOf({ input: "choice", kind: "choice", choices: [...cards(2, true), ...cards(1)] })).toBe("cards");
    expect(presentationOf({ input: "choice", kind: "choice", choices: cards(3) })).toBe("cards");
  });

  it("five or six answers are a calm list, not floating", () => {
    expect(presentationOf({ input: "choice", kind: "choice", choices: cards(MAX_FLOATING) })).toBe("cards");
    expect(presentationOf({ input: "choice", kind: "choice", choices: cards(5) })).toBe("list");
    expect(presentationOf({ input: "choice", kind: "choice", choices: cards(6, true) })).toBe("list");
  });

  it("the ones that take the bottom end let the wild creature stand nearer the middle", () => {
    expect(["pad", "order", "letters", "list"].every((p) => usesSide(p as never))).toBe(true);
    expect(["cards", "pictures", "thumbs"].some((p) => usesSide(p as never))).toBe(false);
  });
});

describe("more answers than four", () => {
  it("up to six are shown, always with the right one", () => {
    const six = cards(9).map((c) => ({ ...c }));
    const shown = pickOptions(six, "c8", MAX_SHOWN);
    expect(shown).toHaveLength(MAX_SHOWN);
    expect(shown.some((c) => c.id === "c8")).toBe(true);
  });
});
