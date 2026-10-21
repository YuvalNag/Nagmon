/// <reference types="node" />
// @vitest-environment node
/**
 * The solar-system chapter, end to end on the app's real data and the
 * app's real logic, with no browser: the trip file, the six maps' event
 * scripts run by the event interpreter, the wild areas, and the trip
 * engine's rules (unlock by level, costs, zones done, the master test).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TALK_TO } from "../../../src/app/playConfig";
import { countOf, economy } from "../../../src/core/game/items";
import { addCreature } from "../../../src/core/game/collection";
import { Encounters, encounterTables } from "../../../src/core/game/encounters";
import { monsterTable } from "../../../src/core/game/monsters";
import { parseTrip, progressPercent, refreshProgress, travelTo, zoneState, type Trip, type Zone } from "../../../src/core/game/trips";
import { EventRunner, type EventHost, type Found, type QuizWord, type WorldObjects } from "../../../src/core/world/events";
import { inBox, readMap, type TiledMap, type WorldMap } from "../../../src/core/world/mapData";
import { WorldState } from "../../../src/core/world/worldState";
import { loadLessons, type Lesson } from "../../../src/core/game/lessons";
import { TUTOR_NPCS } from "../../../src/ui/tutor/TutorScreen";
import { gameJson } from "./helpers";

const trip: Trip = parseTrip(gameJson("trips/solar.json"))!;
const load = (name: string): WorldMap => readMap(name, JSON.parse(readFileSync(`public/game/maps/${name}.json`, "utf8")) as TiledMap);
const maps: Record<string, WorldMap> = {};
for (const z of trip.zones) maps[z.id] = load(z.map!);
const station = load("solar_station");
const city = load("classic_hearthrock_city");
const he = gameJson<Record<string, string>>("i18n/he.json");
const en = gameJson<Record<string, string>>("i18n/en.json");
const tables = encounterTables(gameJson("db/encounters.json"));
const monsters = monsterTable(gameJson("db/monsters.json"));

/** What a mission pays (tools/app/solar_texts.py MISSION_COINS) and the everyday answer's coins. */
const MISSION_COINS: Record<string, number> = { moon: 10, sun: 12, rocky_planets: 15, giants: 18, outer: 25 };
const QUIZ_COINS = 3;
/** Who the child talks to, in order, to finish each zone's mission. */
const MISSION_TALKS: Record<string, string[]> = {
  moon: ["moon_engineer"],
  sun: ["owl", "grey_hood", "owl"],
  rocky_planets: ["rover_driver"],
  giants: ["sage"],
  outer: ["grey_hood"],
};

interface Play {
  runner: EventRunner;
  said: string[];
  topics: string[];
  tutors: string[];
  found: Found[];
}

/** The map's events run for the child, who answers every question as `word` says. */
async function visit(map: WorldMap, world: WorldState, word: () => QuizWord, day: () => string = () => "2026-10-20"): Promise<Play> {
  const said: string[] = [];
  const topics: string[] = [];
  const tutors: string[] = [];
  const found: Found[] = [];
  const host: EventHost = {
    say: async (msgid) => void said.push(msgid),
    quiz: async (topic, _context, answered) => {
      topics.push(topic);
      answered(word());
    },
    changed: () => {},
    openTutor: async (institute) => void tutors.push(institute),
    found: async (f) => void found.push(f),
  };
  const runner = new EventRunner(map.events, world, host, { grade: 3, today: day, talkTo: TALK_TO, objects: OBJECTS });
  await runner.start();
  return { runner, said, topics, tutors, found };
}

const OBJECTS: WorldObjects = { economy: economy(gameJson("economy.json")), loot: { daily_gift: [], chests: {} } as unknown as WorldObjects["loot"], facts: {}, pools: () => [], zone: "solar_moon" };
/** The one item a mission gives on its first completion, by zone (tools/app/solar_texts.py MISSION_ITEMS). */
const MISSION_ITEMS: Record<string, string> = { moon: "magic_net", sun: "hint_feather", rocky_planets: "silver_net", giants: "growth_tonic", outer: "clover" };

