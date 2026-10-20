import { describe, expect, it } from "vitest";
import { PauseReasons } from "../../../src/game/pauseReasons";

describe("why the map is paused", () => {
  it("runs again only when every reason has let go", () => {
    const p = new PauseReasons();
    expect(p.pause("menu")).toBe(true);
    expect(p.pause("background")).toBe(false);
    // back from the background with the menu still open: still paused
    expect(p.resume("background")).toBe(false);
    expect(p.paused).toBe(true);
    expect(p.resume("menu")).toBe(true);
    expect(p.paused).toBe(false);
  });

  it("ignores a resume for a reason that was not holding it", () => {
    const p = new PauseReasons();
    expect(p.resume("background")).toBe(false);
    expect(p.paused).toBe(false);
  });

  it("does not stack the same reason", () => {
    const p = new PauseReasons();
    p.pause("lifecycle");
    expect(p.pause("lifecycle")).toBe(false);
    expect(p.resume("lifecycle")).toBe(true);
  });
});
