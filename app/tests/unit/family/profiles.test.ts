/**
 * Child profiles (port of tests/nagmon/test_family_profiles.py, 34 cases).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_PROFILES,
  type NewProfile,
  type Profile,
  ProfileError,
  ProfileLimitError,
  ProfileNotFoundError,
  ProfileStore,
  SCHEMA_VERSION,
  profileFromDict,
  profileToDict,
  validateName,
} from "../../../src/core/family/profiles";
import { type FileStore, MemoryFileStore, writeJson } from "../../../src/platform/storage";

const AVATARS = new Set(["girl_a", "boy_a", "girl_b", "boy_b"]);

/** Every call moves one second on, as in the Python FakeClock. */
function fakeClock(t = 1_700_000_000): () => number {
  return () => (t += 1);
}

function ids(...list: string[]): () => string {
  return () => {
    const next = list.shift();
    if (next === undefined) throw new Error("no more ids");
    return next;
  };
}

async function readData(fs: FileStore, path: string): Promise<Record<string, unknown>> {
  return JSON.parse((await fs.readText(path))!) as Record<string, unknown>;
}

let fs: FileStore;
let store: ProfileStore;

beforeEach(() => {
  fs = new MemoryFileStore();
  store = new ProfileStore(fs, { avatars: AVATARS, clock: fakeClock() });
});

describe("profile store", () => {
  it("creates, lists and gets", async () => {
    const p = await store.create({ name: "נועה", avatar: "boy_a", grade: 2 });
    expect(p.id).toMatch(/^p[0-9a-f]{5}$/);
    expect(p.name).toBe("נועה");
    expect(p.grade).toBe(2);
    expect(p.createdAt).toBeGreaterThan(0);
    expect((await store.list()).map((x) => x.id)).toEqual([p.id]);
    expect(await store.get(p.id)).toEqual(p);
    const pdir = `profiles/${p.id}`;
    expect(await fs.stat(`${pdir}/profile.json`)).toBe("file");
    expect(await store.saveDir(p.id)).toBe(`${pdir}/saves`);
    expect(await fs.stat(`${pdir}/saves`)).toBe("dir");
    const data = await readData(fs, `${pdir}/profile.json`);
    expect(data.schema_version).toBe(SCHEMA_VERSION);
  });

  it("get of an unknown id throws", async () => {
    await expect(store.get("pzzzzz")).rejects.toThrow(ProfileNotFoundError);
  });

  it("ids stay unique when the factory repeats itself", async () => {
    const s = new ProfileStore(fs, { avatars: AVATARS, idFactory: ids("paaaaa", "paaaaa", "pbbbbb") });
    const a = await s.create({ name: "Ann", avatar: "girl_a" });
    const b = await s.create({ name: "Ben", avatar: "boy_a" });
    expect([a.id, b.id]).toEqual(["paaaaa", "pbbbbb"]);
  });

  it("save updates the profile", async () => {
    const p = await store.create({ name: "מאיה", avatar: "girl_a" });
    p.languageLevel = 3;
    p.interests.push("דינוזאורים");
    await store.save(p);
    const q = await store.get(p.id);
    expect(q.languageLevel).toBe(3);
    expect(q.interests).toEqual(["דינוזאורים"]);
  });
});

describe("names", () => {
  it.each(["נועה", "Maya", "בת-אל", "Mary Ann", "א", "אבגדהוזחטיכלמנסע", "שי׳", "D'or"])(
    "accepts %s",
    (name) => {
      expect(validateName(name)).toBe(name);
    },
  );

  it("strips spaces", () => {
    expect(validateName("  נועה ")).toBe("נועה");
  });

  it.each([
    "",
    "   ",
    "אבגדהוזחטיכלמנסעפ", // 17
    "נועה2",
    "Maya!",
    "נָעה", // niqqud
    "😀",
    "נועה‏", // RTL mark
    "-נועה",
    "נו  עה", // double space
    "Noam_",
    "\ufeffDan", // a BOM is not whitespace (Python's strip keeps it too)
    "Dan\tLee",
  ])("refuses %j", (name) => {
    expect(() => validateName(name)).toThrow(ProfileError);
  });

  it("refuses a duplicate name in any case", async () => {
    await store.create({ name: "Maya", avatar: "girl_a" });
    await expect(store.create({ name: "maya", avatar: "girl_b" })).rejects.toThrow(ProfileError);
  });

  it("renaming to one's own name is fine", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    p.name = "Maya";
    await store.save(p);
  });

  it("renaming to a sibling's name is refused", async () => {
    await store.create({ name: "Maya", avatar: "girl_a" });
    const p = await store.create({ name: "Noam", avatar: "boy_a" });
    p.name = "MAYA";
    await expect(store.save(p)).rejects.toThrow(ProfileError);
  });
});

