import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Music } from "../../../src/game/music";

/** A stand-in for <audio>: jsdom does not play. */
class FakeAudio {
  static made: FakeAudio[] = [];
  paused = true;
  loop = false;
  volume = 1;
  preload = "";
  constructor(public src: string) {
    FakeAudio.made.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {}
  load() {}
}

beforeEach(() => {
  FakeAudio.made = [];
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => vi.unstubAllGlobals());

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("the map's music", () => {
  it("plays a looping track, holds it while paused and goes on after", async () => {
    const m = new Music();
    m.play("town.ogg");
    await flush();
    expect(m.playing).toBe(true);
    expect(FakeAudio.made[0].loop).toBe(true);
    m.hold();
    expect(m.playing).toBe(false);
    m.release();
    await flush();
    expect(m.playing).toBe(true);
  });

  it("stays silent after it is destroyed, even for a late play (a door that loaded after the exit)", async () => {
    const m = new Music();
    m.play("town.ogg");
    await flush();
    m.destroy();
    expect(FakeAudio.made.every((a) => a.paused)).toBe(true);
    m.play("academy.ogg");
    m.release();
    await flush();
    expect(m.playing).toBe(false);
    expect(FakeAudio.made).toHaveLength(1);
  });

  it("does not start a track that is held", async () => {
    const m = new Music();
    m.hold();
    m.play("town.ogg");
    await flush();
    expect(m.playing).toBe(false);
  });
});
