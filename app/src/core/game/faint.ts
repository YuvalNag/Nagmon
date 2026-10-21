/**
 * Fainting (docs/app/BATTLE_V3.md, "Decisions"): a creature whose Pep
 * reaches 0 in a battle fell asleep. It is not lost; it can be used
 * neither in battle nor in the field (swimming and the like, when they
 * exist: ask `usable`) until it is healed, and it is healed only by
 * medicine from the shop or by the nurse at the Rest Center. Gentle words
 * everywhere: "fell asleep", "needs rest".
 */
import type { Creature, WorldState } from "../world/worldState";
import { PARTY_SIZE } from "./collection";
import { countOf, type Economy, take } from "./items";

/** Can this creature be used now, in a battle or in the field? */
export const usable = (c: Creature): boolean => c.fainted !== true;

/** The friends of the party that are awake, in party order. */
export const awakeParty = (world: WorldState): Creature[] => world.creatures.slice(0, PARTY_SIZE).filter(usable);

/** Everyone who needs rest, the Meadow too. */
export const fainted = (world: WorldState): Creature[] => world.creatures.filter((c) => !usable(c));

export function faint(c: Creature): void {
  c.fainted = true;
}

/** The nurse at the Rest Center: heals every friend, free. Returns how many woke. */
export function nurseHeals(world: WorldState): number {
  let n = 0;
  for (const c of world.creatures) {
    if (c.fainted) {
      delete c.fainted;
      n++;
    }
  }
  return n;
}

/** The whole party is asleep: nobody can battle. */
export const partyDown = (world: WorldState): boolean => world.creatures.length > 0 && awakeParty(world).length === 0;

/**
 * Medicine from the shop on one friend. Refused (nothing used up) for an
 * unknown friend or item, one that is not medicine, no medicine in the Bag,
 * or a friend who is awake.
 */
export function useMedicine(world: WorldState, eco: Economy, creatureId: string, itemId: string): boolean {
  const item = eco.items[itemId];
  const c = world.creatures.find((x) => x.id === creatureId);
  if (!item || item.kind !== "medicine" || !c || !c.fainted || countOf(world, itemId) < 1) return false;
  take(world, itemId);
  delete c.fainted;
  return true;
}
