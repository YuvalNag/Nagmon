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

  it("writes nothing for a minute with no frames", () => {
    const lines: string[] = [];
    const s = new FrameStats((l) => lines.push(l), 1000);
    s.flush();
    expect(lines).toEqual([]);
  });

  it("keeps the minute's frames across a pause: the wait is not a frame", () => {
    const lines: string[] = [];
    const s = new FrameStats((l) => lines.push(l), 60_000);
    let now = 0;
    for (let i = 0; i < 1800; i++) s.add(1000 / 60, (now += 1000 / 60)); // 30 s
    now += 20_000; // paused 20 s: no frames
    for (let i = 0; i < 700; i++) s.add(1000 / 60, (now += 1000 / 60)); // 11.7 s more
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^map frames: 60\.0 fps on average, slowest 17 ms, 0 over 50 ms \(2\d{3} frames\)$/);
  });

  it("keeps the whole run for the tests", () => {
    const s = new FrameStats(() => {}, 1000);
    let now = 0;
    for (let i = 0; i < 200; i++) s.add(20, (now += 20));
    expect(s.overall()).toEqual({ frames: 200, avgFps: 50, slowestMs: 20, slow: 0 });
  });
});
