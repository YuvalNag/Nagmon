/**
 * Why the map is paused. It runs only when nothing holds it: the pause
 * menu and the app in the background each hold it on their own, so
 * coming back from the background never starts the game under an open
 * menu, and closing the menu never starts it in the background.
 */
export type PauseReason = "menu" | "background" | "lifecycle";

export class PauseReasons {
  private held = new Set<PauseReason>();

  /** Holds the map for `why`; true if this pauses a running map. */
  pause(why: PauseReason): boolean {
    const was = this.held.size > 0;
    this.held.add(why);
    return !was;
  }

  /** Lets go of `why`; true if the map runs again now. */
  resume(why: PauseReason): boolean {
    if (!this.held.delete(why)) return false;
    return this.held.size === 0;
  }

  get paused(): boolean {
    return this.held.size > 0;
  }

  reasons(): PauseReason[] {
    return [...this.held];
  }
}
