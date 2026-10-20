import { describe, expect, it } from "vitest";
import { FrameStats } from "../../../src/platform/frameStats";

describe("the frame-rate line", () => {
  it("is written once a minute, with the average and the slowest frame", () => {
    const lines: string[] = [];
    const s = new FrameStats((l) => lines.push(l));
    let now = 0;
    for (let i = 0; i < 3600; i++) {
      const dt = i === 100 ? 70 : 1000 / 60;
      now += dt;
      s.add(dt, now);
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^map frames: 59\.\d fps on average, slowest 70 ms, 1 over 50 ms \(\d+ frames\)$/);
  });

  it("writes nothing for a minute with no frames, and starts afresh after a pause", () => {
    const lines: string[] = [];
    const s = new FrameStats((l) => lines.push(l), 1000);
    s.flush();
    expect(lines).toEqual([]);
    s.add(16, 0);
    s.restart();
    s.add(16, 5000);
    // the pause between is not counted as a minute gone by
    expect(lines).toEqual([]);
  });

  it("keeps the whole run for the tests", () => {
    const s = new FrameStats(() => {}, 1000);
    let now = 0;
    for (let i = 0; i < 200; i++) s.add(20, (now += 20));
    expect(s.overall()).toEqual({ frames: 200, avgFps: 50, slowestMs: 20, slow: 0 });
  });
});
