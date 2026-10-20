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