describe("avatars and fields", () => {
  it("refuses an avatar outside the allow-list", async () => {
    await expect(store.create({ name: "Maya", avatar: "immodest_sprite" })).rejects.toThrow(ProfileError);
  });

  it("takes a function as the allow-list", async () => {
    const s = new ProfileStore(fs, { avatars: (a) => a.startsWith("modest_") });
    await s.create({ name: "Maya", avatar: "modest_1" });
    await expect(s.create({ name: "Noam", avatar: "other" })).rejects.toThrow(ProfileError);
  });

  it("needs an avatar", async () => {
    await expect(store.create({ name: "Maya", avatar: "" })).rejects.toThrow(ProfileError);
    await expect(store.create({ name: "Maya" } as NewProfile)).rejects.toThrow(ProfileError);
  });

  it("refuses unknown fields", async () => {
    const input = { name: "Maya", avatar: "girl_a", favourite: "x" } as NewProfile;
    await expect(store.create(input)).rejects.toThrow(TypeError);
  });

  it.each([
    ["grade", 10],
    ["grade", -1],
    ["languageLevel", 6],
    ["birthYear", 1800],
  ])("refuses %s = %d", async (field, value) => {
    const input = { name: "Maya", avatar: "girl_a", [field]: value } as NewProfile;
    await expect(store.create(input)).rejects.toThrow(ProfileError);
  });

  it("keeps at most 8 profiles", async () => {
    const names = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh"];
    expect(names.length).toBe(MAX_PROFILES);
    expect(MAX_PROFILES).toBe(8);
    for (const n of names) await store.create({ name: n, avatar: "girl_a" });
    await expect(store.create({ name: "Ii", avatar: "girl_a" })).rejects.toThrow(ProfileLimitError);
  });

  it("two creates at once still keep the limit", async () => {
    const names = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg"];
    for (const n of names) await store.create({ name: n, avatar: "girl_a" });
    const results = await Promise.allSettled([
      store.create({ name: "Hh", avatar: "girl_a" }),
      store.create({ name: "Ii", avatar: "girl_a" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await store.list()).toHaveLength(8);
  });
});

describe("order and trash", () => {
  it("keeps the order and reorders", async () => {
    const a = await store.create({ name: "Aa", avatar: "girl_a" });
    const b = await store.create({ name: "Bb", avatar: "girl_a" });
    const c = await store.create({ name: "Cc", avatar: "girl_a" });
    expect((await store.list()).map((p) => p.id)).toEqual([a.id, b.id, c.id]);
    await store.reorder([c.id, a.id, b.id]);
    expect((await store.list()).map((p) => p.id)).toEqual([c.id, a.id, b.id]);
    await expect(store.reorder([c.id, a.id])).rejects.toThrow(ProfileError);
    await expect(store.reorder([c.id, a.id, a.id])).rejects.toThrow(ProfileError);
  });

  it("delete moves to the trash, and restore brings everything back", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    await fs.writeText(`${await store.saveDir(p.id)}/slot1.save`, "x");
    await store.saveLearnerDict(p.id, { stars: 5 });
    const entry = await store.delete(p.id);
    expect(await store.list()).toEqual([]);
    expect(await fs.stat(`profiles/${p.id}`)).toBeNull();
    expect(entry.profileId).toBe(p.id);
    expect(entry.name).toBe("Maya");
    expect((await store.listTrash()).map((e) => e.entry)).toEqual([entry.entry]);
    const restored = await store.restore(entry.entry);
    expect(restored.id).toBe(p.id);
    expect(await fs.readText(`${await store.saveDir(p.id)}/slot1.save`)).toBe("x");
    expect(await store.loadLearnerDict(p.id)).toEqual({ stars: 5 });
    expect(await store.listTrash()).toEqual([]);
  });

  it("delete of an unknown id throws", async () => {
    await expect(store.delete("pzzzzz")).rejects.toThrow(ProfileNotFoundError);
  });

  it("restore fails when the name was taken meanwhile", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    const entry = await store.delete(p.id);
    await store.create({ name: "Maya", avatar: "girl_b" });
    await expect(store.restore(entry.entry)).rejects.toThrow(ProfileError);
  });

  it("restore of an unknown entry throws", async () => {
    await expect(store.restore("nothing-here")).rejects.toThrow(ProfileNotFoundError);
    await expect(store.restore("../profiles")).rejects.toThrow(ProfileNotFoundError);
  });

  it("allNames includes deleted profiles, for hiding names in reports", async () => {
    await store.create({ name: "דני", avatar: "boy_a" });
    const p = await store.create({ name: "נועה", avatar: "girl_a" });
    await store.delete(p.id);
    expect((await store.allNames()).sort()).toEqual(["דני", "נועה"]);
  });

  it("new ids avoid the ids in the trash", async () => {
    const s = new ProfileStore(fs, { avatars: AVATARS, idFactory: ids("paaaaa", "paaaaa", "pccccc") });
    await s.delete((await s.create({ name: "Ann", avatar: "girl_a" })).id);
    expect((await s.create({ name: "Ben", avatar: "boy_a" })).id).toBe("pccccc");
  });
});

describe("learner data", () => {
  it("round-trips, and a missing file is empty", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    expect(await store.loadLearnerDict(p.id)).toEqual({});
    await store.saveLearnerDict(p.id, { schema_version: 1, theta: { m: 0.3 } });
    expect(await store.loadLearnerDict(p.id)).toEqual({ schema_version: 1, theta: { m: 0.3 } });
  });

  it("a corrupt file recovers from the backup", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    await store.saveLearnerDict(p.id, { v: 1 });
    await store.saveLearnerDict(p.id, { v: 2 });
    await fs.writeText(`profiles/${p.id}/learning.json`, "{oops");
    expect(await store.loadLearnerDict(p.id)).toEqual({ v: 1 });
    const names = (await fs.list(`profiles/${p.id}`)).map((e) => e.name);
    expect(names.some((n) => n.startsWith("learning.json.corrupt-"))).toBe(true);
  });

  it("an unknown profile throws", async () => {
    await expect(store.loadLearnerDict("pzzzzz")).rejects.toThrow(ProfileNotFoundError);
  });

  class FakeLearner {
    constructor(readonly data: Record<string, unknown>) {}
    toDict() {
      return { ...this.data } as Record<string, never>;
    }
  }

  it("loads and saves a learner through the factories", async () => {
    const s = new ProfileStore<FakeLearner>(fs, {
      avatars: AVATARS,
      learnerFromDict: (d) => new FakeLearner(d),
      learnerNew: () => new FakeLearner({ fresh: true }),
    });
    const p = await s.create({ name: "Maya", avatar: "girl_a" });
    expect((await s.loadLearner(p.id)).data).toEqual({ fresh: true });
    await s.saveLearner(p.id, new FakeLearner({ stars: 3 }));
    expect((await s.loadLearner(p.id)).data).toEqual({ stars: 3 });
  });

  it("loadLearner without a factory throws", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    await expect(store.loadLearner(p.id)).rejects.toThrow(/learnerFromDict/);
  });

  it("without learnerNew an empty dict goes to learnerFromDict", async () => {
    const s = new ProfileStore<FakeLearner>(fs, { avatars: AVATARS, learnerFromDict: (d) => new FakeLearner(d) });
    const p = await s.create({ name: "Maya", avatar: "girl_a" });
    expect((await s.loadLearner(p.id)).data).toEqual({});
  });
});

