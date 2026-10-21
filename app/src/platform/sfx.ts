/**
 * The battle's three little sounds and one haptic tick.
 *
 * - The files are our own (tools/sfx_battle.py), found through
 *   `game/db/sounds.json` and played the way the music is: an HTML audio
 *   element, which follows the phone's own volume and mute.
 * - Never before the first tap on the screen, never while the page is
 *   hidden (the lifecycle stops all sound there too), and only when the
 *   parents' Sound switch is on, at a low volume.
 * - The tick is `navigator.vibrate`, guarded: not every phone has it.
 */
import { SFX_VOLUME } from "../core/family/effects";

export type SfxName = "hit" | "oops" | "win";

/** The two switches that matter here (EffectSettings has more). */
export interface SfxSwitches {
  sound: boolean;
  vibration: boolean;
}

/** The part of an audio element the sounds use. */
export interface AudioLike {
  volume: number;
  play(): Promise<void>;
  pause(): void;
}

export interface SfxOptions {
  /** The table of sound names to files (game/db/sounds.json); null when it cannot be read. */
  loadDb: () => Promise<Record<string, string> | null>;
  makeAudio: (url: string) => AudioLike;
  /** The child has touched the screen. */
  activated: () => boolean;
  hidden: () => boolean;
  /** navigator.vibrate, or null when there is none. */
  vibrate: ((ms: number) => boolean) | null;
}

const SLUG: Record<SfxName, string> = { hit: "nagmon_sfx_hit", oops: "nagmon_sfx_oops", win: "nagmon_sfx_win" };
/** One light tick: 20 ms. */
export const TICK_MS = 20;

export class Sfx {
  private db: Promise<Record<string, string> | null> | null = null;
  private readonly sounds = new Map<string, AudioLike>();

  constructor(private readonly o: SfxOptions) {}

  async play(name: SfxName, on: SfxSwitches): Promise<void> {
    if (!on.sound || !this.o.activated() || this.o.hidden()) return;
    try {
      this.db ??= this.o.loadDb().catch(() => null);
      const db = await this.db;
      const url = db?.[SLUG[name]];
      if (!url) return;
      let a = this.sounds.get(url);
      if (!a) {
        a = this.o.makeAudio(url);
        this.sounds.set(url, a);
      }
      a.volume = SFX_VOLUME;
      await a.play();
    } catch {
      // no sound on this device, or not allowed yet: the battle goes on in silence
    }
  }

  /** The haptic tick for a right answer. */
  tick(on: SfxSwitches): void {
    if (!on.vibration || !this.o.activated() || !this.o.vibrate) return;
    try {
      this.o.vibrate(TICK_MS);
    } catch {
      // not allowed or not there
    }
  }
}

/** The page's own sounds: the browser's audio element, its first-touch rule, its vibrate. */
export function pageSfx(): Sfx {
  return new Sfx({
    loadDb: async () => {
      const res = await fetch("game/db/sounds.json");
      return res.ok ? ((await res.json()) as Record<string, string>) : null;
    },
    makeAudio: (url) => {
      const a = new Audio(`game/${url}`);
      a.preload = "auto";
      return a;
    },
    activated: () => {
      const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      return ua ? ua.hasBeenActive : true;
    },
    hidden: () => document.hidden,
    vibrate: typeof navigator.vibrate === "function" ? (ms) => navigator.vibrate(ms) : null,
  });
}
