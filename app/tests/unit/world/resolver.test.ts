import { describe, expect, it } from "vitest";
import { DEFAULT_GAINS, DEFAULT_LEVELS, type MapPlacement, type NpcDef, type NpcTable, type Phase, type Schedule } from "../../../src/core/world/npcs";
import { resolve, whereIs } from "../../../src/core/world/resolver";
import { addDays, dayNumber, weekdayOf } from "../../../src/core/world/rand";

const spot = (x: number, y = 5) => ({ x, y, facing: "down" as const });
const TOWN: MapPlacement = {
  maxNpcs: 20,
  spots: { a: spot(1), b: spot(2), c: spot(3), d: spot(4), e: spot(5), f: spot(6), g: spot(7), h: spot(8), post: spot(9), shop: spot(10) },
};
const ROUTE: MapPlacement = { maxNpcs: 3, spots: { camp: spot(1, 1), pond: spot(2, 1), sign: spot(3, 1), bend: spot(4, 1) } };

function npc(id: string, schedule: Partial<Schedule>, extra: Partial<NpcDef> = {}): NpcDef {
  return {
    id,
    name: id,
    role: "wanderer",
    age_feel: "adult",
    sprite: "s",
    anchor: false,
    priority: 0,
    topics: [],
    facts: [],
    schedule: { default: null, rules: [], roam: null, night: false, ...schedule },
    relationship: { levels: DEFAULT_LEVELS, gain: DEFAULT_GAINS, flags: [] },
    not_with: [],
    lines: {},
    ...extra,
  };
}

const roamer = (id: string, spots = ["a", "b", "c", "d", "e"]) => npc(id, { roam: { map: "town", spots } });

const TABLE: NpcTable = Object.fromEntries(
  [
    npc("shopkeeper", { default: { map: "town", spot: "shop" }, night: false }, { anchor: true, priority: 9 }),
    npc("nurse", { default: { map: "town", spot: "post" }, night: true }, { anchor: true, priority: 9 }),
    roamer("cat", ["a", "b", "c", "d", "e", "f"]),
    roamer("robot", ["c", "d", "e", "f", "g"]),
    npc("baker", { rules: [{ when: { phase: ["morning", "afternoon"] }, at: { map: "town", spot: "g" } }, { when: { phase: ["evening"] }, at: null }] }),
    npc("mail", {
      rules: [
        { when: { phase: ["morning"] }, at: { map: "town", spot: "h" } },
        { when: { phase: ["afternoon"] }, at: { map: "town", spot: "a" } },
        { when: { phase: ["evening"] }, at: { map: "route", spot: "sign" } },
      ],
    }),
    npc("trader", { default: { map: "town", spot: "b" }, visit: { every_days: 3, stay_days: 1 } }),
    npc("rival", { rules: [{ when: { phase: ["evening"], every: 2 }, at: { map: "town", spot: "f" } }] }),
    npc("sage", {
      rules: [
        { when: { weekday: [0, 2, 4, 6] }, at: { map: "route", spot: "camp" } },
        { when: { weekday: [1, 3, 5] }, at: { map: "town", spot: "e" } },
      ],
    }),
    npc("gated", { default: { map: "town", spot: "d" }, appears_if: { flag_all: ["intro_done"] } }),
    roamer("scout-route", ["camp", "pond", "sign", "bend"]),
  ].map((n) => [n.id, n]),
);
for (const n of Object.values(TABLE)) if (n.id === "scout-route") n.schedule.roam = { map: "route", spots: ["camp", "pond", "sign", "bend"] };

const DAY0 = "2026-10-19";
const days = (n: number, from = DAY0) => Array.from({ length: n }, (_, i) => addDays(from, i));
const PH: Phase[] = ["morning", "afternoon", "evening", "night"];
const flags = (set: string[] = ["intro_done"]) => (f: string) => set.includes(f);

const at = (map: string, placement: MapPlacement, day: string, phase: Phase, seed = 7, extra: object = {}) =>
  resolve({ map, placement, npcs: TABLE, day, phase, seed, flags: flags(), ...extra });

