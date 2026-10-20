import { describe, expect, it } from "vitest";
import { MAX_ZOOM, pickZoom, scrollFor, snap } from "../../../src/core/world/camera";

describe("the map's zoom", () => {
  it("is 2 on the family's phone (1080 device px tall): 8.4 rows of tiles", () => {
    expect(pickZoom(1080)).toBe(2);
  });

  it("is 1 on a small 720p phone, where 2 would show under 6 rows", () => {
    expect(pickZoom(720)).toBe(1);
  });

  it("is never over 2, even on a tall tablet", () => {
    expect(pickZoom(2560)).toBe(MAX_ZOOM);
    expect(MAX_ZOOM).toBe(2);
  });

  it("is a whole number", () => {
    for (let h = 300; h < 3000; h += 37) expect(Number.isInteger(pickZoom(h))).toBe(true);
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