const slug = (n: string) => `nagmon_solar_${n}`;
const worldAt = (level: number): WorldState => {
  const w = new WorldState();
  addCreature(w, "lunibble", level);
  return w;
};

describe("the six maps' people", () => {
  it("every event runs in the interpreter, and every person is there to talk to", async () => {
    for (const [name, map, npcs] of [...trip.zones.map((z) => [z.id, maps[z.id]!, ZONE_NPCS[z.id]!] as const), ["station", station, ["astronomer", "mila"]] as const]) {
      const w = new WorldState();
      const p = await visit(map, w, () => "correct");
      // the exits and the wild area are the map's own (mapData), not the interpreter's
      expect(p.runner.waiting().filter((e) => !e.startsWith("Go to") && e !== "Wild Animals"), name).toEqual([]);
      for (const n of npcs) expect(p.runner.talkable(slug(n)), `${name}/${n}`).toBe(true);
    }
  });

  it("each person says only texts that exist in both languages, and asks a science question", async () => {
    for (const z of trip.zones) {
      for (const n of ZONE_NPCS[z.id]!) {
        const w = new WorldState();
        const p = await visit(maps[z.id]!, w, () => "correct");
        expect(await p.runner.talk(slug(n))).toBe(true);
        expect(p.said.length).toBeGreaterThan(1);
        for (const m of p.said) {
          expect(he[m], m).toBeTruthy();
          expect(en[m], m).toBeTruthy();
        }
        expect(p.topics.length).toBeGreaterThanOrEqual(1);
        expect(new Set(p.topics)).toEqual(new Set(["science"]));
      }
    }
  });

  it("an everyday answer pays 3 coins up to three times a day, then is free, a wrong one pays nothing", async () => {
    const w = new WorldState();
    const p = await visit(maps["moon"]!, w, () => "correct");
    for (let i = 0; i < 3; i++) await p.runner.talk(slug("owl"));
    expect(w.money).toBe(3 * QUIZ_COINS);
    await p.runner.talk(slug("owl"));
    expect(w.money).toBe(3 * QUIZ_COINS);
    expect(p.said.at(-1)).toBe("nagmon_solar_quiz_free");
    const w2 = new WorldState();
    const p2 = await visit(maps["moon"]!, w2, () => "wrong");
    await p2.runner.talk(slug("owl"));
    expect(w2.money).toBe(0);
    expect(p2.said.at(-1)).toBe("nagmon_solar_quiz_wrong");
  });

  it("the astronomer explains the chapter and the test, and says when all five zones are done", async () => {
    const w = new WorldState();
    const before = await visit(station, w, () => "correct");
    await before.runner.talk(slug("astronomer"));
    expect(before.said).toContain("nagmon_solar_station_astronomer_how");
    expect(before.said).not.toContain("nagmon_solar_station_astronomer_ready");
    for (const z of trip.zones) w.variables.set(z.doneVariable!, "yes");
    const after = await visit(station, w, () => "correct");
    await after.runner.talk(slug("astronomer"));
    expect(after.said).toContain("nagmon_solar_station_astronomer_ready");
  });
});

describe("the astronomer's lessons", () => {
  it("talking to her opens the station's lessons, and she is a tutor on the map", async () => {
    const p = await visit(station, new WorldState(), () => "correct");
    await p.runner.talk(slug("astronomer"));
    expect(p.tutors).toEqual(["station"]);
    expect(TUTOR_NPCS).toContain(slug("astronomer"));
  });

  it("the station has lessons of four cards and a practice question", async () => {
    const lessons: Lesson[] = await loadLessons(async (p) => gameJson(p));
    const mine = lessons.filter((l) => l.institute === "station");
    expect(mine.length).toBeGreaterThan(0);
    for (const l of mine) {
      expect(l.cards).toHaveLength(4);
      expect(l.practice).not.toBeNull();
    }
  });
});

