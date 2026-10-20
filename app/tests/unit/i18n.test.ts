import { describe, expect, it } from "vitest";
import { he, t } from "../../src/i18n";

describe("texts", () => {
  it("are Hebrew", () => {
    expect(t("whoPlays")).toBe("מי משחק היום?");
    for (const text of Object.values(he)) {
      expect(text).toMatch(/[֐-׿]/);
    }
  });
});

describe("the code-saved notice", () => {
  it("promises nothing the parents' area does not have yet (the token comes in a later milestone)", () => {
    expect(t("pinSaved")).toBe("הקוד נשמר.");
    expect(t("pinSaved")).not.toContain("GitHub");
  });
});
