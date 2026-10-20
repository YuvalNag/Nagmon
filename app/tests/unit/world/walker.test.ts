import { describe, expect, it } from "vitest";
import type { Dir } from "../../../src/core/world/grid";
import { Walker } from "../../../src/core/world/walker";

const free = () => true;
// one tile per 100 ms
const SPEED = 10;

/** Runs `ms` in frames of `frame` ms with `held` and returns all events. */
function run(w: Walker, ms: number, held: Dir | null, canStep = free, frame = 1000 / 60) {
  const events = [];
  for (let t = 0; t < ms - 1e-9; t += frame) events.push(...w.update(Math.min(frame, ms - t), held, canStep));
  return events;
}

describe("the walker", () => {
  it("stands still with nothing held", () => {
    const w = new Walker(5, 5, "down", SPEED);
    expect(run(w, 500, null)).toEqual([]);
    expect(w.position()).toEqual({ x: 5, y: 5 });
  });

  it("moves smoothly between tiles: halfway after half a step's time", () => {
    const w = new Walker(5, 5, "down", SPEED);
    w.update(0, "right", free);
    w.update(50, "right", free);
    expect(w.position().x).toBeCloseTo(5.5);
    expect(w.position().y).toBe(5);
    expect(w.moving).toBe(true);
  });

  it("walks on without stopping while held, one tile per step", () => {
    const w = new Walker(5, 5, "down", SPEED);
    const events = run(w, 350, "left");
    expect(events.filter((e) => e.kind === "arrived").map((e) => e.kind === "arrived" && e.x)).toEqual([4, 3, 2]);
    // a frame never ends standing between steps: the leftover time carries on
    expect(w.moving).toBe(true);
    expect(w.position().x).toBeCloseTo(1.5);
  });

  it("finishes the step under way when let go, and stops on the tile", () => {
    const w = new Walker(5, 5, "down", SPEED);
    run(w, 130, "up");
    expect(w.position().y).toBeCloseTo(3.7);
    run(w, 500, null);
    expect(w.position()).toEqual({ x: 5, y: 3 });
    expect(w.moving).toBe(false);
  });

  it("takes a whole step for a short tap", () => {
    const w = new Walker(5, 5, "down", SPEED);
    w.update(16, "right", free);
    run(w, 400, null);
    expect(w.position()).toEqual({ x: 6, y: 5 });
  });

  it("turns but does not move into a wall, and says so once per push", () => {
    const w = new Walker(5, 5, "down", SPEED);
    const wall = () => false;
    const events = run(w, 300, "left", wall);
    expect(w.position()).toEqual({ x: 5, y: 5 });
    expect(w.facing).toBe("left");
    expect(events).toEqual([
      { kind: "turned", dir: "left" },
      { kind: "bumped", x: 5, y: 5, dir: "left" },
    ]);
    // let go and push again: a new bump
    run(w, 50, null, wall);
    expect(run(w, 50, "left", wall)).toEqual([{ kind: "bumped", x: 5, y: 5, dir: "left" }]);
  });

  it("stops at a wall it walks into while held", () => {
    const w = new Walker(0, 0, "down", SPEED);
    const canStep = (x: number, _y: number, d: Dir) => !(d === "right" && x >= 2);
    const events = run(w, 1000, "right", canStep);
    expect(w.position()).toEqual({ x: 2, y: 0 });
    expect(events.filter((e) => e.kind === "bumped")).toHaveLength(1);
  });

  it("changes direction at the next tile when another arrow is held", () => {
    const w = new Walker(5, 5, "down", SPEED);
    run(w, 50, "right");
    run(w, 100, "down");
    // the step to the right ends first, then it goes down
    expect(w.position().x).toBe(6);
    expect(w.position().y).toBeCloseTo(5.5);
  });

  it("catches up after a long frame without skipping its checks", () => {
    const w = new Walker(0, 0, "down", SPEED);
    const canStep = (x: number) => x < 3;
    w.update(0, "right", canStep);
    w.update(2000, "right", canStep);
    expect(w.position()).toEqual({ x: 3, y: 0 });
  });

  it("is placed on a tile by a teleport, standing", () => {
    const w = new Walker(0, 0, "down", SPEED);
    run(w, 50, "right");
    w.place(10, 19, "up");
    expect(w.position()).toEqual({ x: 10, y: 19 });
    expect(w.moving).toBe(false);
    expect(w.facing).toBe("up");
  });
});
