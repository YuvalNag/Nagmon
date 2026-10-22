import type { Card } from "../../core/game/battle";
import { flames } from "../../core/game/moves";
import type { MonsterTable } from "../../core/game/monsters";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import { moveGlyph, subjectColor, subjectIcon } from "./subjects";

/** One portrait of the friends strip. */
export interface Friend {
  id: string;
  species: string;
  name: string;
  /// the partner now
  active: boolean;
  /** Fell asleep: it cannot be used until it is healed. */
  fainted: boolean;
  /** Pep, 0 to 1 (the thin bar under the portrait). */
  pep: number;
}

export interface ActionBarProps {
  monsters: MonsterTable;
  /** The four cards (or the Little Wiggle alone). */
  cards: Card[];
  moveName: (id: string) => string;
  subjectTitle: (subject: string) => string;
  friends: Friend[];
  /** The creature is calm: the Net is the next step and the cards rest. */
  calm: boolean;
  /** Befriending is open now (a wild creature, fighting or calm; the tray opens). */
  canBefriend: boolean;
  /** The cards take taps now (not while our own animation plays); a tap while a round plays waits its turn. */
  live: boolean;
  /** Nothing is playing: swapping and the Bag are open too. */
  idle: boolean;
  /** A move tapped while the round plays: it starts when the round ends. */
  queued: string | null;
  /** The partner fell asleep: a friend must be picked (free) and the cards wait. */
  pick: boolean;
  /** Changes with each round, so a finger that lifts as the menu returns presses nothing (screenTime.tsx). */
  turn: number;
  onMove: (id: string) => void;
  onFriend: (id: string) => void;
  onBefriend: () => void;
  onBag: () => void;
  onLeave: () => void;
}

const TIER_ICON: Record<string, string> = { E: "🍃", N: "⭐", S: "👑", F: "✨", U: "⭐", C: "⭐", K: "⭐", Q: "⭐", W: "" };
const TIER_WORD: Record<string, "tierEasy" | "tierNormal" | "tierStretch"> = { E: "tierEasy", N: "tierNormal", S: "tierStretch", F: "tierStretch", U: "tierNormal", C: "tierNormal", K: "tierNormal", Q: "tierEasy", W: "tierEasy" };

/** Charges as up to five dots, in proportion (the number is in the label). */
function Dots({ left, max }: { left: number | null; max: number | null }) {
  if (left === null || max === null) return <span className="dots" aria-hidden="true">∞</span>;
  const on = Math.ceil((left / max) * 5);
  return (
    <span className="dots" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} data-on={i < on} />
      ))}
    </span>
  );
}

/**
 * The menu of docs/app/BATTLE_V3.md (2.2): the friends strip, the four move
 * cards in a 2 x 2 grid (choosing a move IS the question), and Befriend, Bag and
 * Run. A card shows the move's name, its subject in the subject's colour, its
 * power flames, a tier badge, its charges as dots and, when the child may
 * know it, whether the enemy loves that subject (a sparkle) or is sturdy
 * against it. A card with no charges left is dimmed. Run is always free.
 * The order is the DOM order: in Hebrew (right to left) it runs from the
 * right edge inward.
 */