describe("saves racing a delete (review of app/family)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  /** Every file call waits a macrotask, like the Android bridge. */
  function slow(inner: FileStore): FileStore {
    return new Proxy(inner, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          await tick();
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  }

  it("a learner save racing a delete never brings the profile back", async () => {
    for (let offset = 0; offset < 12; offset++) {
      const sfs = slow(new MemoryFileStore());
      const s = new ProfileStore(sfs);
      const p = await s.create({ name: "נועה", avatar: "owl" });
      const deleted = s.delete(p.id);
      for (let i = 0; i < offset; i++) await tick();
      const saved = s.saveLearnerDict(p.id, { x: 1 }).then(
        () => "saved",
        (e: Error) => e.name,
      );
      await deleted;
      expect(await saved, `offset ${offset}`).toBe("ProfileNotFoundError");
      expect(await s.list(), `offset ${offset}`).toEqual([]);
      expect(await sfs.list("profiles"), `offset ${offset}`).toEqual([]);
    }
  });

  it("a learner save queued before the delete lands in the trash with the profile", async () => {
    const p = await store.create({ name: "נועה", avatar: "girl_a" });
    await Promise.all([store.saveLearnerDict(p.id, { x: 1 }), store.delete(p.id)]);
    expect(await store.list()).toEqual([]);
    const [entry] = await store.listTrash();
    await store.restore(entry!.entry);
    expect(await store.loadLearnerDict(p.id)).toEqual({ x: 1 });
  });

  it("saveDir of a deleted profile throws and creates nothing", async () => {
    const p = await store.create({ name: "נועה", avatar: "girl_a" });
    await store.delete(p.id);
    await expect(store.saveDir(p.id)).rejects.toThrow(ProfileNotFoundError);
    expect(await fs.list("profiles")).toEqual([]);
  });
});

