import { afterEach, describe, expect, it, vi } from "vitest";

const shell = vi.hoisted(() => ({ native: false, scale: 1, drawn: 0 }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => shell.native },
  registerPlugin: () => ({
    fontScale: async () => ({ value: shell.scale }),
    fullyDrawn: async () => void shell.drawn++,
  }),
}));
import { applySystemFontScale, pageFontScale, reportStarted } from "../../../src/platform/shell";

afterEach(() => {
  shell.native = false;
  shell.drawn = 0;
  delete (globalThis as { __startedAt?: number }).__startedAt;
});

describe("the system's font size", () => {
  it("is followed up to 130%, and never makes the text smaller", () => {
    expect(pageFontScale(1)).toBe(1);
    expect(pageFontScale(1.15)).toBe(1.15);
    expect(pageFontScale(1.3)).toBe(1.3);
    expect(pageFontScale(2)).toBe(1.3);
    expect(pageFontScale(0.85)).toBe(1);
    expect(pageFontScale(Number.NaN)).toBe(1);
  });

  it("on the phone sets --font-scale from Android", async () => {
    shell.native = true;
    shell.scale = 1.15;
    const root = document.createElement("div");
    expect(await applySystemFontScale(root)).toBe(1.15);
    expect(root.style.getPropertyValue("--font-scale")).toBe("1.15");
  });

  it("in the browser leaves the page's own", async () => {
    shell.scale = 1.3;
    const root = document.createElement("div");
    expect(await applySystemFontScale(root)).toBeNull();
    expect(root.style.getPropertyValue("--font-scale")).toBe("");
  });
});

describe("the start", () => {
  it("is reported to Android once", () => {
    shell.native = true;
    reportStarted();
    reportStarted();
    expect(shell.drawn).toBe(1);
    expect((globalThis as { __startedAt?: number }).__startedAt).toBeGreaterThan(0);
  });
});