const ZONE_NPCS: Record<string, string[]> = {
  moon: ["moon_engineer", "owl"],
  sun: ["owl", "grey_hood"],
  rocky_planets: ["rover_driver", "sage", "owl"],
  giants: ["sage", "moon_engineer", "owl"],
  outer: ["grey_hood", "rover_driver", "owl"],
};

describe("each zone's mission", () => {
  it("is not finished by a wrong answer, and a right one pays and sets the zone's variable", async () => {
    for (const z of trip.zones) {
      const w = new WorldState();
      const wrong = await visit(maps[z.id]!, w, () => "wrong");
      for (const n of MISSION_TALKS[z.id]!) await wrong.runner.talk(slug(n));
      expect(w.variables.get(z.doneVariable!), z.id).toBeUndefined();
      expect(w.money, z.id).toBe(0);
      const right = await visit(maps[z.id]!, w, () => "correct");
      for (const n of MISSION_TALKS[z.id]!) await right.runner.talk(slug(n));
      expect(w.variables.get(z.doneVariable!), z.id).toBe("yes");
      // the mission's coins, and no more than the everyday answers beside it
      expect(w.money, z.id).toBeGreaterThanOrEqual(MISSION_COINS[z.id]!);
      expect(w.money, z.id).toBeLessThanOrEqual(MISSION_COINS[z.id]! + 3 * QUIZ_COINS);
      // it is paid once: asking again only pays the everyday answers
      const money = w.money;
      const again = await visit(maps[z.id]!, w, () => "correct");
      await again.runner.talk(slug(MISSION_TALKS[z.id]![0]!));
      expect(w.money - money).toBeLessThanOrEqual(QUIZ_COINS);
    }
  });

  it("gives one useful item with the coins on the first completion only, shown as found", async () => {
    for (const z of trip.zones) {
      const w = new WorldState();
      const item = MISSION_ITEMS[z.id]!;
      expect(OBJECTS.economy.items[item], z.id).toBeDefined();
      const wrong = await visit(maps[z.id]!, w, () => "wrong");
      for (const n of MISSION_TALKS[z.id]!) await wrong.runner.talk(slug(n));
      expect(countOf(w, item), z.id).toBe(0);
      const right = await visit(maps[z.id]!, w, () => "correct");
      for (const n of MISSION_TALKS[z.id]!) await right.runner.talk(slug(n));
      expect(countOf(w, item), z.id).toBe(1);
      expect(right.found.filter((f) => f.how === "item").map((f) => f.prize.item), z.id).toEqual([item]);
      const again = await visit(maps[z.id]!, w, () => "correct");
      for (const n of MISSION_TALKS[z.id]!) await again.runner.talk(slug(n));
      expect(countOf(w, item), z.id).toBe(1);
    }
    expect(new Set(Object.values(MISSION_ITEMS)).size).toBe(5);
  });

  it("the sun's filter must be fetched: the owl alone cannot finish it", async () => {
    const w = new WorldState();
    const p = await visit(maps["sun"]!, w, () => "correct");
    await p.runner.talk(slug("owl"));
    await p.runner.talk(slug("owl"));
    expect(w.variables.get("solar_sun_done")).toBeUndefined();
    expect(w.variables.get("solar_sun_mission")).toBe("asked");
    await p.runner.talk(slug("grey_hood"));
    expect(w.variables.get("solar_sun_mission")).toBe("found");
    await p.runner.talk(slug("owl"));
    expect(w.variables.get("solar_sun_done")).toBe("yes");
  });

  it("the drive of three stops is done with two right answers, not with fewer", async () => {
    const answers = (...w: QuizWord[]) => () => w.shift() ?? "wrong";
    for (const [w3, done] of [
      [["correct", "correct", "wrong"], true],
      [["wrong", "correct", "correct"], true],
      [["correct", "correct", "correct"], true],
      [["correct", "wrong", "wrong"], false],
      [["wrong", "wrong", "wrong"], false],
    ] as [QuizWord[], boolean][]) {
      const w = new WorldState();
      const p = await visit(maps["rocky_planets"]!, w, answers(...w3));
      await p.runner.talk(slug("rover_driver"));
      expect(w.variables.get("solar_rocky_planets_done") === "yes", w3.join()).toBe(done);
    }
  });
});

