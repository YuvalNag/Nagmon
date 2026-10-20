import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillText, PAGE_MAX, pages } from "../../../src/core/world/dialog";

const he = JSON.parse(readFileSync("public/game/i18n/he.json", "utf8")) as Record<string, string>;

describe("a dialog's pages", () => {
  it("opens a page at every line break", () => {
    expect(pages(he["nagmon_world_cashier_hello"]!)).toEqual([
      "המוכר אבי: שלום! אני סופר את הכסף בקופה.",
      "אפשר לעזור לי עם חשבון קטן?",
    ]);
  });

  it("splits a line over 120 characters between words, losing nothing", () => {
    const words = Array.from({ length: 60 }, (_, i) => `מילה${i}`);
    const out = pages(words.join(" "));
    expect(out.length).toBeGreaterThan(1);
    for (const p of out) expect([...p].length).toBeLessThanOrEqual(PAGE_MAX);
    expect(out.join(" ")).toBe(words.join(" "));
  });

  it("cuts a word longer than a page, and skips empty lines", () => {
    expect(pages(`${"א".repeat(130)}\n\n  \nב`)).toEqual(["א".repeat(120), "א".repeat(10), "ב"]);
  });

  it("every world text in the catalogue comes out in pages of at most 120 characters", () => {
    for (const [k, v] of Object.entries(he)) {
      if (!k.startsWith("nagmon_world_") && !k.startsWith("nagmon_owl_")) continue;
      for (const p of pages(v)) expect([...p].length, k).toBeLessThanOrEqual(PAGE_MAX);
    }
  });

  it("puts in the child's name", () => {
    expect(fillText(he["nagmon_world_granny_hello"]!, { name: "תמר" })).toContain("שלום, תמר!");
    expect(fillText("{name}!", { name: "גל" })).toBe("גל!");
  });
});
