import { describe, expect, it } from "vitest";
import { AVATAR_KEYS, AVATARS, avatarImage } from "../../../src/core/family/avatars";

describe("avatars", () => {
  it("offers the three modest heroes, each with its own label", () => {
    expect(AVATARS.map((a) => a.key)).toEqual(["boy_blue", "girl_teal", "girl_curly"]);
    const labels = AVATARS.map((a) => a.labelHe);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l).toMatch(/^[֐-׿ ]+$/);
  });

  it("labels a hero by its look, not as a boy or a girl", () => {
    for (const a of AVATARS) expect(["בן", "בת"]).not.toContain(a.labelHe);
  });

  it("draws each hero from its own picture", () => {
    for (const a of AVATARS) expect(avatarImage(a.key)).toBe(`game/avatars/${a.key}.png`);
  });

  it("draws the old app's keys as the nearest hero", () => {
    expect(avatarImage("boy_light")).toBe("game/avatars/boy_blue.png");
    expect(avatarImage("boy_dark")).toBe("game/avatars/boy_blue.png");
    expect(avatarImage("girl_light")).toBe("game/avatars/girl_teal.png");
    expect(avatarImage("girl_dark")).toBe("game/avatars/girl_curly.png");
  });

  it("draws an unknown key as the first hero", () => {
    expect(avatarImage("tuxemon_heroine")).toBe("game/avatars/boy_blue.png");
  });

  it("accepts the heroes and the old keys, nothing else", () => {
    expect([...AVATAR_KEYS].sort()).toEqual(
      ["boy_blue", "boy_dark", "boy_light", "girl_curly", "girl_dark", "girl_light", "girl_teal"],
    );
  });
});
