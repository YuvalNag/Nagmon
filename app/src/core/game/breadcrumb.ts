/**
 * Where the child was last, for a parent's "something is wrong" report:
 * the last game screen (not the parents' area itself) and the hero's
 * place. Kept in memory only; the report writes it into the log.
 */
/** The question on the screen, as a "something is wrong" report holds it: ids, numbers and the shown words. */
export interface QuestionNote {
  item: string;
  skill: string;
  /** The item's difficulty. */
  level: number;
  kind: string;
  choices: { id: string; text: string }[];
  /** The kind of picture the question draws, if any. */
  figure: string | null;
}

/** The part of a Question the note reads (a test needs no whole one). */
export interface NotedQuestion {
  item_id: string;
  skill_id: string;
  difficulty: number;
  kind: string;
  choices: readonly { id: string; text_he: string }[];
  figure: { kind: string } | null;
}

const MAX_CHOICE_TEXT = 40;

export class Crumb {
  private last = "none";
  private asked: QuestionNote | null = null;
  private species: string | null = null;
  private mapName: string | null = null;
  private at: { x: number; y: number } | null = null;

  /** A screen came up. The parents' area does not replace the screen the child was on. */
  screen(name: string): void {
    if (name === "parents") return;
    this.last = name;
  }

  position(map: string, x: number, y: number): void {
    this.mapName = map;
    this.at = { x, y };
  }

  /** A question was made (the latest is the one on the screen, if any is). */
  question(q: NotedQuestion | null): void {
    this.asked = q && {
      item: q.item_id,
      skill: q.skill_id,
      level: q.difficulty,
      kind: q.kind,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text_he.slice(0, MAX_CHOICE_TEXT) })),
      figure: q.figure?.kind ?? null,
    };
  }

  /** The wild creature of the battle on the screen, or null outside a battle. */
  battle(species: string | null): void {
    this.species = species;
  }

  questionNote(): QuestionNote | null {
    return this.asked;
  }

  battleSpecies(): string | null {
    return this.species;
  }

  snapshot(): { screen: string; map: string; x: string; y: string } {
    return {
      screen: this.last,
      map: this.mapName ?? "none",
      x: this.at ? String(this.at.x) : "?",
      y: this.at ? String(this.at.y) : "?",
    };
  }
}

/** The one the app uses. */
export const crumb = new Crumb();
