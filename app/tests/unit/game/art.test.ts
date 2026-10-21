import { describe, expect, it } from "vitest";
import { artUrl, backdropFor } from "../../../src/game/art";

describe("the art manifest", () => {
  it("gives each solar zone its backdrop and everything else Hearthrock's", () => {
    expect(backdropFor("solar_moon").id).toBe("backdrop_moon");
    expect(backdropFor("solar_outer").id).toBe("backdrop_outer");
    expect(backdropFor("classic_route_1").id).toBe("backdrop_hearthrock");
    expect(backdropFor(undefined).id).toBe("backdrop_hearthrock");
    expect(backdropFor("solar_sun", true).id).toBe("backdrop_night");
  });
  it("gives addresses under game/ and refuses an unknown picture", () => {
    expect(backdropFor("solar_giants").url).toBe("game/art/backdrops/giants.webp");
    expect(() => artUrl("nope")).toThrow();
  });
});
