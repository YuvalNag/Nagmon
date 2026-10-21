/**
 * The Rest Center's party desk (docs/app/FEATURES.md 4.4 and 4.7): the
 * party is the first four friends and the rest wait in the Meadow; at the
 * desk the child swaps one of each. Nobody is lost and nothing changes
 * but the order.
 */
import type { Creature, WorldState } from "../world/worldState";
import { PARTY_SIZE } from "./collection";

/** The friends in the Meadow: everyone after the party. */
export const meadow = (world: WorldState): Creature[] => world.creatures.slice(PARTY_SIZE);

/**
 * Swaps a friend of the party with one of the Meadow (in either order of
 * the two ids). False, and nothing changed, for two of the same group or
 * an unknown friend. The partner is the first of the party: swapping it
 * out makes the Meadow's friend the partner.
 */
export function swapWithMeadow(world: WorldState, a: string, b: string): boolean {
  const i = world.creatures.findIndex((c) => c.id === a);
  const j = world.creatures.findIndex((c) => c.id === b);
  if (i < 0 || j < 0 || i === j) return false;
  const inParty = (k: number) => k < PARTY_SIZE;
  if (inParty(i) === inParty(j)) return false;
  const tmp = world.creatures[i]!;
  world.creatures[i] = world.creatures[j]!;
  world.creatures[j] = tmp;
  return true;
}