describe("the chapter, from the first zone to the badge", () => {
  it("unlocks by level and earlier zones, charges the costs, completes zones, opens the test, gives the badge", async () => {
    const day = { n: 20 };
    const today = () => `2026-10-${day.n}`;
    const w = worldAt(1);
    let wantMoney = 0;
    const levelFor = (z: Zone) => Math.max(1, z.unlockLevel);

    // every zone past the first is locked at level 1, with the reason
    for (const z of trip.zones.slice(1)) {
      const s = zoneState(trip, z, w);
      expect(s.state).toBe("locked");
    }

    for (const [i, z] of trip.zones.entries()) {
      // below its level: locked (by level only if the earlier zones are done)
      if (z.unlockLevel > 1) {
        w.creatures[0]!.level = z.unlockLevel - 1;
        const s = zoneState(trip, z, w);
        expect(s, z.id).toMatchObject({ state: "locked", needLevel: z.unlockLevel });
      }
      w.creatures[0]!.level = levelFor(z);
      expect(zoneState(trip, z, w), z.id).toEqual({ state: "open" });
      // the vehicle takes coins, and nothing when there are too few
      if (z.cost > w.money) {
        const before = w.money;
        expect(travelTo(w, trip, z), z.id).toEqual({ ok: false, reason: "coins", missing: z.cost - before });
        expect(w.money).toBe(before);
        // everyday answers in the zone just left (a few days) earn the rest
        const left = maps[trip.zones[i - 1]!.id]!;
        while (w.money < z.cost) {
          const p = await visit(left, w, () => "correct", today);
          for (const n of ZONE_NPCS[trip.zones[i - 1]!.id]!) for (let k = 0; k < 3; k++) await p.runner.talk(slug(n));
          day.n++;
        }
      }
      const before = w.money;
      expect(travelTo(w, trip, z)).toEqual({ ok: true, paid: z.cost });
      expect(w.money).toBe(before - z.cost);
      expect(w.trips.at).toBe(`solar/${z.id}`);
      wantMoney = w.money;

      // the zone's map: its start tile is free, the mission is done there
      expect(maps[z.id]!.collision.cell(z.start!.x, z.start!.y)).toBe(".");
      expect(refreshProgress(w, [trip]).zonesDone).toEqual([]);
      const p = await visit(maps[z.id]!, w, () => "correct", today);
      for (const n of MISSION_TALKS[z.id]!) await p.runner.talk(slug(n));
      expect(w.money).toBeGreaterThan(wantMoney);
      // the mission alone is not the zone: the catches come with it
      expect(refreshProgress(w, [trip]).zonesDone, z.id).toEqual([]);
      for (const m of z.monsters.slice(0, z.catchNeeded)) w.caught.add(m);
      const r = refreshProgress(w, [trip]);
      expect(r.zonesDone, z.id).toEqual([`solar/${z.id}`]);
      expect(zoneState(trip, z, w)).toEqual({ state: "done" });
      // the test is ready only after the last zone
      expect(r.masterReady, z.id).toEqual(i === trip.zones.length - 1 ? ["solar"] : []);
    }

    // the master test: the child wins it, the badge is kept, the test is no longer news
    expect(trip.master).toMatchObject({ badge: "astronomer", level: 18 });
    expect(monsters[trip.master.monster!]).toBeTruthy();
    expect(progressPercent(w, trip)).toBeLessThan(100);
    w.trips.badges.push(`solar/${trip.master.badge}`);
    expect(refreshProgress(w, [trip]).masterReady).toEqual([]);
    expect(progressPercent(w, trip)).toBeGreaterThan(0);
  });

  it("zones need the one before: a high level alone opens nothing past the moon", () => {
    const w = worldAt(14);
    expect(zoneState(trip, trip.zones[0]!, w)).toEqual({ state: "open" });
    for (const z of trip.zones.slice(1)) expect(zoneState(trip, z, w)).toMatchObject({ state: "locked", needLevel: 0 });
  });

  it("a zone needs its mission AND its catches: neither alone completes it", () => {
    const w = worldAt(1);
    const moon = trip.zones[0]!;
    for (const m of moon.monsters.slice(0, moon.catchNeeded)) w.caught.add(m);
    expect(refreshProgress(w, [trip]).zonesDone).toEqual([]);
    w.variables.set(moon.doneVariable!, "yes");
    expect(refreshProgress(w, [trip]).zonesDone).toEqual(["solar/moon"]);
    const m2 = worldAt(1);
    m2.variables.set(moon.doneVariable!, "yes");
    for (const m of moon.monsters.slice(0, moon.catchNeeded - 1)) m2.caught.add(m);
    expect(refreshProgress(m2, [trip]).zonesDone).toEqual([]);
  });

  it("the costs, levels and done variables are in the trip file the app loads", () => {
    expect(trip.zones.map((z) => [z.cost, z.unlockLevel])).toEqual([
      [0, 0],
      [10, 3],
      [15, 5],
      [20, 8],
      [30, 11],
    ]);
    expect(trip.zones.map((z) => z.doneVariable)).toEqual(trip.zones.map((z) => `solar_${z.id}_done`));
    expect(trip.zones.every((z) => z.catchNeeded === 3 && z.ready === true)).toBe(true);
  });
});

