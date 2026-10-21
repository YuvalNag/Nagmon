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

// ---- age bands (docs/app/BATTLE.md, 2.4 and 4.4) ----

export type Band = "A" | "B" | "C";

/** A: 5 to 7, B: 8 to 10, C: 11 and up. */
export function bandOf(age: number): Band {
  return age <= 7 ? "A" : age <= 10 ? "B" : "C";
}

/**
 * Pips that fill the meter. Pips plus the burst's three questions have to
 * fit in the battle's question cap (5 / 7 / 8), or Special could never be
 * reached: so 2 for the youngest, 3 after (the design note had 3 and 4).
 */
export const METER_SIZE: Record<Band, number> = { A: 2, B: 3, C: 3 };

/** The questions of one Special: a burst of three. */
export const BURST_QUESTIONS = 3;

/** A right Power-up answer adds one pip, up to the size; a wrong one changes nothing (never empties, never fills). */
export function charge(meter: number, size: number, correct: boolean): number {
  return correct ? Math.min(size, meter + 1) : meter;
}

/** What each hit of a burst takes: a third of the fog left when it began, so three hits calm the creature. */
export function burstHit(hpAtStart: number): number {
  return Math.max(1, Math.ceil(hpAtStart / BURST_QUESTIONS));
}

export interface Burst {
  /** One slot for each question: a hit (true), a miss (false) or not asked yet (null). */
  medals: (boolean | null)[];
  /** The combo is over: a wrong answer, or the cap. */
  broken: boolean;
}

export function newBurst(): Burst {
  return { medals: Array.from({ length: BURST_QUESTIONS }, () => null), broken: false };
}

export function comboOf(b: Burst): number {
  return b.medals.filter((m) => m === true).length;
}

/** A burst is on while it has questions left and the combo holds. */
export function burstLive(b: Burst | null): b is Burst {
  return !!b && !b.broken && b.medals.some((m) => m === null);
}

/** Records one answer of the burst: a right one lands a hit; a wrong one ends the combo (the rest stay unasked). */
export function burstAnswer(b: Burst, correct: boolean): void {
  const i = b.medals.indexOf(null);
  if (i < 0 || b.broken) return;
  b.medals[i] = correct;
  if (!correct) b.broken = true;
}

// ---- how many fog questions (docs/app/BATTLE.md, 4.4) ----

/** The fog questions a battle is meant to take, by band. */
export const QUIZ_TARGET: Record<Band, number> = { A: 3, B: 4, C: 5 };

/** The hard cap, wrong answers included: at it the creature calms by itself. */
export const QUIZ_CAP: Record<Band, number> = { A: 5, B: 7, C: 8 };

/** A master's test is twice the fog: its cap is a little more. */
export const MASTER_CAP_EXTRA = 3;

/**
 * What a right Power-up answer takes: the partner's strength, but never
 * more than the half of the fog that free beats cannot take, shared out
 * over the target number of questions. (So about the target in right
 * answers calm a creature once the free beats have done their half.)
 */
export function questionHit(strength: number, maxHp: number, target: number): number {
  return Math.max(1, Math.min(strength, Math.ceil((maxHp * FOG_FLOOR) / target)));
}
