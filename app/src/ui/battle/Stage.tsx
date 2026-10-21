import type { ReactNode } from "react";
import type { Creature } from "../../core/world/worldState";
import { avatarImage } from "../../core/family/avatars";
import type { MonsterTable } from "../../core/game/monsters";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { LIMITS, type FxPlan } from "./effects";

/** The result being played in the arena: which answer, how much it took. Each answer gets a new `id`. */
export interface Fx {
  id: number;
  correct: boolean;
  damage: number;
  /** The answer took the last of the fog: a victory pose follows the hit. */
  won: boolean;
  plan: FxPlan;
}

interface Props {
  monsters: MonsterTable;
  mine: Creature;
  myName: string;
  avatar: string;
  wildSpecies: string;
  wildName: string;
  wildLevel: number;
  hp: number;
  maxHp: number;
  /** Points the partner needs for its next level. */
  need: number;
  /** The subject of the questions: it shows in the little shapes around the wild creature. */
  subject: string;
  /** The result in play, or null. */
  fx: Fx | null;
  /** Calm effects: nothing drifts or flies. */
  calm: boolean;
  /** The creature is calm and the child cheers (a victory pose). */
  victory: boolean;
  /** A typed answer: the pad is at the bottom end and the wild creature stands a little to the start. */
  pad: boolean;
  /** The ids the tests read. */
  children?: ReactNode;
}

/** Little shapes (or letters) that float around the wild creature: the subject shows in its look. */
function Decor({ subject }: { subject: string }) {
  const letters = subject === "hebrew" ? ["א", "ב", "ג", "ד"] : subject === "english" ? ["A", "B", "C", "D"] : null;
  const colours = ["#e0555a", "#3d8fd1", "#59b56a", "#f0b13a"];
  const shapes = subject === "geometry" || subject === "math" ? ["tri", "sq", "dia", "tri"] : subject === "science" ? ["dot", "dot", "tri", "dot"] : ["dot", "sq", "tri", "dia"];
  return (
    <div className="decor" aria-hidden="true">
      {[0, 1, 2, 3].map((i) =>
        letters ? (
          <span key={i} className={`decor-item d${i}`} style={{ color: colours[i] }}>
            {letters[i]}
          </span>
        ) : (
          <svg key={i} className={`decor-item d${i}`} viewBox="0 0 20 20" width="22" height="22">
            {shapes[i] === "tri" && <polygon points="10,2 18,17 2,17" fill={colours[i]} />}
            {shapes[i] === "sq" && <rect x="3" y="3" width="14" height="14" rx="2" fill={colours[i]} />}
            {shapes[i] === "dia" && <polygon points="10,1 19,10 10,19 1,10" fill={colours[i]} />}
            {shapes[i] === "dot" && <circle cx="10" cy="10" r="8" fill={colours[i]} />}
          </svg>
        ),
      )}
    </div>
  );
}

const STAR = "10,1 12.6,7.4 19,7.8 14,12.2 15.7,19 10,15.3 4.3,19 6,12.2 1,7.8 7.4,7.4";

function Star({ i, n }: { i: number; n: number }) {
  // spread on a circle; the numbers are fixed, so the burst is the same each time
  const a = (i / n) * Math.PI * 2 + 0.4;
  const r = 46 + (i % 3) * 16;
  return (
    <svg className="fx-star" viewBox="0 0 20 20" width="18" height="18" style={{ ["--dx" as string]: `${Math.round(Math.cos(a) * r)}px`, ["--dy" as string]: `${Math.round(Math.sin(a) * r)}px` }}>
      <polygon points={STAR} fill="#ffd54a" stroke="#e6a100" strokeWidth="1" />
    </svg>
  );
}

function Leaf({ i }: { i: number }) {
  return (
    <svg className={`fx-leaf l${i}`} viewBox="0 0 20 20" width="16" height="16">
      <path d="M2 18 C2 6 10 2 18 2 C18 12 12 18 2 18Z" fill="#5fcf6a" stroke="#2f8f3c" strokeWidth="1" />
    </svg>
  );
}

