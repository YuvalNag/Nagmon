/** How a subject looks on a move card and in the chips: a picture character and its colour (the subjects table's own colours, light enough for dark text on them). */
export const SUBJECT_ICON: Readonly<Record<string, string>> = {
  math: "🔢",
  geometry: "🔷",
  science: "🍃",
  english: "🅰️",
  hebrew: "א",
  logic: "🧩",
};

export const SUBJECT_COLOR: Readonly<Record<string, string>> = {
  math: "#ff8a5b",
  geometry: "#8fb3ff",
  science: "#6cd4a1",
  english: "#ffd166",
  hebrew: "#f4a6c6",
  logic: "#c39bff",
};

export const subjectIcon = (s: string | null): string => (s && SUBJECT_ICON[s]) || "⭐";
export const subjectColor = (s: string | null): string => (s && SUBJECT_COLOR[s]) || "#8a97a6";

/** The little picture of each of the enemy's intents (placeholder art: soft emoji, until the art pass). */
export const INTENT_ICON: Readonly<Record<string, string>> = {
  fog_puff: "☁️",
  big_puff: "🌫️",
  thicken: "🌥️",
  giggle: "😄",
  drowsy_mist: "🌙",
  dizzy_swirl: "🌀",
  sticky_mud: "🟤",
  cheer_up: "⬆️",
  silly_dance: "🎵",
};

/** A status badge (4.1): a shape that is not colour alone (an emoji of the shape) on a round of the status's colour. */
export const STATUS_GLYPH: Readonly<Record<string, string>> = {
  drowsy: "🌙",
  dizzy: "😵‍💫",
  slow: "🐌",
  shield: "🫧",
  regen: "🌿",
  boost: "⬆️",
  weaken: "⬇️",
  focus: "🎯",
  giggly: "🤭",
  mark: "🔖",
  sniffly: "💧",
  windup: "⭕",
  calm: "😊",
  dozing: "💤",
};

/** The effect glyph of a move card: what the move does besides a plain hit (a tiny picture beside the flames). */
export function moveGlyph(move: { id: string; tier: string; effects: { type: string; status?: string }[] }): string | null {
  if (move.id === "echo") return "🔁";
  const order = ["status", "weaken", "boost", "shield", "heal", "regen", "cleanse", "mirror", "mark", "finisher", "reveal", "focus", "swap_boosts", "ignore_shield"] as const;
  const glyph: Record<string, string> = { weaken: "⬇️", boost: "⬆️", shield: "🫧", heal: "💚", regen: "🌿", cleanse: "🍃", mirror: "🪞", mark: "🔖", finisher: "🔨", reveal: "🔍", focus: "🎯", swap_boosts: "🔀", ignore_shield: "🔓" };
  for (const kind of order) {
    const e = move.effects.find((x) => x.type === kind);
    if (!e) continue;
    return kind === "status" ? (STATUS_GLYPH[e.status ?? ""] ?? null) : (glyph[kind] ?? null);
  }
  return null;
}
