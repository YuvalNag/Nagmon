import { useEffect, useMemo, useRef, useState } from "react";
import type { Play } from "../../app/play";
import { effectsFrom } from "../../core/family/effects";
import { creatureStats, speciesBattle } from "../../core/game/battleSpecies";
import type { Stats } from "../../core/game/battleNumbers";
import { pageSfx } from "../../platform/sfx";
import { t } from "../../i18n";
import * as fxm from "../battle/fx";
import { subjectColor } from "../battle/subjects";
import { MonsterPic } from "../MonsterPic";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import { useCalm } from "../battle/useCalm";
import { type Layer, lengthAt, stepsOf } from "./effects";
import { particlesOf } from "./particles";
import { type Anim, countAt, type Beat, type BeatId, EvolutionClock, MAX_TICKS_PER_S, type Mode, planFor, specMs } from "./timeline";
import "../../i18nEvolution";

interface Props {
  play: Play;
  /** The creature that evolved: the species is already the new one (the caller changed and saved it). */
  creatureId: string;
  from: string;
  to: string;
  how: "learning" | "card";
  /** Makes every length shorter (the tests' hook): 1 is the real time. */
  scale?: number;
  /** The scene is over (played, skipped or "continue"): once. */
  onDone: () => void;
}

/** The rules' lengths when a build has no battle data (the spec's own numbers). */
const DEFAULT_ANIM: Anim = { long_s: 10.6, short_s: 6, calm_s: 1.6, skip_rate: 3 };
const STATS: readonly (keyof Stats)[] = ["pep", "power", "guard", "speed"];
const STAT_TEXT = { pep: "evoStatPep", power: "evoStatPower", guard: "evoStatGuard", speed: "evoStatSpeed" } as const;
/** The number count takes 600 ms in steps no closer than 1 / MAX_TICKS_PER_S s. */
const COUNT_MS = 600;

/**
 * The evolution (docs/app/BATTLE_V3.md 7.4): ten beats, about 10.6 s: the screen dims, the creature steps into the
 * light, lights spiral in, it turns to a white shape, the shape changes, a ring of light and stars burst, the new
 * creature lands, a card tells who grew into whom and the numbers count up, hearts rise, it settles. A tap after
 * 1.4 s speeds up the rest (3x, the name card is still read at normal speed); "continue" ends it. The parent can
 * choose the short version; calm effects play one crossfade. The white shapes are the sprite drawn white by a CSS
 * filter (nothing is drawn at run time); the lights are small DOM shapes (6 to 24 of them), and only opacity and
 * transform move. Nothing flashes: no brightness step quicker than 300 ms, two pulses at most a second.
 */
