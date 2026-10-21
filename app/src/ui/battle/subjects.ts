/** How a subject looks on a move card and in the chips: a picture character and its colour (the subjects table's own colours are for the map's pages). */
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
  geometry: "#5b8cf0",
  science: "#4fb883",
  english: "#e8b923",
  hebrew: "#e56fa3",
  logic: "#9b6cf0",
};

export const subjectIcon = (s: string | null): string => (s && SUBJECT_ICON[s]) || "⭐";
export const subjectColor = (s: string | null): string => (s && SUBJECT_COLOR[s]) || "#8a97a6";

/** The little picture of each of the enemy's intents. */
export const INTENT_ICON: Readonly<Record<string, string>> = { puff: "☁️", giggle: "😄", silly: "🎵" };
