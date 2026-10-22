import { useEffect, useRef, useState } from "react";
import { artUrl } from "../../game/art";
import * as fx from "./fx";

/**
 * One effect of the art manifest (game/art/manifest.json: `fx_attack_<subject>`, `fx_effect_hit`, `fx_effect_heal`,
 * with their `_add` additive twins): a sheet of 8 frames (4 x 2, 320 px each) played once over a spot of the arena
 * with the Web Animations API (src/ui/battle/fx.ts). The additive sheet glows over the picture (`screen`). The calm
 * switch plays one still frame that fades in and out. It removes itself when it is done. Never a flash: one soft
 * fade, 560 ms.
 */
export const FRAMES = 8;
const COLS = 4;
const STILL = 4; // the peak frame

/** The background position of a frame of a 4 x 2 sheet. */
export const framePos = (i: number): string => `${(i % COLS) * (100 / (COLS - 1))}% ${Math.floor(i / COLS) * 100}%`;

/** The keyframes that walk the 8 frames: each step holds until the next (no tween between frames). */
export function frameKeyframes(): Keyframe[] {
  const out: Keyframe[] = Array.from({ length: FRAMES }, (_, i) => ({ backgroundPosition: framePos(i), offset: i / FRAMES, easing: "steps(1, end)" }));
  out.push({ backgroundPosition: framePos(FRAMES - 1), offset: 1 });
  return out;
}

interface Props {
  /** The manifest id without `_add`, for example `fx_attack_math`. */
  id: string;
  calm: boolean;
  /** Where it plays: the creature's centre, in percent of the scene. */
  at: { left: number; top: number };
  /** Starts this many ms in (the impact of the bolt). */
  delay?: number;
  /** The sheet is played at this size (CSS px of the scene; at 100% text). */
  size?: number;
  tint?: string;
}

export function SpriteFx({ id, calm, at, delay = 0, size = 120, tint }: Props) {
  const wrap = useRef<HTMLSpanElement>(null);
  const sheet = useRef<HTMLSpanElement>(null);
  const [gone, setGone] = useState(false);
  let url = "";
  try {
    url = artUrl(`${id}_add`);
  } catch {
    url = "";
  }
  useEffect(() => {
    let alive = true;
    const w = wrap.current;
    const s = sheet.current;
    if (!w || !s || !url) return;
    const ms = 560;
    void (async () => {
      if (calm) {
        s.style.backgroundPosition = framePos(STILL);
        await fx.play(w, [{ opacity: 0 }, { opacity: 0.9, offset: 0.4 }, { opacity: 0 }], { ms: 700, delay, fade: true, easing: "ease-in-out" });
      } else {
        await Promise.all([fx.play(s, frameKeyframes(), { ms, delay, easing: "linear" }), fx.play(w, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { ms, delay, fade: true, easing: "linear" })]);
      }
      if (alive) setGone(true);
    })();
    return () => {
      alive = false;
    };
  }, [url, calm, delay]);
  if (gone || !url) return null;
  return (
    <span ref={wrap} className="sprite-fx" data-fx={id} aria-hidden="true" style={{ left: `${at.left}%`, top: `${at.top}%`, width: size, height: size, opacity: 0, ...(tint ? { ["--tint" as string]: tint } : {}) }}>
      <span ref={sheet} className="sprite-sheet" style={{ backgroundImage: `url(${url})`, backgroundPosition: framePos(0) }} />
    </span>
  );
}
