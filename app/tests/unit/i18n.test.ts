import { describe, expect, it } from "vitest";
import { he, t } from "../../src/i18n";

describe("texts", () => {
  it("are Hebrew", () => {
    expect(t("whoPlays")).toBe("מי משחק היום?");
    for (const text of Object.values(he)) {
      expect(text.replace(/\{\w+\}/g, "")).toMatch(/[֐-׿]|^$/);
    }
  });
});

describe("the code-saved notice", () => {
  it("points to the GitHub page that the parents' area now has", () => {
    expect(t("pinSaved")).toBe("הקוד נשמר. באזור ההורים אפשר לחבר את GitHub כדי לשלוח יומן.");
  });
});

describe("the words of evolution (a table of their own, brought by the lazy screens)", () => {
  it("are Hebrew, and t() finds them once the table is loaded; a screen that is not loaded does not carry them", async () => {
    const { evoHe } = await import("../../src/i18nEvolution");
    for (const text of Object.values(evoHe)) expect(text.replace(/\{\w+\}/g, "")).toMatch(/[֐-׿]/);
    expect(t("evoWarm", { name: "דובי" })).toBe("דובי מרגיש משהו חם בפנים…");
    // they are not in the start script's own table
    expect(Object.keys(he).some((k) => k.startsWith("evo"))).toBe(false);
  });

  it("every file that uses one of them loads the table (or its words would show as the key)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    const users = walk("src").filter((f) => /\.tsx?$/.test(f) && !f.endsWith("i18nEvolution.ts") && !f.endsWith("i18n.ts")).filter((f) => /["'`]evo[A-Z]\w*["'`]/.test(readFileSync(f, "utf8")));
    expect(users.length).toBeGreaterThanOrEqual(7);
    for (const f of users) expect(readFileSync(f, "utf8"), f).toMatch(/import "(\.\.\/)+i18nEvolution";/);
  });
});
