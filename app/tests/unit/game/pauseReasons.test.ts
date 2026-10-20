import { describe, expect, it } from "vitest";
import { PauseReasons } from "../../../src/game/pauseReasons";

describe("why the map is paused", () => {
  it("runs again only when every reason has let go", () => {
    const p = new PauseReasons();
    expect(p.pause("menu")).toBe(true);
    expect(p.pause("lifecycle")).toBe(false);
    // back from the background with the menu still open: still paused
    expect(p.resume("lifecycle")).toBe(false);
    expect(p.paused).toBe(true);
    expect(p.resume("menu")).toBe(true);
    expect(p.paused).toBe(false);
  });

  it("ignores a resume for a reason that was not holding it", () => {
    const p = new PauseReasons();
    expect(p.resume("lifecycle")).toBe(false);
    expect(p.paused).toBe(false);
  });

  it("does not stack the same reason", () => {
    const p = new PauseReasons();
    p.pause("lifecycle");
    expect(p.pause("lifecycle")).toBe(false);
    expect(p.resume("lifecycle")).toBe(true);
  });

  it("a talk holds the map but not the music; the menu or the background silence it", () => {
    const p = new PauseReasons();
    p.pause("talk");
    expect([p.paused, p.silent]).toEqual([true, false]);
    p.pause("lifecycle");
    expect(p.silent).toBe(true);
    p.resume("lifecycle");
    expect([p.paused, p.silent]).toEqual([true, false]);
    expect(p.resume("talk")).toBe(true);
  });
});