export function EvolutionScene({ play, creatureId, from, to, how, scale = 1, onDone }: Props) {
  const settings = effectsFrom(play.profile.settings);
  const calm = useCalm(play.profile.settings);
  const mode: Mode = calm ? "calm" : settings.evolution === "short" ? "short" : "long";
  const anim = play.battle?.rules.evolution.animation ?? DEFAULT_ANIM;
  const plan = useMemo(() => planFor(mode, anim), [mode, anim]);
  const creature = play.world.creatures.find((c) => c.id === creatureId);
  const level = creature?.level ?? 1;
  const subject = play.subjectOf(to);
  const stats = useMemo(() => {
    if (!play.battle) return null;
    return { before: creatureStats(speciesBattle(play.battle, from), level), after: creatureStats(speciesBattle(play.battle, to), level) };
  }, [play.battle, from, to, level]);

  const [beat, setBeat] = useState<BeatId>("B0");
  const [shown, setShown] = useState<number[]>(() => (stats ? STATS.map((k) => stats.before[k]) : []));
  const [counted, setCounted] = useState(false);
  const root = useRef<HTMLElement>(null);
  const layers = useRef<Partial<Record<Layer, HTMLElement | null>>>({});
  const lights = useRef<HTMLDivElement>(null);
  const clock = useRef<EvolutionClock | null>(null);
  const finished = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const sfx = useMemo(() => pageSfx(), []);
  const switches = effectsFrom(play.profile.settings);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    clock.current?.stop();
    fxm.reset();
    doneRef.current();
  };

  useEffect(() => {
    fxm.setCalm(mode === "calm");
    const rate = () => clock.current?.speed ?? 1;
    const play_ = (id: BeatId, b: Beat) => {
      const factor = b.ms / specMs(id);
      for (const s of stepsOf(id)) {
        const el = layers.current[s.layer];
        void fxm.play(el, s.keyframes, { ms: lengthAt({ ...s, ms: s.ms * factor }, rate()), easing: s.easing, delay: ((s.delay ?? 0) * factor) / rate(), ...(s.fade ? { fade: true } : {}) });
      }
    };
    const shine = (id: BeatId) => {
      const layer = lights.current;
      if (!layer || mode === "calm") return;
      const area = { w: window.innerWidth, h: window.innerHeight };
      for (const p of particlesOf(id, area)) {
        const el = document.createElement("span");
        el.className = `evo-light ${p.kind} ${p.tone}`;
        el.setAttribute("aria-hidden", "true");
        el.textContent = p.glyph;
        el.style.fontSize = `${p.size}px`;
        layer.appendChild(el);
        const frames = p.path.map((pt, i) => {
          const f = i / (p.path.length - 1);
          const fade = p.kind === "mote" ? Math.sin(Math.PI * Math.min(1, f * 1.1)) : 1 - f * f;
          return { transform: `translate(calc(-50% + ${pt.x}px), calc(-50% + ${pt.y}px)) scale(${p.kind === "mote" ? 0.6 + 0.6 * Math.sin(Math.PI * f) : 1 - 0.7 * f})`, opacity: Math.max(0, fade) } as Keyframe;
        });
        const gone = () => el.remove();
        void fxm.play(el, frames, { ms: p.ms / rate(), delay: p.delay / rate(), easing: "ease-out" }).then(gone, gone);
        // no animation to play (calm, an old WebView, the tests): the light is not left standing
        if (typeof el.animate !== "function") gone();
      }
    };
    // a scale below 1 shortens the sequence (the clock's plan time runs faster, so the 1.4 s tap guard keeps its meaning)
    const timer = { set: (fn: () => void, ms: number) => setTimeout(fn, ms * scale), clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>), now: () => performance.now() / scale };
    const c = new EvolutionClock(plan, timer, anim.skip_rate, {
      beat: (b) => {
        setBeat(b.id);
        play_(b.id, b);
        shine(b.id);
        // the burst: one light tick (the optional haptic), the chime on the reveal and the celebration
        if (b.id === "B5") sfx.tick(switches);
        if (b.id === "B6" || b.id === "B8") void sfx.play("win", switches);
        if (b.id === "B0") void sfx.play("hit", switches);
        if (b.id === "B7") setCounted(true);
      },
      done: finish,
    });
    clock.current = c;
    c.start();
    return () => {
      c.stop();
      fxm.reset();
      lights.current?.replaceChildren();
    };
    // one sequence for this scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the numbers count up during B7, each a little after the one before, in steps of at most ten a second
  useEffect(() => {
    if (!counted || !stats) return;
    const end = STATS.map((k) => stats.after[k]);
    const start = STATS.map((k) => stats.before[k]);
    if (mode === "calm") {
      setShown(end);
      return;
    }
    const step = 1000 / MAX_TICKS_PER_S;
    let at = 0;
    const id = setInterval(() => {
      at += step;
      setShown(start.map((s, i) => countAt(s, end[i]!, (at - i * 120) / COUNT_MS)));
      if (at >= COUNT_MS + 3 * 120) {
        clearInterval(id);
        setShown(end);
      }
    }, step);
    return () => clearInterval(id);
  }, [counted, stats, mode]);

  const setLayer = (name: Layer) => (el: HTMLElement | null) => {
    layers.current[name] = el;
  };
  const title = t("cardEvolved", { old: play.text(from), name: play.text(to) });
  const onCard = beat === "B7" || beat === "B8" || beat === "B9";
  const pic = (species: string, cls: string, layer: Layer, hidden = true) => (
    <div className={`evo-pic ${cls}`} ref={setLayer(layer)} aria-hidden={hidden || undefined}>
      <MonsterPic monsters={play.monsters} species={species} height={0.34} />
    </div>
  );
  return (
    <ScreenTime>
      <section ref={root} className="evo" data-screen="evolution" data-beat={beat} data-mode={mode} data-how={how} role="dialog" aria-label={title} style={{ ["--evo" as string]: subjectColor(subject) }}>
        <div className="evo-dim" ref={setLayer("dim")} />
        <div className="evo-glow" ref={setLayer("glow")} />
        <div className="evo-burst" ref={setLayer("burst")} />
        <div className="evo-ring" ref={setLayer("ring")} />
        <div className="evo-stage" ref={setLayer("creature")}>
          {pic(from, "old", "old")}
          {pic(from, "old sil", "oldSil")}
          {pic(to, "new", "new")}
          {pic(to, "new sil", "newSil")}
        </div>
        <div className="evo-lights" ref={lights} />
        <div className="evo-card" data-id="evolve_card" ref={setLayer("card")} aria-live="polite" data-shown={onCard}>
          {onCard && (
            <>
              <h2 className="title" data-id="evolve_title">
                {title}
              </h2>
              {stats && (
                <ul className="evo-stats">
                  {STATS.map((k, i) => (
                    <li key={k} data-id={`evolve_stat_${k}`} data-value={shown[i]}>
                      <span>{t(STAT_TEXT[k])}</span>
                      <b>{shown[i]}</b>
                    </li>
                  ))}
                </ul>
              )}
              {how === "learning" && (
                <p className="evo-shimmer" data-id="evolve_shimmer">
                  ✨ {t("evoShimmerLine", { subject: play.subjects.title(subject) })}
                </p>
              )}
              {beat !== "B7" && <p className="evo-owl">🦉 {t("evoOwl")}</p>}
            </>
          )}
          <span className="evo-book" ref={setLayer("book")} data-id="evolve_book" data-on={onCard}>
            📖 {t("evoBook")}
          </span>
          {onCard && (
            <Tap id="evolve_done" className="primary evo-done" onTap={finish}>
              {t("evoDone")}
            </Tap>
          )}
        </div>
        {!onCard && (
          <Tap id="evolve_skip" className="skip-layer evo-skip" aria-label={t("evoSkip")} onTap={() => void clock.current?.tap()}>
            <span className="evo-skip-hint" aria-hidden="true">
              {t("evoSkip")}
            </span>
          </Tap>
        )}
      </section>
    </ScreenTime>
  );
}
