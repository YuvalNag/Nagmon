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

  it("may go past the low edge by the covered part of the view (the d-pad)", () => {
    // 277 world px of the view's left side are under the d-pad
    expect(scrollFor(96, 1200, 2560, 2, 277)).toBe(-277);
    // the walker at column 1 (x 64-128) is drawn right of the cover
    expect(96 - 32 - scrollFor(96, 1200, 2560, 2, 277)).toBeGreaterThanOrEqual(277);
    // away from the edge nothing changes
    expect(scrollFor(1000, 1200, 2560, 2, 277)).toBe(400);
    // nor at the far edge
    expect(scrollFor(2500, 1200, 2560, 2, 277)).toBe(1360);
    // it eases in: one tile further right, the camera moves one tile less far out
    expect(scrollFor(160, 1200, 2560, 2, 277)).toBe(-277);
    expect(scrollFor(400, 1200, 2560, 2, 277)).toBe(-200);
  });

  it("puts a small map in the middle of the uncovered part", () => {
    // an 800 px map, a 1200 px view, 200 px covered: 100 px each side of the rest
    expect(scrollFor(400, 1200, 800, 1, 200)).toBe(-300);
  });
});
