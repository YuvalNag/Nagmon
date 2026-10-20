/**
 * Where the child was last, for a parent's "something is wrong" report:
 * the last game screen (not the parents' area itself) and the hero's
 * place. Kept in memory only; the report writes it into the log.
 */
export class Crumb {
  private last = "none";
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
