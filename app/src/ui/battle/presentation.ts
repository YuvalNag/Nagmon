/**
 * How a question is drawn in the battle (docs/app/BATTLE.md, 4.5): the
 * same questions the engine already asks, in a few kinds of look. The
 * engine stays the judge; this only picks the look.
 *
 * - cards: up to four answers floating around the wild creature (P1)
 * - pictures: the same, as big picture tiles, when every answer has one
 * - thumbs: true or false as two big thumbs (P4)
 * - list: five or six answers in a calm, still list at the side
 * - pad: the number pad (P6)
 * - order: tap the cards in order (P8)
 * - letters: spell the word from letter tiles (P10)
 */
export type Presentation = "cards" | "pictures" | "thumbs" | "list" | "pad" | "order" | "letters";

/** Answers that float around the creature, at most. */
export const MAX_FLOATING = 4;
/** Answers shown at most (a calm list from five). */
export const MAX_SHOWN = 6;

interface Shape {
  input: "pad" | "choice" | "order" | "letters";
  kind: string;
  /** The answers that will be shown. */
  choices: readonly { image?: string | null }[];
}

export function presentationOf(q: Shape): Presentation {
  if (q.input === "pad") return "pad";
  if (q.input === "order") return "order";
  if (q.input === "letters") return "letters";
  if (q.kind === "true_false" && q.choices.length === 2) return "thumbs";
  if (q.choices.length > MAX_FLOATING) return "list";
  if (q.choices.length >= 2 && q.choices.every((c) => !!c.image)) return "pictures";
  return "cards";
}

/** The presentations that take the bottom end (as the pad does): the wild creature stands nearer the middle. */
export function usesSide(p: Presentation): boolean {
  return p === "pad" || p === "order" || p === "letters" || p === "list";
}
