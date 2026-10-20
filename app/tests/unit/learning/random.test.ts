// @vitest-environment node
/** PyRandom against values CPython 3.13 gives for the same seeds. */
import { describe, expect, it } from "vitest";
import { PyRandom } from "../../../src/core/learning/random";

describe("PyRandom", () => {
  it("replays CPython's random.Random(42)", () => {
    const r = new PyRandom(42);
    expect(r.random()).toBe(0.6394267984578837);
    expect(r.randint(1, 100)).toBe(4);
    expect(r.getrandbits(32)).toBe(3184935163);
    expect(r.choice(["a", "b", "c", "d"])).toBe("c");
    expect(r.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([3, 9, 2]);
    expect(r.sample(Array.from({ length: 100 }, (_, i) => i), 7)).toEqual([94, 13, 86, 69, 11, 75, 54]);
    expect(r.uniform(-1, 1)).toBe(-0.9364346410364328);
    expect(r.choices(["x", "y", "z"], [1, 2, 3], 4)).toEqual(["x", "y", "z", "z"]);
    expect(r.randrange(0, 60, 5)).toBe(55);
    const a = [1, 2, 3, 4, 5, 6];
    r.shuffle(a);
    expect(a).toEqual([3, 2, 1, 4, 5, 6]);
  });

  it("seeds wider than 32 bits", () => {
    const r = new PyRandom(2 ** 40 + 12345);
    expect(r.random()).toBe(0.31036222241287226);
    expect(r.getrandbits(40)).toBe(493462063);
  });

  it("rejects non-integers in randrange and randint, as Python 3.12+", () => {
    const r = new PyRandom(1);
    expect(() => r.randint(1.5, 3)).toThrow(TypeError);
    expect(() => r.randrange(0, 2.5)).toThrow(TypeError);
    expect(() => r.randrange(2.5)).toThrow(TypeError);
    expect(() => r.randrange(0, 10, 0.5)).toThrow(TypeError);
  });
});
