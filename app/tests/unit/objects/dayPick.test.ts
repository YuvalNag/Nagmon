import { describe, expect, it } from "vitest";
import { dayNumber, dayOfWeek, hashOf, pickDistinct, weekOf } from "../../../src/core/game/dayPick";

describe("the day's picks", () => {
  it("counts days from a fixed date, so two phones on the same date agree", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("2026-10-22") - dayNumber("2026-10-21")).toBe(1);
    expect(dayNumber("2026-03-01") - dayNumber("2026-02-28")).toBe(1);
  });

  it("knows the weekday (0 is Sunday) and a week's name that changes on Sunday", () => {
    expect(dayOfWeek("2026-10-22")).toBe(4); // Thursday
    expect(dayOfWeek("2026-10-25")).toBe(0);
    expect(weekOf("2026-10-24")).toBe(weekOf("2026-10-19"));
    expect(weekOf("2026-10-25")).not.toBe(weekOf("2026-10-24"));
  });

  it("hashes a string the same way every time and spreads it", () => {
    expect(hashOf("2026-10-22")).toBe(hashOf("2026-10-22"));
    const seen = new Set<number>();
    for (let d = 0; d < 100; d++) seen.add(hashOf(`2026-01-${d}`) % 10);
    expect(seen.size).toBe(10);
  });

  it("picks n different entries by a seed, in a stable order, never the same one twice", () => {
    const pool = ["a", "b", "c", "d", "e", "f"];
    const a = pickDistinct(pool, 3, "2026-10-22");
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(pickDistinct(pool, 3, "2026-10-22")).toEqual(a);
    expect(pickDistinct(pool, 9, "x")).toHaveLength(6);
    expect(pickDistinct([], 3, "x")).toEqual([]);
    expect(pool).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
