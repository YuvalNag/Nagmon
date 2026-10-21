import { type Lesson, loadLessons } from "../../core/game/lessons";

/** The lessons of the build (`game/lessons/*.json`); a file that is missing or broken is no lesson. */
export function loadGameLessons(): Promise<Lesson[]> {
  return loadLessons(async (path) => {
    const r = await fetch(`game/${path}`);
    if (!r.ok) throw new Error(`game/${path}: ${r.status}`);
    return r.json();
  });
}
