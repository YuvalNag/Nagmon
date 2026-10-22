/// <reference types="node" />
// @vitest-environment node
/**
 * The people of the world on the app's real data (game/npcs.json and the
 * maps), with the real resolver and Director and no browser: who is where,
 * who can be talked to, and that the shipped lines do what WORLD_V2.md 4.3
 * and 10.1 ask of them.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { economy as readEconomy } from "../../../src/core/game/items";
import { Director } from "../../../src/core/world/director";
import { EventRunner, type EventHost, type People } from "../../../src/core/world/events";
import { type NpcDef, type NpcTable, npcTable, PHASES, type Phase } from "../../../src/core/world/npcs";
import { readMap, type TiledMap, type WorldMap } from "../../../src/core/world/mapData";
import { emptyRecord, type NpcRecord } from "../../../src/core/world/memory";
import { addDays } from "../../../src/core/world/rand";
import { resolve, whereIs } from "../../../src/core/world/resolver";
import { WorldState } from "../../../src/core/world/worldState";

const GAME = "public/game/";
const json = <T>(rel: string): T => JSON.parse(readFileSync(GAME + rel, "utf8")) as T;
const table: NpcTable = npcTable(json("npcs.json"));
const dbNpcs = json<Record<string, { sprites?: { map: string } }>>("db/npcs.json");
const he = json<Record<string, string>>("i18n/he.json");
const mapNames = ["classic_hearthrock_city", "classic_route_1", "nagmon_home", "nagmon_lab", "nagmon_friend_house", "nagmon_rest_center", "nagmon_shop", "classic_gym_granite", "classic_gym_mila"];
const maps: Record<string, WorldMap> = Object.fromEntries(mapNames.map((n) => [n, readMap(n, json<TiledMap>(`maps/${n}.json`))]));
const placed = Object.entries(maps).filter(([, m]) => m.placement);
const people = Object.values(table);
const TOP8 = ["nagmon_owl", "nagmon_cashier", "nagmon_house_nurse", "nagmon_house_tutor", "nagmon_granny", "nagmon_gardener", "nagmon_route1_trainer", "nagmon_tourist"];

const DAY0 = "2026-10-19";
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(DAY0, i));
const flags = (f: string) => f === "nagmon_intro_done" || f === "nagmon_started";

describe("the cast is data", () => {
  it("has the 26 people of Hearthrock and Route 1 and the 7 of the solar chapter", () => {
    expect(people.filter((p) => !p.id.startsWith("nagmon_solar_"))).toHaveLength(26);
    expect(people.filter((p) => p.id.startsWith("nagmon_solar_"))).toHaveLength(7);
  });

  it("every person has a name text, a picture that is shipped and a record in the database", () => {
    for (const p of people) {
      expect(he[p.id], `${p.id}: name msgid`).toBeTruthy();
      const art = dbNpcs[p.id]?.sprites?.map;
      expect(art, `${p.id}: art`).toBeTruthy();
      expect(existsSync(GAME + art!), `${p.id}: ${art}`).toBe(true);
    }
  });

  it("every person any map creates or places has a definition (or is a prop) and art", () => {
    const props = new Set(["classic_gym_leader_granite", "classic_gym_leader_mila", "nagmon_wallet", "nagmon_kitten", "nagmon_sign_route1", "nagmon_house_pet", "nagmon_house_shopkeeper", "nagmon_chest_home", "nagmon_nest_home"]);
    for (const [name, m] of Object.entries(maps)) {
      const created = [...m.events.flatMap((e) => e.actions).filter((a) => a.type === "create_npc").map((a) => a.args[0]!)];
      for (const slug of created) {
        expect(dbNpcs[slug]?.sprites?.map, `${name}: ${slug} has art`).toBeTruthy();
        expect(slug in table || props.has(slug), `${name}: ${slug} is a person or a known prop`).toBe(true);
      }
    }
    // and the people the resolver can put on a map are on a map that has the spot
    for (const p of people) {
      const s = p.schedule;
      const wheres = [s.default, ...s.rules.map((r) => r.at), s.roam ? { map: s.roam.map, spots: s.roam.spots } : null].filter((w) => w !== null);
      for (const w of wheres) {
        const m = maps[w!.map];
        expect(m?.placement, `${p.id}: ${w!.map} places people`).toBeTruthy();
        for (const spot of w!.spot ? [w!.spot] : (w!.spots ?? [])) expect(m!.placement!.spots[spot], `${p.id}: spot ${spot} on ${w!.map}`).toBeDefined();
      }
    }
  });

  it("a person is placed by the resolver or by the map's own events, never both", () => {
    for (const p of people) {
      const resolverPlaced = p.schedule.default || p.schedule.rules.length || p.schedule.roam;
      const created = Object.values(maps).some((m) => m.events.some((e) => e.actions.some((a) => a.type === "create_npc" && a.args[0] === p.id)));
      if (resolverPlaced) expect(created, `${p.id} is created by a map script and placed by the resolver`).toBe(false);
    }
  });

  it("the spots are open ground, nobody on a door or an exit, and the walk to the shop stays free", () => {
    for (const [name, m] of placed) {
      const tele = m.teleports.flatMap((t) => Array.from({ length: t.box.w * t.box.h }, (_, i) => `${t.box.x + (i % t.box.w)},${t.box.y + Math.floor(i / t.box.w)}`));
      const taken = new Set<string>();
      for (const [spot, s] of Object.entries(m.placement!.spots)) {
        expect(m.collision.cell(s.x, s.y), `${name}/${spot} is free ground`).toBe(".");
        expect(tele, `${name}/${spot} is not on a door`).not.toContain(`${s.x},${s.y}`);
        expect(taken.has(`${s.x},${s.y}`), `${name}/${spot} shares a tile`).toBe(false);
        taken.add(`${s.x},${s.y}`);
        // someone can walk up to them: a free tile beside it
        const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.collision.cell(s.x + dx!, s.y + dy!) === ".");
        expect(beside, `${name}/${spot} has a free side`).toBe(true);
      }
    }
    // the walk the browser tests make from the start (29,16) to the shop: along row 16 and up at x 14
    const city = maps["classic_hearthrock_city"]!;
    const route = new Set<string>();
    for (let x = 13; x <= 29; x++) route.add(`${x},16`);
    route.add("14,15");
    route.add("13,14");
    for (const [spot, s] of Object.entries(city.placement!.spots)) expect(route.has(`${s.x},${s.y}`), `${spot} is on the test route`).toBe(false);
  });

  it("with every spot taken the hero can still reach every exit and every spot's side", () => {
    for (const [name, m] of placed) {
      const block = new Set(Object.values(m.placement!.spots).map((s) => `${s.x},${s.y}`));
      const start = m.start ?? { x: 29, y: 16 };
      const seen = new Set<string>([`${start.x},${start.y}`]);
      const queue = [[start.x, start.y]] as [number, number][];
      while (queue.length) {
        const [x, y] = queue.shift()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const k = `${x + dx},${y + dy}`;
          if (seen.has(k) || block.has(k) || m.collision.cell(x + dx, y + dy) === "#") continue;
          seen.add(k);
          queue.push([x + dx, y + dy]);
        }
      }
      for (const [spot, s] of Object.entries(m.placement!.spots)) {
        const reach = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${s.x + dx!},${s.y + dy!}`));
        expect(reach, `${name}/${spot} can be walked up to`).toBe(true);
      }
    }
  });
});

describe("the placement over the real cast (W1 acceptance 2 and 3)", () => {
  const seed = 20261022;
  const at = (map: string, day: string, phase: Phase, extra: { flags?: (f: string) => boolean } = {}) =>
    resolve({ map, placement: maps[map]!.placement!, npcs: table, day, phase, seed, flags: extra.flags ?? flags });

  it("a person is in one place a time, never twice, never over the map's room, over a month", () => {
    for (const day of days(31)) {
      for (const phase of PHASES) {
        const everyone = placed.flatMap(([map]) => at(map, day, phase).map((p) => ({ ...p, map })));
        const slugs = everyone.map((p) => p.slug);
        expect(new Set(slugs).size, `${day} ${phase}`).toBe(slugs.length);
        for (const [map, m] of placed) {
          const here = everyone.filter((p) => p.map === map);
          const anchors = here.filter((p) => table[p.slug]!.anchor).length;
          expect(here.length, `${map} ${day} ${phase}`).toBeLessThanOrEqual(Math.max(m.placement!.maxNpcs, anchors));
          expect(new Set(here.map((p) => p.spot)).size).toBe(here.length);
        }
      }
    }
  });

  it("the same day is the same town, and the owl and Avi stand at their posts every day", () => {
    for (const day of days(14)) {
      expect(at("classic_hearthrock_city", day, "afternoon")).toEqual(at("classic_hearthrock_city", day, "afternoon"));
      const here = at("classic_hearthrock_city", day, "morning");
      expect(here.find((p) => p.slug === "nagmon_owl")).toMatchObject({ spot: "owl_post", x: 29, y: 15 });
      expect(here.find((p) => p.slug === "nagmon_cashier")).toMatchObject({ spot: "cashier_post", x: 14, y: 14 });
    }
  });

  it("at night only the owl and the cat are out", () => {
    for (const day of days(14)) expect(at("classic_hearthrock_city", day, "night").map((p) => p.slug).sort()).toEqual(["nagmon_cat_pita", "nagmon_owl"]);
  });

  it("before the intro is done nobody but the owl and the cashier is out", () => {
    const early = at("classic_hearthrock_city", DAY0, "afternoon", { flags: () => false }).map((p) => p.slug);
    expect(early.sort()).toEqual(["nagmon_cashier", "nagmon_owl"]);
  });

  it("a roamer is at the same spot at most 40% of 14 days", () => {
    const roamers = people.filter((p) => p.schedule.roam && p.schedule.roam.spots.length >= 3);
    expect(roamers.length).toBeGreaterThanOrEqual(2);
    for (const r of roamers) {
      for (const phase of ["morning", "afternoon", "evening"] as Phase[]) {
        const spots = days(28).map((day) => whereIs(r, { day, phase, seed, flags, friendship: () => 0 })?.spot);
        for (let from = 0; from + 14 <= 28; from += 7) {
          const week = spots.slice(from, from + 14).filter((s) => s !== undefined);
          if (week.length < 14) continue;
          const most = Math.max(...[...new Set(week)].map((s) => week.filter((x) => x === s).length));
          expect(most / 14, `${r.id} ${phase}`).toBeLessThanOrEqual(0.4);
        }
      }
    }
  });

  it("a child meets about half the town at a time, and tomorrow's is different", () => {
    const sets = days(10).map((d) => at("classic_hearthrock_city", d, "afternoon").map((p) => p.slug).join(","));
    expect(new Set(sets).size).toBeGreaterThan(6);
    for (const d of days(10)) expect(at("classic_hearthrock_city", d, "afternoon").length).toBeGreaterThanOrEqual(6);
  });

  it("every person of the world is somewhere some day (nobody is lost to a rule)", () => {
    const seen = new Set<string>();
    for (const day of days(21)) for (const phase of PHASES) for (const [map] of placed) for (const p of at(map, day, phase)) seen.add(p.slug);
    const resolverPeople = people.filter((p) => !p.schedule.default && !p.schedule.rules.length && !p.schedule.roam ? false : true).map((p) => p.id);
    expect(resolverPeople.filter((id) => !seen.has(id))).toEqual([]);
  });
});

describe("who can be talked to, with the real maps and no allow-list (W1 acceptance 1)", () => {
  function director(memory = new Map<string, NpcRecord>(), day = DAY0, hour = 10) {
    return new Director({ npcs: table, memory, today: () => day, hour: () => hour, hero: () => "נועה", town: () => [] });
  }
  const host = (): EventHost => ({ say: async () => {}, line: async () => {}, quiz: async (_t, _c, a) => a("correct"), changed: () => {}, found: async () => {}, topics: async () => null });

  it("on Hearthrock and Route 1 every placed person is talkable, and a person with no place there is not", async () => {
    for (const name of ["classic_hearthrock_city", "classic_route_1"]) {
      const m = maps[name]!;
      for (const day of days(6)) {
        for (const phase of ["morning", "afternoon", "evening"] as Phase[]) {
          const here = resolve({ map: name, placement: m.placement!, npcs: table, day, phase, seed: 5, flags });
          const d = director();
          const people: People = {
            defined: (s) => d.defined(s),
            greet: (s) => d.greet(s),
            chips: (s) => d.chips(s),
            topic: (s, i) => d.topic(s, i),
            farewell: (s) => d.farewell(s),
            level: (s) => d.level(s),
            flags: (s) => d.flags(s),
            placed: () => here,
          };
          const r = new EventRunner(m.events, new WorldState(), host(), { grade: 2, today: () => day, hour: () => 10, people });
          await r.start();
          for (const p of here) expect(r.talkable(p.slug), `${name} ${day} ${phase} ${p.slug}`).toBe(true);
          expect(r.talkable("nagmon_baker") && !here.some((p) => p.slug === "nagmon_baker")).toBe(false);
        }
      }
    }
  });

  it("the people the old allow-list kept silent now talk: the tourist, the gardener, the kid, the granny, the owl, Danny", async () => {
    const m = maps["classic_hearthrock_city"]!;
    const slugs = ["nagmon_tourist", "nagmon_gardener", "nagmon_kid", "nagmon_granny", "nagmon_owl", "nagmon_route1_trainer"];
    const d = director();
    const people: People = {
      defined: (s) => d.defined(s),
      greet: (s) => d.greet(s),
      chips: (s) => d.chips(s),
      topic: (s, i) => d.topic(s, i),
      farewell: (s) => d.farewell(s),
      level: (s) => d.level(s),
      flags: (s) => d.flags(s),
      placed: () => slugs.map((slug) => ({ slug })),
    };
    const r = new EventRunner(m.events, new WorldState(), host(), { grade: 2, today: () => DAY0, hour: () => 10, people });
    await r.start();
    for (const s of slugs) expect(r.talkable(s), s).toBe(true);
    for (const s of slugs) expect(await r.talk(s), s).toBe(true);
  });

  it("the old talk events of the tourist and the gardener run now: a question, and a berry or a drop for a right answer", async () => {
    const m = maps["classic_hearthrock_city"]!;
    const found: string[] = [];
    const w = new WorldState();
    const h: EventHost = { ...host(), found: async (f) => void found.push(f.prize.item ?? "coins") };
    const d = director();
    const people: People = { defined: (s) => d.defined(s), greet: (s) => d.greet(s), chips: (s) => d.chips(s), topic: (s, i) => d.topic(s, i), farewell: (s) => d.farewell(s), level: (s) => d.level(s), flags: (s) => d.flags(s), placed: () => [{ slug: "nagmon_tourist" }, { slug: "nagmon_gardener" }] };
    const r = new EventRunner(m.events, w, h, {
      grade: 2,
      today: () => DAY0,
      hour: () => 10,
      people,
      objects: { economy: readEconomy(json("economy.json")), loot: { dailyGift: [], chests: {} }, facts: {}, pools: () => [], zone: "z" },
    });
    await r.start();
    expect(await r.talk("nagmon_tourist")).toBe(true);
    expect(await r.talk("nagmon_gardener")).toBe(true);
    // the tourist's English question pays a Dew Drop and the gardener's science question a berry, once the day's cap allows
    expect(found).toEqual(["dew_drop", "berry"]);
    expect(w.items.get("dew_drop")).toBe(1);
    expect(w.items.get("berry")).toBe(1);
  });
});

describe("the shipped lines (A1 and A2 on the real pools)", () => {
  const groups = ["greet_first", "greet_again", "idle", "farewell"];
  const candidates = (p: NpcDef, group: string, phase: Phase, lvl: number) =>
    (p.lines[group] ?? []).filter((l) => (!l.when?.phase || l.when.phase.includes(phase)) && (l.when?.friendship_min ?? 0) <= lvl && (l.when?.friendship_max ?? 3) >= lvl && (!l.text.includes("{who}") || false));

  it("the top 8 have at least 12 lines in each situation group, and at least 9 for any day part", () => {
    for (const id of TOP8) {
      const p = table[id]!;
      for (const g of groups) {
        expect(p.lines[g]?.length ?? 0, `${id} ${g}`).toBeGreaterThanOrEqual(12);
        // the day parts the person is out in (the owl and the nurse at night too)
        for (const phase of PHASES.filter((ph) => ph !== "night" || p.schedule.night)) {
          expect(candidates(p, g, phase, 0).length, `${id} ${g} ${phase}`).toBeGreaterThanOrEqual(9);
        }
      }
      for (const t of p.topics) expect(p.lines[`topic:${t.id}`]?.length ?? 0, `${id} topic ${t.id}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("every other person has every situation group and a pool for each topic", () => {
    for (const p of people.filter((x) => !TOP8.includes(x.id))) {
      for (const g of groups) expect(p.lines[g]?.length ?? 0, `${p.id} ${g}`).toBeGreaterThanOrEqual(4);
      for (const t of p.topics) expect(p.lines[`topic:${t.id}`]?.length ?? 0, `${p.id} topic ${t.id}`).toBeGreaterThanOrEqual(3);
    }
    // fact topics have a person who knows facts
    for (const p of people) for (const t of p.topics) if (t.id === "fact") expect(p.facts.length).toBeGreaterThan(0);
  });

  it("every fact a person may hand over exists in facts.json", () => {
    const facts = json<{ facts: Record<string, unknown> }>("facts.json").facts;
    for (const p of people) for (const f of p.facts) expect(facts[f], `${p.id}: ${f}`).toBeDefined();
  });

  it("a line id is unique across the whole cast and short enough for the memory", () => {
    const ids = people.flatMap((p) => Object.values(p.lines).flat().map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(28);
    expect(ids.length).toBeGreaterThan(1000);
  });

  it("200 days of visits to each person: no line again within 8 where the pool allows, the same line never twice in a row", async () => {
    for (const p of people) {
      const memory = new Map<string, NpcRecord>();
      let day = DAY0;
      const hour = { v: 10 };
      const d = new Director({ npcs: table, memory, today: () => day, hour: () => hour.v, hero: () => "נועה", town: () => ["יואב", "הגננת מיכל"] });
      const shown: string[] = [];
      for (let i = 0; i < 200; i++) {
        day = addDays(DAY0, i);
        hour.v = [9, 14, 19][i % 3]!;
        const s = await d.greet(p.id);
        expect(s, `${p.id} day ${i}`).not.toBeNull();
        shown.push(s!.id);
        expect(s!.text.includes("{")).toBe(false);
      }
      for (let i = 1; i < shown.length; i++) expect(shown[i], `${p.id} visit ${i}`).not.toBe(shown[i - 1]);
      // for a person with a big enough pool the ring of 8 holds exactly
      if ((p.lines["greet_first"]?.length ?? 0) >= 12) {
        for (let i = 0; i < shown.length; i++) expect(shown.slice(i + 1, i + 9), `${p.id} visit ${i}`).not.toContain(shown[i]);
      }
      expect(JSON.stringify(memory.get(p.id)).length).toBeLessThan(420);
    }
  });

  it("every topic of every person answers, with a line that has no left-over placeholder", async () => {
    for (const p of people) {
      const memory = new Map<string, NpcRecord>([[p.id, { ...emptyRecord(), pts: 99, lvl: 3 }]]);
      const d = new Director({ npcs: table, memory, today: () => DAY0, hour: () => 10, hero: () => "נועה", town: () => ["יואב"] });
      for (const t of d.chips(p.id)) {
        const s = await d.topic(p.id, t.id);
        expect(s, `${p.id} ${t.id}`).not.toBeNull();
        expect(s!.text).not.toMatch(/\{/);
      }
      expect(d.chips(p.id).length, p.id).toBe(p.topics.filter((t) => (p.lines[`topic:${t.id}`]?.length ?? 0) > 0).length);
    }
  });
});
