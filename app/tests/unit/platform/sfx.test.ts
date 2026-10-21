import { describe, expect, it, vi } from "vitest";
import { SFX_VOLUME } from "../../../src/core/family/effects";
import { Sfx, type AudioLike } from "../../../src/platform/sfx";

const DB = { nagmon_sfx_hit: "audio/sfx/battle/nagmon_hit.wav", nagmon_sfx_oops: "audio/sfx/battle/nagmon_oops.wav", nagmon_sfx_win: "audio/sfx/battle/nagmon_win.wav" };

function make(over: { active?: boolean; hidden?: boolean; vibrate?: ((ms: number) => boolean) | null; playFails?: boolean; db?: Record<string, string> | null } = {}) {
  const played: { url: string; volume: number }[] = [];
  const state = { active: over.active ?? true, hidden: over.hidden ?? false };
  const vibrations: number[] = [];
  const sfx = new Sfx({
    loadDb: async () => (over.db === undefined ? DB : over.db),
    makeAudio: (url): AudioLike => ({
      volume: 1,
      play() {
        played.push({ url, volume: this.volume });
        return over.playFails ? Promise.reject(new Error("blocked")) : Promise.resolve();
      },
      pause() {},
    }),
    activated: () => state.active,
    hidden: () => state.hidden,
    vibrate: over.vibrate === null ? null : (over.vibrate ?? ((ms) => (vibrations.push(ms), true))),
  });
  return { sfx, played, vibrations, state };
}

describe("the battle's sounds", () => {
  it("play the right file for each event, at a low volume", async () => {
    const { sfx, played } = make();
    const on = { sound: true, vibration: true };
    await sfx.play("hit", on);
    await sfx.play("oops", on);
    await sfx.play("win", on);
    expect(played.map((p) => p.url)).toEqual(["audio/sfx/battle/nagmon_hit.wav", "audio/sfx/battle/nagmon_oops.wav", "audio/sfx/battle/nagmon_win.wav"]);
    for (const p of played) expect(p.volume).toBeLessThanOrEqual(SFX_VOLUME);
    expect(SFX_VOLUME).toBeLessThanOrEqual(0.4);
  });

  it("stay silent when the parents switched sound off", async () => {
    const { sfx, played } = make();
    await sfx.play("hit", { sound: false, vibration: true });
    expect(played).toEqual([]);
  });

  it("never play before the first tap, and never when the page is hidden", async () => {
    const early = make({ active: false });
    await early.sfx.play("hit", { sound: true, vibration: true });
    expect(early.played).toEqual([]);
    early.state.active = true;
    await early.sfx.play("hit", { sound: true, vibration: true });
    expect(early.played).toHaveLength(1);
    const away = make({ hidden: true });
    await away.sfx.play("win", { sound: true, vibration: true });
    expect(away.played).toEqual([]);
  });

  it("a refused play, a missing slug or no sound table is no error", async () => {
    const refused = make({ playFails: true });
    await expect(refused.sfx.play("hit", { sound: true, vibration: true })).resolves.toBeUndefined();
    const none = make({ db: null });
    await expect(none.sfx.play("hit", { sound: true, vibration: true })).resolves.toBeUndefined();
    const missing = make({ db: {} });
    await missing.sfx.play("oops", { sound: true, vibration: true });
    expect(missing.played).toEqual([]);
  });
});

describe("the haptic tick", () => {
  it("is one short tick on a right answer when vibration is on", () => {
    const { sfx, vibrations } = make();
    sfx.tick({ sound: true, vibration: true });
    expect(vibrations).toEqual([20]);
  });

  it("is off when the parents switched vibration off, or before the first tap", () => {
    const off = make();
    off.sfx.tick({ sound: true, vibration: false });
    expect(off.vibrations).toEqual([]);
    const early = make({ active: false });
    early.sfx.tick({ sound: true, vibration: true });
    expect(early.vibrations).toEqual([]);
  });

  it("is guarded: a phone with no vibrate, or one that throws, is fine", () => {
    const none = make({ vibrate: null });
    expect(() => none.sfx.tick({ sound: true, vibration: true })).not.toThrow();
    const boom = make({ vibrate: vi.fn(() => { throw new Error("no"); }) });
    expect(() => boom.sfx.tick({ sound: true, vibration: true })).not.toThrow();
  });
});
