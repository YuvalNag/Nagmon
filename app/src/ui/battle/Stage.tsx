import { type ReactNode, useEffect, useRef } from "react";
import type { Creature } from "../../core/world/worldState";
import { avatarImage } from "../../core/family/avatars";
import type { IntentView } from "../../core/game/battle";
import type { WheelHit } from "../../core/game/battleNumbers";
import type { MonsterTable } from "../../core/game/monsters";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { backdropFor } from "../../game/art";
import { LIMITS, type FxPlan } from "./effects";
import * as fx from "./fx";
import { INTENT_ICON, subjectColor, subjectIcon } from "./subjects";

/** The result being played in the arena: which answer, how much it took. Each answer gets a new `id`. */
export interface Fx {
  id: number;
  correct: boolean;
  damage: number;
  /** The answer took the last of the fog: a victory pose follows the hit. */
  won: boolean;
  plan: FxPlan;
  /** The wheel's Sparkle (a gold ring on the number) or Sturdy (a grey number). */
  wheel?: WheelHit;
  /** A Brilliant hit. */
  brilliant?: boolean;
}

/** What the enemy did this round, played on the partner: a Puff, a Giggle, a Silly Dance. Each gets a new `id`. */
export interface EnemyFx {
  id: number;
  kind: "puff" | "giggle" | "silly";
  /** Pep taken (a Puff) or fog given back (a Giggle). */
  amount: number;
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
  /** The partner's Pep, now and at most (the bar). */
  pep: { now: number; max: number };
  /** The partner fell asleep: it lies down under a blanket. */
  asleep: boolean;
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
  /** What the enemy will do this round, shown over it (its look depends on the age band). */
  intent: IntentView | null;
  /** 1: the icon; 2: the icon and a number; 3: the icon, a number and who is faster (ages 5-7, 8-10, 11 and up). */
  detail: 1 | 2 | 3;
  /** The subjects the enemy loves (the chip), or null when the child does not know them yet (a "?"). */
  loves: { id: string; title: string }[] | null;
  /** The enemy's action of this round, in play. */
  enemyFx: EnemyFx | null;
  /** The map the battle is on: its zone picks the backdrop. */
  map?: string;
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
 * The arena (docs/app/BATTLE.md, "the parent's direction"): the zone's
 * backdrop, the child and the partner at the start, the wild creature at
 * the end with the shapes of its subject around it, the two cards in the
 * top corners, and the result of an answer played on top: the partner's
 * attack, stars, a number, the oops. Nothing in it flashes.
 */
export function Stage(p: Props) {
  const fxr = p.fx;
  const plan = fxr?.plan ?? null;
  const right = !!fxr && fxr.correct;
  const wrong = !!fxr && !fxr.correct;
  const mineRef = useRef<HTMLDivElement>(null);
  const theirsRef = useRef<HTMLDivElement>(null);
  // the enemy's action: it steps toward the partner, which shakes and dips (the animations of fx.ts: movement stops for calm effects)
  const enemyId = p.enemyFx?.id ?? 0;
  const enemyKind = p.enemyFx?.kind;
  useEffect(() => {
    if (!enemyId) return;
    if (enemyKind === "puff") {
      void fx.lunge(theirsRef.current, -1, 36);
      void fx.shake(mineRef.current, 5);
      void fx.flash(mineRef.current);
    } else if (enemyKind === "giggle") void fx.flash(theirsRef.current);
  }, [enemyId, enemyKind]);
  const cls = (base: string, ...on: [boolean, string][]) => [base, ...on.filter(([x]) => x).map(([, c]) => c)].join(" ");
  const attack = !!plan?.attack;
  const need = p.need;
  const backdrop = backdropFor(p.map);
  return (
    <div
      className="battle-scene"
      dir="ltr"
      data-fx={fxr ? (fxr.correct ? "right" : "wrong") : "none"}
      data-calm-fx={p.calm}
      data-victory={p.victory}
      data-pad={p.pad}
      data-won={!!fxr?.won}
    >
      <div className="scene-bg" aria-hidden="true">
        <span className="scene-ground" data-backdrop={backdrop.id} style={{ backgroundImage: `url(${backdrop.url})` }} />
      </div>

      <div className="hud hud-mine" dir="rtl">
        <span className="hud-name">
          <span className="battle-name">{p.myName}</span>
          <span className="battle-level">{t("battleLevel", { level: p.mine.level })}</span>
        </span>
        <div
          className="meter pep"
          data-id="partner_pep"
          data-asleep={p.asleep}
          role="progressbar"
          aria-label={t("battlePepLabel", { name: p.myName, pep: p.pep.now, max: p.pep.max })}
          aria-valuemin={0}
          aria-valuemax={p.pep.max}
          aria-valuenow={p.pep.now}
        >
          <span style={{ width: `${Math.min(100, (100 * p.pep.now) / Math.max(1, p.pep.max))}%` }} />
        </div>
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
        <div className="loves" data-id="battle_loves" data-known={p.loves !== null} aria-label={p.loves ? t("battleLoves", { subjects: p.loves.map((l) => l.title).join(", ") }) : t("battleLovesUnknown")}>
          <span className="loves-word">{t("battleLovesWord")}</span>
          {p.loves ? (
            p.loves.map((s) => (
              <span key={s.id} className="subject-dot" data-subject={s.id} style={{ ["--subject" as string]: subjectColor(s.id) }} aria-hidden="true">
                {subjectIcon(s.id)}
              </span>
            ))
          ) : (
            <span className="subject-dot unknown" aria-hidden="true">
              ?
            </span>
          )}
        </div>
      </div>

      <div className="stand-mine">
        <img className={cls("battle-child", [p.victory, "cheer"])} src={avatarImage(p.avatar)} alt="" draggable={false} />
        <div ref={mineRef} className={cls("battle-pic mine", [attack && right, "lunge"], [wrong && !!plan?.oops && !plan.calm, "trip"])} data-asleep={p.asleep}>
          <MonsterPic monsters={p.monsters} species={p.mine.species} side="back" height={0.26} />
          {p.asleep && (
            <span className="blanket" aria-hidden="true">
              💤
            </span>
          )}
        </div>
      </div>

      <div className="stand-theirs">
        <Decor subject={p.subject} />
        {p.intent && (
          <div
            className="intent"
            data-id="battle_intent"
            data-intent={p.intent.id}
            data-amount={p.intent.amount}
            data-first={p.intent.first}
            role="img"
            aria-label={`${t(`intent_${p.intent.id}` as const)}${p.detail >= 2 && p.intent.amount > 0 ? `, ${t("intentAbout", { n: p.intent.amount })}` : ""}${p.detail >= 3 ? `, ${p.intent.first ? t("intentFirst") : t("intentSecond")}` : ""}`}
          >
            <span className="intent-icon" aria-hidden="true">
              {INTENT_ICON[p.intent.id]}
            </span>
            {p.detail >= 2 && p.intent.amount > 0 && (
              <span className="intent-n" aria-hidden="true" dir="ltr">
                ~{p.intent.amount}
              </span>
            )}
            {p.detail >= 3 && (
              <span className="intent-first" aria-hidden="true">
                {p.intent.first ? "⚡1" : "⚡2"}
              </span>
            )}
          </div>
        )}
        <div ref={theirsRef} className={cls("battle-pic theirs", [!!plan?.wildHit, "hit"], [wrong && !!plan?.oops && !plan.calm, "smirk"], [p.victory, "friend"])}>
          <MonsterPic monsters={p.monsters} species={p.wildSpecies} side="front" height={0.26} />
        </div>
      </div>

      {fxr && plan && (
        <div className="fx-layer" key={fxr.id} aria-hidden="true">
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
          {plan.number && fxr.damage > 0 && (
            <span className="fx-number" dir="ltr" data-wheel={fxr.wheel ?? "none"} data-brilliant={!!fxr.brilliant}>
              {`-${fxr.damage}`}
              {fxr.brilliant && <span className="fx-brilliant">✨</span>}
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
      {p.enemyFx && (
        <div className="fx-layer enemy" key={`e${p.enemyFx.id}`} data-kind={p.enemyFx.kind} aria-hidden="true">
          {p.enemyFx.kind === "puff" && (
            <>
              <span className="fx-cloud">☁️</span>
              <span className="fx-number mine" dir="ltr">{`-${p.enemyFx.amount}`}</span>
            </>
          )}
          {p.enemyFx.kind === "giggle" && <span className="fx-number giggle" dir="ltr">{p.enemyFx.amount > 0 ? `+${p.enemyFx.amount}` : "😄"}</span>}
          {p.enemyFx.kind === "silly" && <span className="fx-notes">🎵</span>}
        </div>
      )}
      {p.children}
    </div>
  );
}