function Smirk() {
  return (
    <svg className="fx-smirk" viewBox="0 0 28 28" width="30" height="30" aria-hidden="true">
      <circle cx="14" cy="14" r="12" fill="#ffe08a" stroke="#c99a1b" strokeWidth="1.5" />
      <circle cx="9.5" cy="11.5" r="1.8" fill="#17323a" />
      <circle cx="18.5" cy="11.5" r="1.8" fill="#17323a" />
      <path d="M8 17.5 Q14 21 20.5 15.5" fill="none" stroke="#17323a" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The arena (docs/app/BATTLE.md, "the parent's direction"): a sunny
 * scene, the child and the partner at the start, the wild creature at
 * the end with the shapes of its subject around it, the two cards in the
 * top corners, and the result of an answer played on top: the partner's
 * attack, stars, a number, the oops. Nothing in it flashes.
 */
export function Stage(p: Props) {
  const fx = p.fx;
  const plan = fx?.plan ?? null;
  const right = !!fx && fx.correct;
  const wrong = !!fx && !fx.correct;
  const cls = (base: string, ...on: [boolean, string][]) => [base, ...on.filter(([x]) => x).map(([, c]) => c)].join(" ");
  const attack = !!plan?.attack;
  const need = p.need;
  return (
    <div
      className="battle-scene"
      dir="ltr"
      data-fx={fx ? (fx.correct ? "right" : "wrong") : "none"}
      data-calm-fx={p.calm}
      data-victory={p.victory}
      data-pad={p.pad}
      data-won={!!fx?.won}
    >
      <div className="scene-bg" aria-hidden="true">
        <span className="scene-ground" style={{ backgroundImage: "url(game/sprites/ui/grass_background.png)" }} />
        <span className="scene-sun" />
        <span className="scene-cloud c1" />
        <span className="scene-cloud c2" />
        <span className="scene-leaf f1" />
        <span className="scene-leaf f2" />
        <span className="scene-leaf f3" />
      </div>

      <div className="hud hud-mine" dir="rtl">
        <span className="hud-name">
          <span className="battle-name">{p.myName}</span>
          <span className="battle-level">{t("battleLevel", { level: p.mine.level })}</span>
        </span>
        <div className="meter xp" role="progressbar" aria-label={t("battleLevel", { level: p.mine.level })} aria-valuemin={0} aria-valuemax={need} aria-valuenow={p.mine.xp}>
          <span style={{ width: `${Math.min(100, (100 * p.mine.xp) / need)}%` }} />
        </div>
      </div>
      <div className="hud hud-theirs" dir="rtl">
        <span className="hud-name">
          <span className="battle-name">{p.wildName}</span>
          <span className="battle-level">{t("battleLevel", { level: p.wildLevel })}</span>
        </span>
        <div
          className="meter hp"
          data-id="wild_hp"
          role="progressbar"
          aria-label={t("battleHealth", { name: p.wildName, hp: p.hp, max: p.maxHp })}
          aria-valuemin={0}
          aria-valuemax={p.maxHp}
          aria-valuenow={p.hp}
        >
          <span className="ghost" style={{ width: `${(100 * p.hp) / p.maxHp}%` }} />
          <span className="now" style={{ width: `${(100 * p.hp) / p.maxHp}%` }} />
        </div>
      </div>

      <div className="stand-mine">
        <img className={cls("battle-child", [p.victory, "cheer"])} src={avatarImage(p.avatar)} alt="" draggable={false} />
        <div className={cls("battle-pic mine", [attack && right, "lunge"], [wrong && !!plan?.oops && !plan.calm, "trip"])}>
          <MonsterPic monsters={p.monsters} species={p.mine.species} side="back" height={0.26} />
        </div>
      </div>

      <div className="stand-theirs">
        <Decor subject={p.subject} />
        <div className={cls("battle-pic theirs", [!!plan?.wildHit, "hit"], [wrong && !!plan?.oops && !plan.calm, "smirk"], [p.victory, "friend"])}>
          <MonsterPic monsters={p.monsters} species={p.wildSpecies} side="front" height={0.26} />
        </div>
      </div>

      {fx && plan && (
        <div className="fx-layer" key={fx.id} aria-hidden="true">
          {attack && (
            <span className="fx-bolt">
              <Leaf i={0} />
              <Leaf i={1} />
              <Leaf i={2} />
              <span className="fx-orb" />
            </span>
          )}
          {plan.stars > 0 && (
            <span className="fx-burst">
              {Array.from({ length: Math.min(plan.stars, LIMITS.maxParticles) }, (_, i) => (
                <Star key={i} i={i} n={plan.stars} />
              ))}
            </span>
          )}
          {plan.number && fx.damage > 0 && (
            <span className="fx-number" dir="ltr">
              {`-${fx.damage}`}
            </span>
          )}
          {wrong && plan.oops && !plan.calm && (
            <>
              <span className="fx-oops">?!</span>
              <span className="fx-smirk-wrap">
                <Smirk />
              </span>
            </>
          )}
          {wrong && plan.oops && plan.calm && <span className="fx-oops static">?</span>}
        </div>
      )}
      {p.children}
    </div>
  );
}
