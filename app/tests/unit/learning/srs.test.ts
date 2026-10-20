// @vitest-environment node
/** S1-S5: Leitner boxes with an injected clock (test_learning_srs.py). */
import { describe, expect, it } from "vitest";
import { DAY, INTERVALS_DAYS, LeitnerDeck } from "../../../src/core/learning/srs";
import { FakeClock } from "./helpers";

describe("srs", () => {
  it("intervals", () => {
    expect(INTERVALS_DAYS).toEqual([1, 3, 7, 14, 30]);
  });

  it("s1 new item", () => {
    const clock = new FakeClock();
    const deck = new LeitnerDeck(clock.call);
    const c = deck.review("i1", "math.x", 11, true);
    expect(c.box).toBe(2);
    expect(c.due).toBeCloseTo(clock.now + 3 * DAY, 6);
    const w = deck.review("i2", "math.x", 12, false);
    expect(w.box).toBe(1);
    expect(w.due).toBeCloseTo(clock.now + DAY, 6);
  });

  it("s2 progression", () => {
    const clock = new FakeClock();
    const deck = new LeitnerDeck(clock.call);
    const boxes: number[] = [];
    for (let i = 0; i < 6; i++) {
      boxes.push(deck.review("i1", "math.x", 1, true).box);
      clock.advance(40 * DAY);
    }
    expect(boxes).toEqual([2, 3, 4, 5, 5, 5]);
    const c = deck.get("i1")!;
    expect(c.due - c.last).toBeCloseTo(30 * DAY, 6);
  });

  it("s3 lapse", () => {
    const clock = new FakeClock();
    const deck = new LeitnerDeck(clock.call);
    for (let i = 0; i < 3; i++) deck.review("i1", "math.x", 1, true);
    expect(deck.get("i1")!.box).toBe(4);
    const c = deck.review("i1", "math.x", 1, false);
    expect(c.box).toBe(1);
    expect(c.lapses).toBe(1);
  });

  it("hint does not promote", () => {
    const clock = new FakeClock();
    const deck = new LeitnerDeck(clock.call);
    deck.review("i1", "math.x", 1, true);
    const c = deck.review("i1", "math.x", 1, true, { hinted: true });
    expect(c.box).toBe(2);
  });

  it("s4 due", () => {
    const clock = new FakeClock();
    const deck = new LeitnerDeck(clock.call);
    deck.review("a", "math.x", 1, false); // due +1d
    deck.review("b", "math.y", 2, true); // due +3d
    clock.advance(0.5 * DAY);
    deck.review("c", "math.x", 3, false); // due +1.5d from start
    expect(deck.due()).toEqual([]);
    clock.advance(2 * DAY);
    expect(deck.due().map((c) => c.item_id)).toEqual(["a", "c"]);
    clock.advance(DAY);
    expect(deck.due().map((c) => c.item_id)).toEqual(["a", "c", "b"]);
    const onlyY = deck.due(undefined, (s) => s === "math.y");
    expect(onlyY.map((c) => c.item_id)).toEqual(["b"]);
  });

  it("s5 roundtrip", () => {
    const clock = new FakeClock();
    const deck = new LeitnerDeck(clock.call);
    deck.review("a", "math.x", 5, true);
    deck.review("b", "math.y", 6, false);
    const again = LeitnerDeck.fromDict(deck.toDict(), clock.call);
    expect(again.toDict()).toEqual(deck.toDict());
    expect(again.size).toBe(2);
  });
});
