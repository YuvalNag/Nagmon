import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS, effectsFrom, lessMovement, nextMotion, withEffects } from "../../../src/core/family/effects";
import { ProfileStore } from "../../../src/core/family/profiles";
import { MemoryFileStore } from "../../../src/platform/storage";

describe("the parents' switches for the battle's effects", () => {
  it("default: movement follows the system, sound on (low), vibration on", () => {
    expect(effectsFrom({})).toEqual(DEFAULT_EFFECTS);
    expect(DEFAULT_EFFECTS).toEqual({ motion: "system", sound: true, vibration: true });
    expect(effectsFrom(undefined)).toEqual(DEFAULT_EFFECTS);
    expect(effectsFrom({ effects: "loud" })).toEqual(DEFAULT_EFFECTS);
  });

  it("a bad value falls back to its own default, the good ones stay", () => {
    expect(effectsFrom({ effects: { motion: "wild", sound: "yes", vibration: false } })).toEqual({ motion: "system", sound: true, vibration: false });
  });

  it("changing one keeps the others and the rest of the settings", () => {
    const s = withEffects({ learning: { timer: true }, free_names: false }, { sound: false });
    expect(s).toEqual({ learning: { timer: true }, free_names: false, effects: { motion: "system", sound: false, vibration: true } });
    expect(effectsFrom(withEffects(s, { motion: "less" }))).toEqual({ motion: "less", sound: false, vibration: true });
  });

  it("the motion button goes round: system, less, full", () => {
    expect(nextMotion("system")).toBe("less");
    expect(nextMotion("less")).toBe("full");
    expect(nextMotion("full")).toBe("system");
  });

  it("less movement: the system's wish by default, the parent's word over it", () => {
    expect(lessMovement("system", true)).toBe(true);
    expect(lessMovement("system", false)).toBe(false);
    expect(lessMovement("less", false)).toBe(true);
    expect(lessMovement("full", true)).toBe(false);
  });

  it("is saved with the child and read back after a new start", async () => {
    const fs = new MemoryFileStore();
    const store = new ProfileStore(fs, { avatars: new Set(["boy_a"]) });
    const p = await store.create({ name: "נועה", avatar: "boy_a", grade: 2 });
    p.settings = withEffects(p.settings, { motion: "less", sound: false, vibration: false });
    await store.save(p);
    const again = await new ProfileStore(fs, { avatars: new Set(["boy_a"]) }).get(p.id);
    expect(effectsFrom(again.settings)).toEqual({ motion: "less", sound: false, vibration: false });
  });
});
