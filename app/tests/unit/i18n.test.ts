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