describe("files from older versions and damaged files", () => {
  it("migrates v1 to v2 and orders by creation time", async () => {
    const old: [string, string, number][] = [
      ["pbbbbb", "Ben", 200],
      ["paaaaa", "Ann", 100],
    ];
    for (const [pid, name, created] of old) {
      await fs.writeText(
        `profiles/${pid}/profile.json`,
        JSON.stringify({
          schema_version: 1,
          id: pid,
          name,
          avatar: "girl_a",
          birth_year: null,
          grade: 1,
          language_level: 0,
          language_locked: false,
          interests: [],
          settings: {},
          created_at: created,
        }),
      );
    }
    const s = new ProfileStore(fs, { avatars: AVATARS });
    const profiles = await s.list();
    expect(profiles.map((p) => p.name)).toEqual(["Ann", "Ben"]);
    expect(profiles.map((p) => p.order)).toEqual([0, 1]);
    await s.save(profiles[0]!);
    const data = await readData(fs, "profiles/paaaaa/profile.json");
    expect(data.schema_version).toBe(SCHEMA_VERSION);
  });

  it("unknown fields survive a round trip", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    const path = `profiles/${p.id}/profile.json`;
    const data = await readData(fs, path);
    data.future_field = { x: 1 };
    await fs.writeText(path, JSON.stringify(data));
    await store.save(await store.get(p.id));
    expect((await readData(fs, path)).future_field).toEqual({ x: 1 });
  });

  it("a corrupt profile without a backup is recovered with a valid name", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    const path = `profiles/${p.id}/profile.json`;
    await fs.writeText(path, "garbage");
    await fs.remove(`${path}.bak`);
    const q = await store.get(p.id);
    expect(q.id).toBe(p.id);
    expect(q.settings.recovered).toBe(true);
    expect(validateName(q.name)).toBe(q.name);
    const names = (await fs.list(`profiles/${p.id}`)).map((e) => e.name);
    expect(names.some((n) => n.startsWith("profile.json.corrupt-"))).toBe(true);
  });

  it("a corrupt profile with a backup uses the previous version", async () => {
    const p = await store.create({ name: "Maya", avatar: "girl_a" });
    p.grade = 4;
    await store.save(p);
    await fs.writeText(`profiles/${p.id}/profile.json`, "garbage");
    const q = await store.get(p.id);
    expect(q.name).toBe("Maya");
    expect(q.grade).toBe(0); // the previous version, from the .bak
  });

  it("a profile round-trips through its dict", () => {
    const p: Profile = {
      id: "pabcde",
      name: "Maya",
      avatar: "girl_a",
      birthYear: null,
      grade: 3,
      languageLevel: 0,
      languageLocked: false,
      interests: ["כדורגל"],
      settings: { text_speed: 2 },
      createdAt: 5,
      order: 0,
      extra: {},
    };
    expect(profileFromDict(profileToDict(p))).toEqual(p);
    expect(profileToDict(p)).toMatchObject({ birth_year: null, language_level: 0, created_at: 5 });
  });

  it("ignores stray directories and files", async () => {
    await store.create({ name: "Maya", avatar: "girl_a" });
    await fs.mkdir("profiles/junk");
    await fs.writeText("profiles/file.txt", "x");
    expect(await store.list()).toHaveLength(1);
  });

  it("odd keys like __proto__ stay plain data", async () => {
    await fs.writeText(
      "profiles/pabcde/profile.json",
      '{"name": "Maya", "avatar": "girl_a", "order": 0, "__proto__": {"polluted": 1}, "toString": "x",' +
        ' "settings": {"__proto__": {"polluted": 2}}}',
    );
    const p = await store.get("pabcde");
    expect(Object.getPrototypeOf(p.extra)).toBe(Object.prototype);
    expect((p.extra as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(p.extra, "__proto__")).toBe(true);
    expect(p.extra.toString).toBe("x");
    expect((p.settings as Record<string, unknown>).polluted).toBeUndefined();
    await store.save(p);
    const data = await readData(fs, "profiles/pabcde/profile.json");
    expect(Object.hasOwn(data, "__proto__")).toBe(true);
    expect(data.toString).toBe("x");
  });

  it("a profile file with wrong types still loads", async () => {
    await writeJson(fs, "profiles/pabcde/profile.json", {
      schema_version: 2,
      name: "Maya",
      avatar: "girl_a",
      grade: "two",
      interests: "x",
      order: 0,
    });
    const p = await store.get("pabcde");
    expect(p.name).toBe("Maya");
    expect(p.grade).toBe(0);
    expect(p.interests).toEqual([]);
  });
});