export function ActionBar(p: ActionBarProps) {
  const open = p.live && !p.calm && !p.pick;
  return (
    <ScreenTime key={`bar-${p.turn}`}>
      <div className="action-bar" role="toolbar" aria-label={t("battleActions")} data-calm={p.calm} data-pick={p.pick} data-live={open}>
        <ul className="friends-strip" aria-label={t("battleTeam")} data-id="battle_team">
          {p.friends.map((f) => (
            <li key={f.id}>
              <Tap
                id={`battle_friend_${f.id}`}
                className={`portrait${f.active ? " active" : ""}${f.fainted ? " asleep" : ""}${p.pick && !f.fainted && !f.active ? " pulse" : ""}`}
                aria-pressed={f.active}
                aria-label={`${f.name}${f.fainted ? `, ${t("battleFriendAsleep")}` : ""}`}
                data-asleep={f.fainted}
                disabled={f.fainted || f.active || p.calm || !p.idle}
                onTap={() => p.onFriend(f.id)}
              >
                <MonsterPic monsters={p.monsters} species={f.species} height={0.09} />
                {f.fainted && (
                  <span className="zz" aria-hidden="true">
                    💤
                  </span>
                )}
                <span className="pep-mini" aria-hidden="true">
                  <span style={{ width: `${Math.round(100 * (f.fainted ? 0 : f.pep))}%` }} />
                </span>
              </Tap>
            </li>
          ))}
        </ul>
        <div className="move-grid" role="group" aria-label={t("battleMoves")} data-count={p.cards.length}>
          {p.cards.map((c) => {
            const subject = c.move.subject === "any" ? null : c.move.subject;
            const title = subject ? p.subjectTitle(subject) : t("battleNoSubject");
            const label = `${p.moveName(c.move.id)}, ${title}${c.left !== null ? `, ${t("battleCharges", { n: c.left, max: c.max ?? c.left })}` : ""}${c.hit === "sparkle" ? `, ${t("battleSparkle")}` : c.hit === "sturdy" ? `, ${t("battleSturdy")}` : ""}`;
            return (
              <Tap
                key={c.move.id}
                id={`battle_move_${c.move.id}`}
                className={`move-card${p.queued === c.move.id ? " queued" : ""}${c.dimmed ? " dimmed" : ""}${c.hit ? ` ${c.hit}` : ""}`}
                style={{ ["--subject" as string]: subjectColor(subject) }}
                aria-label={label}
                data-tier={c.move.tier}
                data-hit={c.hit ?? "none"}
                data-left={c.left ?? "inf"}
                disabled={c.dimmed || p.calm || p.pick || !p.live}
                onTap={() => p.onMove(c.move.id)}
              >
                <span className="card-top">
                  <span className="subject-dot" aria-hidden="true">
                    {subjectIcon(subject)}
                  </span>
                  <span className="move-name">{p.moveName(c.move.id)}</span>
                </span>
                <span className="card-meta" aria-hidden="true">
                  <span className="flames">{"🔥".repeat(flames(c.move.tier))}</span>
                  {c.move.tier !== "W" && (
                    <span className="tier" title={t(TIER_WORD[c.move.tier] ?? "tierNormal")}>
                      {TIER_ICON[c.move.tier] ?? "⭐"}
                    </span>
                  )}
                  {c.why && c.why !== "charges" ? <span className="why">{t(c.why === "yawn" ? "battleWhyYawn" : c.why === "dizzy" ? "battleWhyDizzy" : "battleWhyEcho")}</span> : <Dots left={c.left} max={c.max} />}
                  {moveGlyph(c.move) && <span className="glyph">{moveGlyph(c.move)}</span>}
                  {c.hit === "sparkle" && <span className="mark sparkle">✨</span>}
                  {c.hit === "sturdy" && <span className="mark sturdy">🛡️</span>}
                </span>
                {c.move.tier === "W" && <small className="card-note">{t("battleWiggleNote")}</small>}
              </Tap>
            );
          })}
        </div>
        <div className="side-buttons">
          <Tap id="battle_befriend" className={`small${p.canBefriend && p.calm ? " pulse" : ""}`} disabled={!p.canBefriend} onTap={p.onBefriend}>
            <span className="act-icon" aria-hidden="true">
              🥅
            </span>
            {t("battleBefriend")}
          </Tap>
          <Tap id="battle_bag" className="small" disabled={!p.idle} onTap={p.onBag}>
            <span className="act-icon" aria-hidden="true">
              🎒
            </span>
            {t("battleBag")}
          </Tap>
          <Tap id="battle_run" className="small" onTap={p.onLeave}>
            <span className="act-icon" aria-hidden="true">
              👣
            </span>
            {t("battleLeave")}
          </Tap>
        </div>
      </div>
    </ScreenTime>
  );
}
