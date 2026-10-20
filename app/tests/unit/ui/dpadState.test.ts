import { describe, expect, it } from "vitest";
import { DpadState, dirAt } from "../../../src/ui/dpadState";

describe("the d-pad's fingers", () => {
  it("holds the arrow a finger is on, and lets go when it lifts", () => {
    const d = new DpadState();
    d.down(1, "left");
    expect(d.held()).toBe("left");
    expect(d.take()).toBe("left");
    expect(d.take()).toBe("left");
    d.up(1);
    expect(d.held()).toBeNull();
    expect(d.take()).toBeNull();
  });

  it("counts a tap shorter than a frame once", () => {
    const d = new DpadState();
    d.down(1, "up");
    d.up(1);
    expect(d.take()).toBe("up");
    expect(d.take()).toBeNull();
  });

  it("follows a finger that slides to another arrow", () => {
    const d = new DpadState();
    d.down(1, "left");
    d.move(1, "up");
    expect(d.held()).toBe("up");
    d.move(1, null);
    expect(d.held()).toBeNull();
  });

  it("lets the newest finger win, and the older one take over when it lifts", () => {
    const d = new DpadState();
    d.down(1, "left");
    d.down(2, "up");
    expect(d.held()).toBe("up");
    d.up(2);
    expect(d.held()).toBe("left");
  });

  it("ignores a finger it never saw go down (one that was down before the map)", () => {
    const d = new DpadState();
    d.move(7, "right");
    d.up(7);
    expect(d.held()).toBeNull();
    expect(d.take()).toBeNull();
  });

  it("lets go of everything on clear (pause, background)", () => {
    const d = new DpadState();
    d.down(1, "left");
    d.down(2, "down");
    d.clear();
    expect(d.take()).toBeNull();
    expect(d.has(1)).toBe(false);
  });

  it("does not walk for a finger in the middle of the pad", () => {
    const d = new DpadState();
    d.down(1, null);
    expect(d.take()).toBeNull();
    d.move(1, "right");
    expect(d.held()).toBe("right");
  });
});

describe("the arrow under a point", () => {
  it("is the side the point leans to most", () => {
    expect(dirAt(-50, 5, 100)).toBe("left");
    expect(dirAt(60, -10, 100)).toBe("right");
    expect(dirAt(3, -70, 100)).toBe("up");
    expect(dirAt(-10, 80, 100)).toBe("down");
  });

  it("is none in the middle", () => {
    expect(dirAt(10, -10, 100)).toBeNull();
  });

  it("still points for a finger that slid off the pad", () => {
    expect(dirAt(-300, 20, 100)).toBe("left");
  });
});