describe("the ways between the maps", () => {
  it("each zone's exit leads to the station, each station door to a zone's start, on free tiles", () => {
    for (const z of trip.zones) {
      const ex = maps[z.id]!.teleports;
      expect(ex).toHaveLength(1);
      expect(ex[0]!.to.map).toBe("solar_station");
      expect(station.collision.cell(ex[0]!.to.x, ex[0]!.to.y)).toBe(".");
      const door = station.teleports.find((t) => t.to.map === z.map);
      expect(door?.to, z.id).toMatchObject({ x: z.start!.x, y: z.start!.y });
    }
  });

  it("the station's own door lands in Hearthrock, in front of the lab's door, on a free tile", () => {
    const home = station.teleports.filter((t) => t.to.map === "classic_hearthrock_city");
    expect(home).toHaveLength(1);
    const { x, y, facing } = home[0]!.to;
    expect(city.collision.cell(x, y)).toBe(".");
    const lab = city.teleports.find((t) => t.to.map === "nagmon_lab")!;
    expect([lab.box.x, lab.box.y + 1]).toEqual([x, y]);
    expect(facing).toBe("down");
    // the door of the station is a free tile the child can reach
    expect(station.collision.cell(home[0]!.box.x, home[0]!.box.y)).toBe(".");
  });
});

describe("the wild areas", () => {
  it("each zone's area starts a meeting from its own table, with the zone's animals only", () => {
    for (const z of trip.zones) {
      const map = maps[z.id]!;
      expect(map.encounters).toHaveLength(1);
      const area = map.encounters[0]!;
      expect(area.table).toBe(`solar_${z.id}`);
      expect(tables[area.table]?.length).toBeGreaterThan(0);
      const e = new Encounters({ tables, monsters, always: true, random: Math.random, daytime: () => true });
      const seen = new Set<string>();
      for (let i = 0; i < 80; i++) {
        const wild = e.step(map, area.box.x, area.box.y, 5);
        expect(wild, z.id).not.toBeNull();
        expect(wild!.table).toBe(area.table);
        seen.add(wild!.species);
      }
      expect([...seen].every((s) => z.monsters.includes(s))).toBe(true);
      expect(seen.size).toBeGreaterThan(1);
      // and a step off the area meets nothing
      expect(e.step(map, z.start!.x, z.start!.y, 5)).toBeNull();
      expect(inBox(area.box, z.start!.x, z.start!.y)).toBe(false);
      expect(map.collision.cell(area.box.x, area.box.y)).toBe(".");
    }
  });

  it("the station has no wild area", () => {
    expect(station.encounters).toEqual([]);
  });
});
