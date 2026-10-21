import { describe, expect, it } from "vitest";
import { addCreature } from "../../../src/core/game/collection";
import {
  ASTRONOMER_BADGE,
  availableZones,
  bestLevel,
  loadTrips,
  parseTrip,
  progressPercent,
  travelTo,
  refreshProgress,
  tripFor,
  zoneState,
} from "../../../src/core/game/trips";
import { WorldState } from "../../../src/core/world/worldState";

/** What mods/nagmon/trips/solar.yaml becomes as JSON: five zones, a master, a badge. */
const solar = {
  id: "solar",
  title_he: "מערכת השמש",
  subject: "science",
  vehicle: { name_he: "המעבורת של מילה" },
  master: { monster: "jovigale", level: 14, badge: "astronomer", badge_title_he: "מבחן האסטרונומית" },
  zones: [
    { id: "moon", title_he: "הירח", map: "space_moon", start: { x: 4, y: 9 }, unlock_level: 0, cost: 10, monsters: ["a", "b", "c", "d"] },
    { id: "sun", title_he: "ליד השמש", map: "space_sun", start: { x: 3, y: 3 }, unlock_level: 6, cost: 15, monsters: ["e", "f"], requires: ["moon"] },
    { id: "rocky_planets", title_he: "כוכבי הלכת הסלעיים", map: "space_rocky", unlock_level: 8, cost: 20, monsters: ["g"] },
    { id: "giants", title_he: "הענקים", map: "space_giants", unlock_level: 10, cost: 25, monsters: ["h"], done_variable: "giants_done" },
    { id: "outer", title_he: "הרחוק", map: "space_outer", unlock_level: 12, cost: 30, monsters: ["i"] },
  ],
};

const trip = parseTrip(solar)!;

describe("reading a trip", () => {
  it("takes the zones in order, with the fields the game needs", () => {
    expect(trip.id).toBe("solar");
    expect(trip.subject).toBe("science");
    expect(trip.zones.map((z) => z.id)).toEqual(["moon", "sun", "rocky_planets", "giants", "outer"]);
    expect(trip.zones[0]).toMatchObject({ map: "space_moon", start: { x: 4, y: 9 }, unlockLevel: 0, cost: 10, catchNeeded: 2 });
    expect(trip.master).toMatchObject({ monster: "jovigale", level: 14, badge: "astronomer" });
  });

  it("is tolerant: other names for the same things, missing fields, unknown ones", () => {
    const t = parseTrip({ id: "x", title: "טיול", zones: [{ name_he: "אזור", map: "m", level: 3, price: 7, extra: 1 }, { id: "z2" }], nonsense: true })!;
    expect(t.subject).toBe("science");
    expect(t.zones[0]).toMatchObject({ id: "zone1", title: "אזור", unlockLevel: 3, cost: 7 });
    expect(t.zones[1]).toMatchObject({ id: "z2", map: null, cost: 10 });
    expect(t.master.badge).toBe(ASTRONOMER_BADGE);
  });

  it("anything that is not a trip with zones is no trip, never a crash", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, { id: "x" }, { id: "x", zones: [] }, { id: "x", zones: "no" }]) expect(parseTrip(bad)).toBeNull();
  });

  it("a missing file is no trip: the game goes on without them", async () => {
    const got = await loadTrips(async () => {
      throw new Error("404");
    }, async () => true);
    expect(got).toEqual([]);
  });

  it("a zone whose map is not in the build is shown as coming soon, never entered", async () => {
    const got = await loadTrips(async () => solar, async (map) => map === "space_moon");
    expect(got).toHaveLength(1);
    expect(got[0]!.zones.map((z) => z.ready)).toEqual([true, false, false, false, false]);
    expect(availableZones(got[0]!).map((z) => z.id)).toEqual(["moon"]);
  });

  it("finds a trip by its zone's map", () => {
    expect(tripFor([trip], "space_sun")?.zone.id).toBe("sun");
    expect(tripFor([trip], "classic_route_1")).toBeNull();
  });
});

function worldWith(level: number): WorldState {
  const w = new WorldState();
  addCreature(w, "heliobud", level);
  return w;
}

describe("zones open by level", () => {
  it("the best creature's level counts, not the partner's alone", () => {
    const w = worldWith(4);
    addCreature(w, "lunibble", 9);
    expect(bestLevel(w)).toBe(9);
    expect(bestLevel(new WorldState())).toBe(0);
  });

  it("is locked below the level and open at it, with a reason", () => {
    const [moon, sun] = trip.zones;
    expect(zoneState(trip, moon!, worldWith(1))).toEqual({ state: "open" });
    expect(zoneState(trip, sun!, worldWith(5))).toEqual({ state: "locked", needLevel: 6, needZones: ["moon"] });
    expect(zoneState(trip, trip.zones[2]!, worldWith(5))).toEqual({ state: "locked", needLevel: 8, needZones: [] });
  });

  it("a zone that needs another is locked until that one is done", () => {
    const sun = trip.zones[1]!;
    expect(zoneState(trip, sun, worldWith(7))).toMatchObject({ state: "locked", needZones: ["moon"] });
    const w = worldWith(7);
    w.trips.done.push("solar/moon");
    expect(zoneState(trip, sun, w)).toEqual({ state: "open" });
  });

  it("a done zone stays done at any level", () => {
    const w = worldWith(1);
    w.trips.done.push("solar/sun");
    expect(zoneState(trip, trip.zones[1]!, w)).toEqual({ state: "done" });
  });
});

