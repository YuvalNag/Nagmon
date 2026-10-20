/**
 * The intro's end: the chosen starter becomes the child's partner and
 * the old owl script's steps are marked done (the same variables, so no
 * old event plays the intro again).
 */
import type { WorldState } from "../world/worldState";
import { addCreature } from "./collection";

export const INTRO_DONE = "nagmon_intro_done";

export function introNeeded(world: WorldState): boolean {
  return world.variables.get(INTRO_DONE) !== "yes";
}

export function finishIntro(world: WorldState, species: string, level: number): void {
  if (world.creatures.length === 0) addCreature(world, species, level);
  world.variables.set("nagmon_starter", species);
  for (const k of ["nagmon_started", "nagmon_intro_seen", "nagmon_has_starter", "nagmon_gifts", INTRO_DONE]) world.variables.set(k, "yes");
}
