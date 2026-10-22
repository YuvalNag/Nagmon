import { useEffect, useRef } from "react";
import type { TryResult } from "../../core/game/befriendTry";
import { artUrl } from "../../game/art";
import { t } from "../../i18n";
import { Tap } from "../Tap";
import * as fx from "./fx";

/**
 * The throw (docs/app/BATTLE_V3.md 8.7), about 4 s:
 *   0.0-0.6 the tool arcs from the partner to the creature, spinning
 *   0.6-1.0 the creature shrinks softly into the net, the net drops
 *   1.0-3.1 three shakes (500 / 500 / 600 ms and a 200 ms pause each)
 *   3.1-4.0 success: the net glows and hearts burst; or on shake k the net
 *           pops open early and the creature trots back (never red, never fear)
 * A tap speeds it up 2x, a second tap skips to its end. Calm effects turn the
 * movement off (fades and the frames still play). The outcome is decided before
 * (`TryResult`); this only shows it.
 */
export type ThrowSound = "throw" | "shake" | "win" | "pop";

interface Props {
  r: TryResult;
  /** Multiplies every length (the tests' hook, calm effects 0.5). */
  scale: number;
  sound: (s: ThrowSound, k?: number) => void;
  /** The throw is over (played or skipped). */
  onDone: () => void;
}

/** The sheets are 4 x 2 frames: the frame's background position. */
export function frameAt(f: number): string {
  const col = f % 4;
  const row = Math.floor(f / 4);
  return `${(col * 100) / 3}% ${row * 100}%`;
}

const NET_FRAMES = { ball: 0, opening: 1, flying: 2, open: 3, closing: 4, closed: 5, closedB: 6, glow: 7 } as const;
/** Pixels of the net on screen. */
const SIZE = 130;