describe("progress", () => {
  it("a zone is done when enough of its creatures are caught", () => {
    const w = worldWith(5);
    expect(refreshProgress(w, [trip]).zonesDone).toEqual([]);
    w.caught.add("a");
    expect(refreshProgress(w, [trip]).zonesDone).toEqual([]);
    w.caught.add("b");
    expect(refreshProgress(w, [trip]).zonesDone).toEqual(["solar/moon"]);
    expect(w.trips.done).toEqual(["solar/moon"]);
    // said once
    expect(refreshProgress(w, [trip]).zonesDone).toEqual([]);
  });

  it("or when the zone's own script says so (a variable)", () => {
    const w = worldWith(5);
    w.variables.set("giants_done", "yes");
    expect(refreshProgress(w, [trip]).zonesDone).toEqual(["solar/giants"]);
  });

  it("the badge waits for the master: all zones done makes the test ready, the win gives the badge", () => {
    const w = worldWith(15);
    for (const z of trip.zones) w.trips.done.push(`solar/${z.id}`);
    const r = refreshProgress(w, [trip]);
    expect(r.masterReady).toEqual(["solar"]);
    expect(w.trips.badges).toEqual([]);
    w.trips.badges.push(`solar/${ASTRONOMER_BADGE}`);
    expect(refreshProgress(w, [trip]).masterReady).toEqual([]);
  });

  it("percent: zones, creatures and the badge, as one number", () => {
    const w = worldWith(5);
    expect(progressPercent(w, trip)).toBe(0);
    w.caught.add("a");
    w.trips.done.push("solar/moon");
    // 1 zone + 1 creature of 5 zones + 9 creatures + 1 badge
    expect(progressPercent(w, trip)).toBe(Math.round((100 * 2) / 15));
    for (const z of trip.zones) w.trips.done.push(`solar/${z.id}`);
    for (const s of "abcdefghi") w.caught.add(s);
    w.trips.badges.push(`solar/${ASTRONOMER_BADGE}`);
    expect(progressPercent(w, trip)).toBe(100);
  });
});

describe("travel in Mila's vehicle", () => {
  const ready = parseTrip({ ...solar, zones: solar.zones.map((z) => ({ ...z })) })!;

  it("costs the zone's coins, which are taken once the way is open", () => {
    const w = worldWith(5);
    w.money = 25;
    const r = travelTo(w, ready, ready.zones[0]!);
    expect(r).toEqual({ ok: true, paid: 10 });
    expect(w.money).toBe(15);
    expect(w.trips.visited).toEqual(["solar/moon"]);
    expect(w.trips.at).toBe("solar/moon");
  });

  it("with too few coins nothing is taken, and the child is told how many are missing", () => {
    const w = worldWith(5);
    w.money = 4;
    expect(travelTo(w, ready, ready.zones[0]!)).toEqual({ ok: false, reason: "coins", missing: 6 });
    expect(w.money).toBe(4);
    expect(w.trips.visited).toEqual([]);
  });

  it("a locked zone is not entered, whatever the coins", () => {
    const w = worldWith(1);
    w.money = 500;
    expect(travelTo(w, ready, ready.zones[2]!)).toMatchObject({ ok: false, reason: "locked" });
    expect(w.money).toBe(500);
  });

  it("a zone whose map is not built is 'soon', whatever the coins", () => {
    const w = worldWith(20);
    w.money = 500;
    const z = { ...ready.zones[0]!, ready: false };
    expect(travelTo(w, ready, z)).toEqual({ ok: false, reason: "soon" });
  });

  it("a zone done is visited again for the same coins", () => {
    const w = worldWith(5);
    w.money = 30;
    w.trips.done.push("solar/moon");
    expect(travelTo(w, ready, ready.zones[0]!)).toEqual({ ok: true, paid: 10 });
    expect(travelTo(w, ready, ready.zones[0]!)).toEqual({ ok: true, paid: 10 });
    expect(w.money).toBe(10);
  });

  it("coins never go below zero", () => {
    const w = worldWith(5);
    w.money = 10;
    travelTo(w, ready, ready.zones[0]!);
    expect(w.money).toBe(0);
  });
});
