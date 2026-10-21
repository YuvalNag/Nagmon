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

/** The little picture of each of the enemy's intents. */
export const INTENT_ICON: Readonly<Record<string, string>> = { puff: "☁️", giggle: "😄", silly: "🎵" };
