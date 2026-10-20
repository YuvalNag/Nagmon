/**
 * Pure logic behind the question screen and the battle hooks
 * (docs/kids/SDD_QUIZ_GAMEPLAY.md), a port of `nagmon/quiz_flow.py`: which
 * subject a monster type practises, the combo bonus, the per-battle
 * question budget, and the input buffers for the number pad, ordering and
 * letter tiles.
 */

export const DEFAULT_SUBJECT = "math";
export const COMBO_EVERY = 3;
export const COMBO_BONUS = 0.5;

type Info = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export class SubjectMap {
  constructor(
    readonly elementToSubject: Readonly<Record<string, string>>,
    readonly info: Info,
    /** Monsters with a subject of their own, whatever their techniques' types. */
    readonly monsterToSubject: Readonly<Record<string, string>> = {},
  ) {}

  /** From the parsed `subjects.yaml` (`{subjects: {math: {elements, monsters, title_he, color}}}`). */
  static fromDoc(doc: unknown): SubjectMap {
    const d = (doc ?? {}) as Record<string, unknown>;
    const info = { ...((d["subjects"] as Info | null | undefined) ?? {}) };
    const mapping: Record<string, string> = {};
    const monsters: Record<string, string> = {};
    for (const [subject, data] of Object.entries(info)) {
      for (const element of (data["elements"] as string[] | null | undefined) ?? []) mapping[element] = subject;
      for (const monster of (data["monsters"] as string[] | null | undefined) ?? []) monsters[monster] = subject;
    }
    return new SubjectMap(mapping, info, monsters);
  }

  /**
   * Which subject a battle question is about, in this order: the parent's
   * choice for this monster; the monster's own subject; the first
   * technique type we know, with the parent's choice for that type first.
   */
  subjectFor(types: Iterable<string>, override?: Readonly<Record<string, string>> | null, monster?: string | null): string {
    if (monster && override && Object.hasOwn(override, monster)) return override[monster]!;
    if (monster && Object.hasOwn(this.monsterToSubject, monster)) return this.monsterToSubject[monster]!;
    for (const t of types) {
      if (override && Object.hasOwn(override, t)) return override[t]!;
      if (Object.hasOwn(this.elementToSubject, t)) return this.elementToSubject[t]!;
    }
    return DEFAULT_SUBJECT;
  }

  title(subject: string): string {
    return String(this.info[subject]?.["title_he"] ?? subject);
  }

  color(subject: string): string {
    return String(this.info[subject]?.["color"] ?? "#999999");
  }
}

/** Extra power on every third correct answer in a row. */
export function comboBonus(streak: number): number {
  return streak > 0 && streak % COMBO_EVERY === 0 ? COMBO_BONUS : 0.0;
}

export function powerWithCombo(power: number, streak: number): number {
  return power > 1.0 ? power + comboBonus(streak) : power;
}

/** How many questions one battle may ask (the parent sets it). */
export class BattleQuizBudget {
  asked = 0;

  constructor(readonly limit: number) {}

  take(): boolean {
    if (this.asked >= this.limit) return false;
    this.asked += 1;
    return true;
  }
}

const DIGIT = /^\p{Nd}$/u;

/** Digits, one decimal point or one fraction bar, leading minus. */
export class NumberPad {
  text = "";

  constructor(readonly maxLen = 10) {}

  press(key: string): void {
    if (key === "back") {
      this.text = this.text.slice(0, -1);
      return;
    }
    if (this.text.length >= this.maxLen) return;
    if (DIGIT.test(key)) this.text += key;
    else if (key === "-" && !this.text) this.text = "-";
    else if (key === "." && !this.text.includes(".") && !this.text.includes("/")) this.text += ".";
    else if (key === "/" && this.hasDigit() && !this.text.includes(".") && !this.text.includes("/")) this.text += "/";
  }

  private hasDigit(): boolean {
    return Array.from(this.text).some((c) => DIGIT.test(c));
  }

  clear(): void {
    this.text = "";
  }
}

/** Builds an ordering by picking items one after another. */
export class OrderPicker {
  readonly picked: string[] = [];

  constructor(readonly ids: readonly string[]) {}

  pick(itemId: string): void {
    if (this.ids.includes(itemId) && !this.picked.includes(itemId)) this.picked.push(itemId);
  }

  undo(): void {
    this.picked.pop();
  }

  get complete(): boolean {
    return this.picked.length === this.ids.length;
  }
}

/** Spells a word from shuffled letter tiles. */
export class LetterTiles {
  readonly used: number[] = [];

  constructor(readonly letters: readonly string[]) {}

  available(index: number): boolean {
    return !this.used.includes(index);
  }

  pick(index: number): void {
    if (index >= 0 && index < this.letters.length && this.available(index)) this.used.push(index);
  }

  undo(): void {
    this.used.pop();
  }

  get word(): string {
    return this.used.map((i) => this.letters[i]).join("");
  }
}
