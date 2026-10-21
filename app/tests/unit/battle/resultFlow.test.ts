import { describe, expect, it } from "vitest";
import { answered, asking, openWhy, remainingMs, RIGHT_MS, SKIP_GUARD_MS, tapped, ticked, WRONG_MS } from "../../../src/ui/battle/resultFlow";

describe("the result state machine", () => {
  it("starts asking, and an answer begins the result at once", () => {
    expect(asking()).toEqual({ k: "asking" });
    const f = answered(true, 1000);
    expect(f).toMatchObject({ k: "result", correct: true, at: 1000, holdMs: RIGHT_MS, why: false });
  });

  it("the line stays about 1.5 s for a right answer, a little longer for a wrong one, then closes by itself", () => {
    expect(RIGHT_MS).toBe(1500);
    expect(WRONG_MS).toBeGreaterThan(RIGHT_MS);
    expect(WRONG_MS).toBeLessThanOrEqual(2500);
    const r = answered(true, 0);
    expect(ticked(r, RIGHT_MS - 1)).toBe(r);
    expect(ticked(r, RIGHT_MS)).toEqual({ k: "done" });
    const w = answered(false, 0);
    expect(ticked(w, RIGHT_MS)).toBe(w);
    expect(ticked(w, WRONG_MS)).toEqual({ k: "done" });
  });

  it("a tap anywhere skips the wait, but not in the first moments (the answer's own double tap)", () => {
    const r = answered(true, 5000);
    expect(tapped(r, 5000 + SKIP_GUARD_MS - 1)).toBe(r);
    expect(tapped(r, 5000 + SKIP_GUARD_MS)).toEqual({ k: "done" });
  });

  it("'why?' holds the line open: no closing by time, and a tap closes it", () => {
    const r = openWhy(answered(false, 0));
    expect(r).toMatchObject({ k: "result", why: true });
    expect(ticked(r, 60_000)).toBe(r);
    expect(remainingMs(r, 100)).toBeNull();
    expect(tapped(r, 1000)).toEqual({ k: "done" });
  });

  it("counts down the time left, and says nothing when there is no result", () => {
    const r = answered(true, 100);
    expect(remainingMs(r, 100)).toBe(RIGHT_MS);
    expect(remainingMs(r, 100 + 400)).toBe(RIGHT_MS - 400);
    expect(remainingMs(r, 100 + 9999)).toBe(0);
    expect(remainingMs(asking(), 0)).toBeNull();
  });

  it("other states ignore taps, time and 'why?'", () => {
    const a = asking();
    expect(tapped(a, 9999)).toBe(a);
    expect(ticked(a, 9999)).toBe(a);
    expect(openWhy(a)).toBe(a);
    const d = { k: "done" } as const;
    expect(tapped(d, 1)).toBe(d);
    expect(openWhy(d)).toBe(d);
  });
});
