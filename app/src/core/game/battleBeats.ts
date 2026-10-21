/**
 * The pure rules of a battle's beats (docs/app/BATTLE.md, section 4):
 * which of the big cards a child may pick, what a free beat takes, the
 * meter, the burst and the caps by age. No screen and no engine here.
 */

/** The three cards (and the Special that takes Move's place when the meter is full). */
export type Beat = "move" | "power" | "assist" | "special";

/** Free beats can only take the fog down to this share of its full amount. */
export const FOG_FLOOR = 0.5;
/** The friend's assists in one battle. */
export const ASSISTS_PER_BATTLE = 2;
/** A free beat takes this share of what a right answer takes. */
const FREE_SHARE = 1 / 3;

export interface BeatState {
  /** The battle is on (not calm, not over). */
  fighting: boolean;
  /** The last beat was a question (a Power-up, or the end of a burst). */
  lastWasQuestion: boolean;
  meterFull: boolean;
  assistsLeft: number;
}

export type Legal = Record<Beat, boolean>;

/**
 * The cards a child may pick now. Never two question beats in a row
 * (the burst's own questions are inside one beat); a full meter turns
 * Move into Special; the assist is limited; and a free beat is always
 * possible unless Special stands in its place, so nobody is ever stuck.
 */
export function legalBeats(s: BeatState): Legal {
  if (!s.fighting) return { move: false, power: false, assist: false, special: false };
  const special = s.meterFull && !s.lastWasQuestion;
  return { move: !special, power: !s.lastWasQuestion, assist: s.assistsLeft > 0, special };
}

/** What a Move or an assist takes: a third of a right answer, and never past the fog floor. */
export function freeDamage(hp: number, maxHp: number, rightDamage: number): number {
  const room = Math.max(0, hp - Math.ceil(maxHp * FOG_FLOOR));
  return Math.min(room, Math.max(1, Math.round(rightDamage * FREE_SHARE)));
}

/** The fog is at its floor: free beats take nothing more, and a Power-up is the way on. */
export function atFloor(hp: number, maxHp: number): boolean {
  return hp <= Math.ceil(maxHp * FOG_FLOOR);
}
