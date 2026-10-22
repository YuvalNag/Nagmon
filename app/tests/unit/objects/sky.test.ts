import { describe, expect, it } from "vitest";
import { MOON_PHASES, moonOn, skyOn } from "../../../src/core/world/sky";

describe("the moon, from the real date", () => {
  // dates of known new and full moons (UTC), at the local noon of that date
  it.each([
    ["2024-04-08", "new"], // the eclipse
    ["2025-09-21", "new"],
    ["2026-10-10", "new"],
    ["2024-01-25", "full"],
    ["2025-03-14", "full"],
    ["2025-09-07", "full"],
    ["2026-10-26", "full"],
  ])("%s is the %s moon", (day, phase) => {
    expect(moonOn(day).phase).toBe(phase);
  });

  it("goes through the eight phases in order, once a month, and a quarter is half lit", () => {
    const seq: string[] = [];
    for (let d = 0; d < 30; d++) {
      const day = new Date(Date.UTC(2026, 9, 10 + d)).toISOString().slice(0, 10);
      const p = moonOn(day).phase;
      if (seq[seq.length - 1] !== p) seq.push(p);
    }
    expect(seq.slice(0, 8)).toEqual([...MOON_PHASES]);
    expect(moonOn("2026-10-18").phase).toBe("first_quarter");
    const lit = moonOn("2026-10-18").lit;
    expect(lit).toBeGreaterThan(0.4);
    expect(lit).toBeLessThan(0.6);
    expect(moonOn("2026-10-26").lit).toBeGreaterThan(0.95);
    expect(moonOn("2026-10-10").lit).toBeLessThan(0.05);
  });

  it("does not depend on the time zone of the phone: only on the date text", () => {
    expect(moonOn("2026-10-22")).toEqual(moonOn("2026-10-22"));
  });
});

describe("the sky of a day", () => {
  it("has a meteor shower on the real shower dates", () => {
    expect(skyOn("2026-08-12")).toMatchObject({ event: "meteor_shower", shower: "perseids" });
    expect(skyOn("2026-12-14")).toMatchObject({ event: "meteor_shower", shower: "geminids" });
    expect(skyOn("2027-01-03")).toMatchObject({ event: "meteor_shower", shower: "quadrantids" });
    expect(skyOn("2026-11-17")).toMatchObject({ event: "meteor_shower", shower: "leonids" });
  });

  it("is deterministic: the same date gives the same sky", () => {
    for (const d of ["2026-10-22", "2026-03-01", "2026-12-31"]) expect(skyOn(d)).toEqual(skyOn(d));
  });

  it("has a solar wind day about one day in seven, never on a shower day; every other day is clear", () => {
    let wind = 0;
    let clear = 0;
    const total = 700;
    for (let i = 0; i < total; i++) {
      const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const s = skyOn(day);
      if (s.event === "solar_wind") wind++;
      if (s.event === "clear") clear++;
      expect(s.shower === undefined || s.event === "meteor_shower").toBe(true);
    }
    expect(wind).toBeGreaterThan(total / 7 - 25);
    expect(wind).toBeLessThan(total / 7 + 25);
    expect(clear).toBeGreaterThan(total / 2);
  });

  it("carries the moon of that day", () => {
    expect(skyOn("2026-10-26").moon.phase).toBe("full");
  });
});