export function BefriendThrow({ r, scale, sound, onDone }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const net = useRef<HTMLSpanElement>(null);
  const burst = useRef<HTMLSpanElement>(null);
  const ctl = useRef({ rate: 1, skipped: false, alive: true, done: false });
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    const c = ctl.current;
    c.alive = true;
    const layer = root.current;
    const scene = layer?.parentElement;
    const netEl = net.current;
    const burstEl = burst.current;
    if (!layer || !scene || !netEl || !burstEl) return;
    const wild = scene.querySelector<HTMLElement>(".battle-pic.theirs");
    const mine = scene.querySelector<HTMLElement>(".battle-pic.mine");
    const say = (step: string) => {
      layer.dataset["step"] = step;
    };
    const ms = (n: number) => n * scale;
    /** Waits n ms at normal speed; the speed-up shortens it, a skip ends it. */
    const wait = async (n: number) => {
      let left = ms(n);
      while (left > 0 && !c.skipped && c.alive) {
        const slice = Math.min(20, left);
        await new Promise<void>((res) => setTimeout(res, slice));
        left -= slice * c.rate;
      }
    };
    const frame = (el: HTMLElement, f: number) => {
      el.style.backgroundPosition = frameAt(f);
    };
    const live = () => c.alive && !c.skipped;

    const sceneR = scene.getBoundingClientRect();
    const centre = (el: HTMLElement | null, fx_: number, fy: number) => {
      const b = (el ?? scene).getBoundingClientRect();
      return { x: b.left - sceneR.left + b.width * fx_, y: b.top - sceneR.top + b.height * fy };
    };
    const from = centre(mine, 0.8, 0.35);
    const to = centre(wild, 0.5, 0.62);
    const pos = (p: { x: number; y: number }, extra = "") => `translate(${Math.round(p.x - SIZE / 2)}px, ${Math.round(p.y - SIZE / 2)}px)${extra}`;
    const place = (p: { x: number; y: number }, extra = "") => {
      netEl.style.transform = pos(p, extra);
    };
    const ground = { x: to.x, y: to.y + 22 };

    const finalState = (ok: boolean) => {
      fx.skip();
      netEl.style.opacity = ok ? "1" : "0";
      if (wild) {
        wild.style.transition = "none";
        wild.style.opacity = ok ? "0" : "1";
        wild.style.transform = "";
      }
      if (ok) {
        frame(netEl, NET_FRAMES.glow);
        place(ground);
        burstEl.style.opacity = "0";
      } else {
        burstEl.style.opacity = "0";
      }
    };

    const run = async () => {
      const ok = r.kind === "caught";
      netEl.style.opacity = "0";
      burstEl.style.opacity = "0";
      // ---- the tool flies (0.0 - 0.6) ----
      say("fly");
      soundRef.current("throw");
      place(from);
      frame(netEl, NET_FRAMES.ball);
      netEl.style.opacity = "1";
      const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 70 };
      void fx.play(
        netEl,
        [
          { transform: pos(from, " rotate(0deg)"), easing: "ease-out" },
          { transform: pos(mid, " rotate(270deg)"), offset: 0.5, easing: "ease-in" },
          { transform: pos(to, " rotate(540deg)") },
        ],
        { ms: ms(600), easing: "linear" },
      );
      await wait(200);
      if (live()) frame(netEl, NET_FRAMES.opening);
      await wait(200);
      if (live()) frame(netEl, NET_FRAMES.flying);
      await wait(200);
      if (!live()) return finalState(ok);
      place(to);
      // ---- the creature shrinks into the net (0.6 - 1.0) ----
      say("catch");
      frame(netEl, NET_FRAMES.open);
      if (wild) {
        void fx.play(wild, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.3)", opacity: 0 }], { ms: ms(400), easing: "ease-in-out", fade: true });
        wild.style.transition = "none";
      }
      await wait(130);
      if (live()) frame(netEl, NET_FRAMES.closing);
      await wait(130);
      if (live()) frame(netEl, NET_FRAMES.closed);
      void fx.play(netEl, [{ transform: pos(to) }, { transform: pos({ x: to.x, y: to.y + 26 }), offset: 0.6 }, { transform: pos({ x: to.x, y: to.y + 16 }), offset: 0.8 }, { transform: pos(ground) }], { ms: ms(140), easing: "ease-in" });
      await wait(140);
      if (!live()) return finalState(ok);
      if (wild) wild.style.opacity = "0";
      place(ground);
      // ---- the shakes (1.0 - 3.1) ----
      const durations = [500, 500, 600];
      for (let k = 1; k <= r.shakes; k++) {
        say(`shake${k}`);
        soundRef.current("shake", k);
        const popping = !ok && r.failedAt === k;
        const d = popping ? durations[k - 1]! / 2 : durations[k - 1]!;
        frame(netEl, k % 2 ? NET_FRAMES.closedB : NET_FRAMES.closed);
        void fx.play(netEl, [{ transform: pos(ground, " rotate(0deg)") }, { transform: pos(ground, " rotate(-14deg)"), offset: 0.25 }, { transform: pos(ground, " rotate(14deg)"), offset: 0.6 }, { transform: pos(ground, " rotate(0deg)") }], { ms: ms(d), easing: "ease-in-out" });
        await wait(d);
        if (!live()) return finalState(ok);
        if (popping) break;
        await wait(200);
        if (!live()) return finalState(ok);
      }
      if (ok) {
        // ---- success: the net glows, hearts burst, "click" (3.1 - 4.0) ----
        say("click");
        soundRef.current("win");
        frame(netEl, NET_FRAMES.glow);
        burstEl.style.backgroundImage = `url(${artUrl("fx_effect_befriend")})`;
        burstEl.style.transform = pos(ground, " scale(1.6)");
        burstEl.style.opacity = "1";
        void fx.play(netEl, [{ opacity: 1 }, { opacity: 0.7 }, { opacity: 1 }], { ms: ms(500), easing: "ease-in-out", fade: true });
        for (let f = 0; f < 8 && live(); f++) {
          frame(burstEl, f);
          await wait(110);
        }
        if (!live()) return finalState(true);
        burstEl.style.opacity = "0";
        await wait(100);
        if (!live()) return finalState(true);
      } else {
        // ---- the net pops open early; the creature giggles and trots back ----
        say("pop");
        soundRef.current("pop");
        frame(netEl, NET_FRAMES.open);
        void fx.play(netEl, [{ transform: pos(ground, " scale(1)"), opacity: 1 }, { transform: pos(ground, " scale(1.1)"), opacity: 1, offset: 0.5 }, { transform: pos(ground, " scale(0)"), opacity: 0 }], { ms: ms(200), easing: "ease-out", fade: true });
        if (wild) {
          wild.style.opacity = "1";
          void fx.play(wild, [{ transform: "scale(0.3) translateY(0)", opacity: 0 }, { transform: "scale(1) translateY(-18px)", opacity: 1, offset: 0.55 }, { transform: "scale(1) translateY(0)", opacity: 1 }], { ms: ms(300), easing: "ease-out", fade: true });
        }
        await wait(300);
        if (!live()) return finalState(false);
      }
      say("done");
    };

    void run().then(() => {
      if (!c.alive || c.done) return;
      c.done = true;
      const ok = r.kind === "caught";
      finalState(ok);
      doneRef.current();
    });
    return () => {
      c.alive = false;
      // never leave the wild creature hidden when the throw is torn down
      if (wild && r.kind !== "caught") {
        wild.style.opacity = "";
        wild.style.transform = "";
        wild.style.transition = "";
      }
      fx.reset();
    };
    // one throw per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The first tap speeds the throw up, the second skips to its end. */
  const tap = () => {
    const c = ctl.current;
    if (c.rate === 1) {
      c.rate = 2;
      fx.speed(2);
    } else {
      c.skipped = true;
      fx.skip();
    }
  };

  return (
    <div ref={root} className="throw-layer" data-id="befriend_throw" data-result={r.kind} data-shakes={r.shakes} data-failed-at={r.failedAt ?? 0} data-step="start">
      <span ref={net} className="throw-net" aria-hidden="true" style={{ width: SIZE, height: SIZE, backgroundImage: `url(${artUrl("fx_effect_net")})` }} />
      <span ref={burst} className="throw-burst" aria-hidden="true" style={{ width: SIZE, height: SIZE }} />
      <Tap id="befriend_throw_skip" className="skip-layer arena" aria-label={t("battleSkip")} onTap={tap} />
    </div>
  );
}
