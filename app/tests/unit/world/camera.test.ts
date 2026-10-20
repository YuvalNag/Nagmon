import { describe, expect, it } from "vitest";
import { mapZoom, scrollFor, snap } from "../../../src/core/world/camera";

describe("the map's zoom", () => {
  it("is a whole 2 over the x4 atlas at the map's 8 device px per 1x px", () => {
    expect(mapZoom(8, 64 / 16)).toBe(2);
  });

  it("shrinks with the canvas when it draws fewer pixels than the screen", () => {
    // 2.75 -> 2: the canvas has 2/2.75 of the pixels; tiles keep their size on the screen
    expect(mapZoom(8, 4, 2 / 2.75)).toBeCloseTo(1.4545, 4);
    expect(mapZoom(8, 4, 2 / 2.75) * (2.75 / 2)).toBeCloseTo(2, 10);
  });
});

describe("the camera's scroll", () => {
  // a 40-tile map (2560 px) seen 1200 px wide at zoom 2
  it("keeps the walker in the middle", () => {
    expect(scrollFor(1000, 1200, 2560, 2)).toBe(400);
  });

  it("stops at the map's start and end", () => {
    expect(scrollFor(100, 1200, 2560, 2)).toBe(0);
    expect(scrollFor(2500, 1200, 2560, 2)).toBe(1360);
  });

  it("puts a map smaller than the view in the middle", () => {
    // a 20-tile gym (1280 px) in a 1600 px view
    expect(scrollFor(640, 1600, 1280, 1)).toBe(-160);
  });

  it("lands on whole device pixels", () => {
    expect(scrollFor(1000.3, 1200, 2560, 2)).toBe(400.5);
    expect(snap(10.26, 2)).toBe(10.5);
    expect(snap(10.24, 2)).toBe(10);
  });
});
