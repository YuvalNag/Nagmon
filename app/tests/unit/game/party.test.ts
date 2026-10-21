import { describe, expect, it } from "vitest";
import { PARTY_SIZE } from "../../../src/core/game/battle";
import { addCreature } from "../../../src/core/game/collection";
import { monsterTable } from "../../../src/core/game/monsters";
import { details, meadowCount, partyOf, powerPaws, setPartner } from "../../../src/core/game/party";
import { bestiaryZones } from "../../../src/core/game/zones";
import { encounterTables } from "../../../src/core/game/encounters";
import { loadTrips } from "../../../src/core/game/trips";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "./helpers";

const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));

function world(n: number) {
  const w = new WorldState();
  for (let i = 0; i < n; i++) addCreature(w, i % 2 ? "lunibble" : "heliobud", 5 + i);
  return w;
}

describe("the party of four", () => {
  it("is the first four creatures; the rest are the Meadow", () => {
    const w = world(6);
    expect(partyOf(w)).toHaveLength(PARTY_SIZE);
    expect(partyOf(w).map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(meadowCount(w)).toBe(2);
    expect(meadowCount(world(2))).toBe(0);
  });

  it("choosing a partner moves that friend to the front and keeps the others in order", () => {
    const w = world(4);
    expect(setPartner(w, "c3")).toBe(true);
    expect(w.creatures.map((c) => c.id)).toEqual(["c3", "c1", "c2", "c4"]);
    expect(setPartner(w, "c3")).toBe(false);
  });

  it("only a friend in the party can be chosen: a Meadow friend or a stranger is refused, nothing moves", () => {
    const w = world(6);
    expect(setPartner(w, "c6")).toBe(false);
    expect(setPartner(w, "ghost")).toBe(false);
    expect(w.creatures.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6"]);
  });
});

describe("what a friend is good at, and its details", () => {
  it("shows level, growth bar, subject, paws and hearts; the child's name when there is one", () => {
    const w = world(2);
    w.creatures[1]!.name = "נוגה";
    w.creatures[1]!.hearts = 3;
    w.creatures[1]!.xp = 2;
    const d = details(w.creatures[1]!, monsters, subjects);
    expect(d.subject).toBe(subjects.subjectFor(monsters["lunibble"]!.types, null, "lunibble"));
    expect(d).toMatchObject({ level: 6, xp: 2, need: 12, hearts: 3, name: "נוגה" });
    expect(details(w.creatures[0]!, monsters, subjects).name).toBeNull();
  });

  it("paws, one to five, grow with the level", () => {
    expect([1, 10, 11, 25, 50].map(powerPaws)).toEqual([1, 1, 2, 3, 5]);
  });
});

describe("the bestiary by zone", () => {
  it("lists each trip zone and each map's table with what was seen and caught", async () => {
    const trips = await loadTrips(async (p) => gameJson(p), async () => true);
    const w = new WorldState();
    w.seen.add("lunibble");
    w.seen.add("terrabub");
    w.caught.add("lunibble");
    const zones = bestiaryZones({ trips, encounters: encounterTables(gameJson("db/encounters.json")), monsters, seen: w.seen, caught: w.caught, titles: { nagmon_route1: "דרך 1" } });
    const moon = zones.find((z) => z.id === "solar/moon")!;
    expect(moon.species).toEqual(expect.arrayContaining(["lunibble", "terrabub"]));
    expect(moon).toMatchObject({ seen: 2, caught: 1 });
    // Route 1 meets only the trip's animals, already listed in their zones: no zone of its own
    expect(zones.find((z) => z.id === "nagmon_route1")).toBeUndefined();
    // every creature with a picture is in exactly one zone
    const all = zones.flatMap((z) => z.species);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(Object.values(monsters).filter((m) => m.hasSprite).map((m) => m.slug).sort());
  });
});