describe("days", () => {
  it("counts days and weekdays as the calendar does", () => {
    expect(weekdayOf("2026-10-22")).toBe(4); // a Thursday
    expect(weekdayOf("1970-01-01")).toBe(4);
    expect(weekdayOf("2026-10-25")).toBe(0);
    expect(dayNumber("2026-10-23") - dayNumber("2026-10-22")).toBe(1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("the placement resolver (W1 acceptance 2)", () => {
  it("R1: a person is in one place at a time, never on two maps, never two on a spot", () => {
    for (const day of days(40)) {
      for (const phase of PH) {
        const here = [...at("town", TOWN, day, phase), ...at("route", ROUTE, day, phase)];
        const slugs = here.map((p) => p.slug);
        expect(new Set(slugs).size, `${day} ${phase}`).toBe(slugs.length);
        for (const [map, placement] of [["town", TOWN], ["route", ROUTE]] as const) {
          const spots = at(map, placement, day, phase).map((p) => p.spot);
          expect(new Set(spots).size).toBe(spots.length);
        }
      }
    }
  });

  it("R2: the same inputs give the same people, and another seed gives another town", () => {
    for (const day of days(10)) for (const phase of PH) expect(at("town", TOWN, day, phase, 5)).toEqual(at("town", TOWN, day, phase, 5));
    const a = days(20).map((d) => JSON.stringify(at("town", TOWN, d, "morning", 1)));
    const b = days(20).map((d) => JSON.stringify(at("town", TOWN, d, "morning", 2)));
    expect(a).not.toEqual(b);
  });

  it("gives each placed person the spot's tile and facing", () => {
    const placed = at("town", TOWN, DAY0, "morning").find((p) => p.slug === "shopkeeper")!;
    expect(placed).toMatchObject({ slug: "shopkeeper", spot: "shop", x: 10, y: 5, facing: "down" });
  });

  it("R3: anchors stand at their post every day and phase, never roaming; at night only those that stay out", () => {
    for (const day of days(30)) {
      for (const phase of PH) {
        const here = at("town", TOWN, day, phase);
        const shop = here.find((p) => p.slug === "shopkeeper");
        const nurse = here.find((p) => p.slug === "nurse");
        if (phase === "night") expect(shop).toBeUndefined();
        else expect(shop?.spot).toBe("shop");
        expect(nurse?.spot).toBe("post");
      }
    }
  });

  it("nobody else is out at night", () => {
    for (const day of days(10)) expect(at("town", TOWN, day, "night").map((p) => p.slug)).toEqual(["nurse"]);
  });

  it("rules: the first one that matches by phase, weekday or every Nth day, and null means away", () => {
    expect(at("town", TOWN, DAY0, "morning").some((p) => p.slug === "baker")).toBe(true);
    expect(at("town", TOWN, DAY0, "evening").some((p) => p.slug === "baker")).toBe(false);
    expect(at("town", TOWN, DAY0, "morning").find((p) => p.slug === "mail")?.spot).toBe("h");
    expect(at("route", ROUTE, DAY0, "evening").find((p) => p.slug === "mail")?.spot).toBe("sign");
    // the same person is never on the town's map in the evening
    expect(at("town", TOWN, DAY0, "evening").some((p) => p.slug === "mail")).toBe(false);
    // R10: the sage is on the route on some weekdays and in town on the others, never both
    for (const day of days(14)) {
      const inTown = at("town", TOWN, day, "afternoon").some((p) => p.slug === "sage");
      const onRoute = at("route", ROUTE, day, "afternoon").some((p) => p.slug === "sage");
      expect(inTown !== onRoute).toBe(true);
      expect(inTown).toBe([1, 3, 5].includes(weekdayOf(day)));
    }
    // every 2nd day: half the evenings
    const evenings = days(20).filter((d) => at("town", TOWN, d, "evening").some((p) => p.slug === "rival"));
    expect(evenings).toHaveLength(10);
    expect(dayNumber(evenings[1]!) - dayNumber(evenings[0]!)).toBe(2);
  });

  it("R4: a visitor is in the world only on some days: 1 in 3, whole stays", () => {
    const here = days(30).map((d) => at("town", TOWN, d, "morning").some((p) => p.slug === "trader"));
    expect(here.filter(Boolean)).toHaveLength(10);
    for (let i = 1; i < here.length; i++) if (here[i] && i + 1 < here.length) expect(here[i + 1]).toBe(false);
    const stay2 = npc("v", { default: { map: "town", spot: "b" }, visit: { every_days: 4, stay_days: 2 } });
    const run = days(40).map((d) => whereIs(stay2, { day: d, phase: "morning", seed: 3, flags: flags(), friendship: () => 0 }) !== null);
    expect(run.filter(Boolean)).toHaveLength(20);
    // the stay is two days in a row
    for (let i = 0; i + 1 < run.length; i++) if (run[i] && !(i > 0 && run[i - 1])) expect(run[i + 1]).toBe(true);
  });

  it("R9: appears_if waits for its flag", () => {
    expect(resolve({ map: "town", placement: TOWN, npcs: TABLE, day: DAY0, phase: "morning", seed: 1, flags: flags([]) }).some((p) => p.slug === "gated")).toBe(false);
    expect(at("town", TOWN, DAY0, "morning").some((p) => p.slug === "gated")).toBe(true);
    const friend = npc("pal", { default: { map: "town", spot: "d" }, appears_if: { friendship: { npc: "shopkeeper", min: 2 } } });
    const ctx = (lvl: number) => ({ day: DAY0, phase: "morning" as Phase, seed: 1, flags: flags(), friendship: (s: string) => (s === "shopkeeper" ? lvl : 0) });
    expect(whereIs(friend, ctx(1))).toBeNull();
    expect(whereIs(friend, ctx(2))).toEqual({ map: "town", spot: "d" });
  });

  it("R7 and acceptance 3: a roamer changes spot each day, and over 14 days is on one spot at most 40% of the time", () => {
    for (const seed of [1, 2, 3, 99, 123456]) {
      for (const phase of ["morning", "afternoon", "evening"] as Phase[]) {
        for (const id of ["cat", "robot"]) {
          const def = TABLE[id]!;
          const where = days(60).map((d) => whereIs(def, { day: d, phase, seed, flags: flags(), friendship: () => 0 })!.spot);
          for (let i = 1; i < where.length; i++) expect(where[i], `${id} ${seed} ${phase} day ${i}`).not.toBe(where[i - 1]);
          for (let from = 0; from + 14 <= where.length; from += 7) {
            const week = where.slice(from, from + 14);
            const most = Math.max(...[...new Set(week)].map((s) => week.filter((x) => x === s).length));
            expect(most / 14, `${id} ${seed} ${phase}`).toBeLessThanOrEqual(0.4);
          }
        }
      }
    }
  });

  it("R5: the map's capacity holds; anchors and quest pins always stay; the rest go by priority", () => {
    const crowd: NpcTable = { ...TABLE };
    for (let i = 0; i < 12; i++) crowd[`walker${i}`] = npc(`walker${i}`, { default: { map: "town", spot: ["a", "b", "c", "d", "e", "f", "g", "h"][i % 8]! } }, { priority: i });
    const small: MapPlacement = { ...TOWN, maxNpcs: 5 };
    for (const day of days(20)) {
      const here = resolve({ map: "town", placement: small, npcs: crowd, day, phase: "afternoon", seed: 4, flags: flags() });
      const anchors = here.filter((p) => crowd[p.slug]!.anchor);
      expect(anchors.map((p) => p.slug).sort()).toEqual(["nurse", "shopkeeper"]);
      expect(here.length).toBeLessThanOrEqual(5);
    }
    // anchors alone may pass the number: they are never dropped for room
    const tiny: MapPlacement = { ...TOWN, maxNpcs: 1 };
    const only = resolve({ map: "town", placement: tiny, npcs: crowd, day: DAY0, phase: "afternoon", seed: 4, flags: flags() });
    expect(only.map((p) => p.slug).sort()).toEqual(["nurse", "shopkeeper"]);
    // of the others, the higher priority stays
    const three: MapPlacement = { ...TOWN, maxNpcs: 3 };
    const kept = resolve({ map: "town", placement: three, npcs: crowd, day: DAY0, phase: "afternoon", seed: 4, flags: flags() }).map((p) => p.slug);
    expect(kept).toHaveLength(3);
    expect(kept).toContain("walker11");
  });

  it("R8: a quest pin keeps a giver at the spot it names, whatever the schedule and the room", () => {
    const pins = { baker: { map: "town", spot: "a" } };
    const small: MapPlacement = { ...TOWN, maxNpcs: 1 };
    for (const phase of PH) {
      const here = resolve({ map: "town", placement: small, npcs: TABLE, day: DAY0, phase, seed: 3, flags: flags(), pins });
      expect(here.find((p) => p.slug === "baker")?.spot).toBe("a");
    }
    // and nowhere else
    expect(resolve({ map: "route", placement: ROUTE, npcs: TABLE, day: DAY0, phase: "morning", seed: 3, flags: flags(), pins }).some((p) => p.slug === "baker")).toBe(false);
    // a pin onto a spot someone else holds: the pin wins, the other steps off
    const held = resolve({ map: "town", placement: TOWN, npcs: TABLE, day: DAY0, phase: "afternoon", seed: 3, flags: flags(), pins: { baker: { map: "town", spot: "post" } } });
    expect(held.find((p) => p.spot === "post")?.slug).toBe("baker");
  });

  it("R6: a person who is not with another is never on the same map", () => {
    const t: NpcTable = { ...TABLE, cat: { ...TABLE["cat"]!, not_with: ["robot"] } };
    for (const day of days(30)) {
      const here = resolve({ map: "town", placement: TOWN, npcs: t, day, phase: "afternoon", seed: 8, flags: flags() }).map((p) => p.slug);
      expect(here.includes("cat") && here.includes("robot")).toBe(false);
    }
  });

  it("a person whose spot the map does not have is left out, not a crash", () => {
    const t: NpcTable = { lost: npc("lost", { default: { map: "town", spot: "nowhere" } }) };
    expect(resolve({ map: "town", placement: TOWN, npcs: t, day: DAY0, phase: "morning", seed: 1, flags: flags() })).toEqual([]);
  });

  it("the town looks different tomorrow: who is here changes from day to day", () => {
    const sets = days(10).map((d) => at("town", TOWN, d, "afternoon").map((p) => `${p.slug}@${p.spot}`).join(","));
    expect(new Set(sets).size).toBeGreaterThan(5);
  });
});
