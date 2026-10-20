/**
 * The parent area's settings and PIN (port of
 * tests/nagmon/test_family_parent.py, 27 cases). PBKDF2 runs for real,
 * with 240,000 iterations, through WebCrypto.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { LOCATION_PRESETS, locationPreset } from "../../../src/core/family/location";
import {
  LOCKOUT_SECONDS,
  MAX_ATTEMPTS,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  ParentStore,
  PinError,
  PinLockedError,
  constantTimeEqual,
  hashPin,
  limitsFor,
  makeGateChallenge,
  redact,
  scrub,
  settingsFromDict,
  settingsToDict,
  weeklyDaysFor,
} from "../../../src/core/family/parent";
import { MemorySecretStore, SECRET_KEYS } from "../../../src/platform/secrets";
import { type FileStore, MemoryFileStore, readJson, writeJson } from "../../../src/platform/storage";
import { valuesFromDict, valuesToDict } from "../../../src/core/family/values";

// PBKDF2 at full strength takes a moment per PIN check.
const SLOW = { timeout: 60_000 };

class Clock {
  constructor(public t = 1_000_000) {}
  readonly now = () => this.t;
}

/** A small seeded random source (mulberry32), like random.Random(seed). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

let fs: FileStore;
let clock: Clock;
let store: ParentStore;

beforeEach(async () => {
  fs = new MemoryFileStore();
  clock = new Clock();
  store = await ParentStore.open(fs, { clock: clock.now });
});

describe("settings", () => {
  it("has the defaults", () => {
    const s = store.settings;
    expect(s.location.cityHe).toBe("ירושלים");
    expect(s.location.tz).toBe("Asia/Jerusalem");
    expect(s.location.candleMinutes).toBe(40);
    expect(s.shabbatMode).toBe(true);
    expect(s.holidayMode).toBe(true);
    expect(s.values.modestyFilter).toBe(true);
    expect(s.ai.provider).toBe("none");
    expect(store.hasPin()).toBe(false);
  });

  it("has the city presets", () => {
    expect(locationPreset("jerusalem").candleMinutes).toBe(40);
    expect(locationPreset("haifa").candleMinutes).toBe(30);
    expect(locationPreset("tel_aviv").candleMinutes).toBe(18);
    expect(LOCATION_PRESETS.petah_tikva.candleMinutes).toBe(20);
    expect(() => locationPreset("atlantis")).toThrow();
  });

  it("limits per child fall back to the defaults", () => {
    const s = store.settings;
    expect(limitsFor(s, "pabcde")).toEqual(s.defaultLimits);
    s.profileLimits.pabcde = { daily_max_minutes: 30 };
    expect(limitsFor(s, "pabcde").daily_max_minutes).toBe(30);
    expect(limitsFor(s, "pother")).toEqual(s.defaultLimits);
  });

  it("weekly days per child: 3 at ages 5-7, else 4, or the parent's choice", () => {
    const s = store.settings;
    expect(weeklyDaysFor(s, "p1", 6)).toBe(3);
    expect(weeklyDaysFor(s, "p1", 10)).toBe(4);
    s.weeklyDays.p1 = 5;
    expect(weeklyDaysFor(s, "p1", 6)).toBe(5);
  });

  it("round-trips everything", async () => {
    const s = store.settings;
    s.location = locationPreset("haifa");
    s.shabbatMode = false;
    s.shabbatStopBeforeMinutes = 15;
    s.ai = { provider: "gemini", baseUrl: "https://x.example", model: "m", enabled: true };
    s.profileLimits.pabcde = { daily_max_minutes: 45, weekday_windows: ["15:00-18:00"] };
    s.values.kindnessQuests = false;
    s.weeklyDays.pabcde = 2;
    await store.save();
    const s2 = await ParentStore.open(fs, { clock: clock.now });
    expect(s2.settings).toEqual(s);
    expect(settingsFromDict(settingsToDict(s))).toEqual(s);
  });

  it("a corrupt parent.json gives the defaults", async () => {
    await fs.writeText("parent.json", "not json at all");
    const s = await ParentStore.open(fs, { clock: clock.now });
    expect(s.recovered).toBe(true);
    expect(s.settings.location.cityHe).toBe("ירושלים");
    const names = (await fs.list("")).map((e) => e.name);
    expect(names.some((n) => n.startsWith("parent.json.corrupt-"))).toBe(true);
  });

  it("bad values in parent.json fall back one by one", async () => {
    await fs.writeText(
      "parent.json",
      JSON.stringify({
        schema_version: 1,
        shabbat_mode: "maybe",
        location: { lat: "x" },
        profile_limits: { p1: "bad" },
      }),
    );
    const s = await ParentStore.open(fs, { clock: clock.now });
    expect(s.settings.shabbatMode).toBe(true);
    expect(s.settings.location.cityHe).toBe("ירושלים");
    expect(s.settings.profileLimits).toEqual({});
  });
});

describe("PIN", () => {
  it("uses at least 200,000 iterations", () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(MIN_PBKDF2_ITERATIONS);
    expect(MIN_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(200_000);
    expect(PBKDF2_ITERATIONS).toBe(240_000);
  });

  it("hashes exactly as the old app, so its parent.json still verifies", SLOW, async () => {
    // hashlib.pbkdf2_hmac("sha256", b"4821", bytes(range(16)), 240000).hex()
    const salt = new Uint8Array([...Array(16).keys()]);
    expect(await hashPin("4821", salt, 240_000)).toBe(
      "911965b1a069b02f2bc5a6100d7d1515f5733d8c3ddd2e1d8c03e787cb0ebac5",
    );
    await fs.writeText(
      "parent.json",
      JSON.stringify({
        pin_hash: "911965b1a069b02f2bc5a6100d7d1515f5733d8c3ddd2e1d8c03e787cb0ebac5",
        pin_salt: "000102030405060708090a0b0c0d0e0f",
        pin_iterations: 240_000,
      }),
    );
    expect((await (await ParentStore.open(fs)).verifyPin("4821")).ok).toBe(true);
  });

  it("compares hashes in constant time and exactly", () => {
    expect(constantTimeEqual("abcd", "abcd")).toBe(true);
    expect(constantTimeEqual("abcd", "abce")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("a", "")).toBe(false);
  });

  it("refuses weak iterations", async () => {
    await expect(ParentStore.open(fs, { iterations: 1000 })).rejects.toThrow(RangeError);
  });

  it("sets and checks a PIN, and keeps only a salted hash", SLOW, async () => {
    await store.setPin("4821");
    expect(store.hasPin()).toBe(true);
    expect((await store.verifyPin("4821")).ok).toBe(true);
    expect((await store.verifyPin("1111")).ok).toBe(false);
    const raw = (await fs.readText("parent.json"))!;
    expect(raw).not.toContain("4821");
    const data = JSON.parse(raw) as { pin_iterations: number; pin_salt: string; pin_hash: string };
    expect(data.pin_iterations).toBeGreaterThanOrEqual(200_000);
    expect(hexToBytes(data.pin_salt)).toHaveLength(16);
    expect(data.pin_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses a random salt", SLOW, async () => {
    const a = await ParentStore.open(new MemoryFileStore(), { clock: clock.now });
    const b = await ParentStore.open(new MemoryFileStore(), { clock: clock.now });
    await a.setPin("1234");
    await b.setPin("1234");
    expect(a.settings.pinSalt).not.toBe(b.settings.pinSalt);
    expect(a.settings.pinHash).not.toBe(b.settings.pinHash);
  });

  it("persists", SLOW, async () => {
    await (await ParentStore.open(fs, { clock: clock.now })).setPin("123456");
    expect((await (await ParentStore.open(fs, { clock: clock.now })).verifyPin("123456")).ok).toBe(true);
  });

  it.each(["123", "123456789", "12a4", "", " 1234", "١٢٣٤"])("refuses the PIN %j", async (pin) => {
    await expect(store.setPin(pin)).rejects.toThrow(PinError);
  });

  it("change needs the current PIN", SLOW, async () => {
    await store.setPin("1234");
    await expect(store.setPin("5678")).rejects.toThrow(PinError);
    await expect(store.setPin("5678", { current: "0000" })).rejects.toThrow(PinError);
    await store.setPin("5678", { current: "1234" });
    expect((await store.verifyPin("5678")).ok).toBe(true);
  });

  it("without a PIN nothing verifies", async () => {
    expect((await store.verifyPin("1234")).ok).toBe(false);
  });

  it("locks for 60 s after 5 wrong tries, even for the right PIN", SLOW, async () => {
    await store.setPin("1234");
    expect(MAX_ATTEMPTS).toBe(5);
    expect(LOCKOUT_SECONDS).toBe(60);
    for (let i = 0; i < 4; i++) {
      const res = await store.verifyPin("0000");
      expect(res.ok || res.locked).toBe(false);
      expect(res.attemptsLeft).toBe(4 - i);
    }
    let res = await store.verifyPin("0000");
    expect(res.locked).toBe(true);
    expect(res.retryAfterS).toBeCloseTo(60);
    clock.t += 30;
    res = await store.verifyPin("1234");
    expect(res.ok).toBe(false);
    expect(res.locked).toBe(true);
    expect(res.retryAfterS).toBeCloseTo(30);
    clock.t += 31;
    res = await store.verifyPin("1234");
    expect(res.ok).toBe(true);
    expect(store.settings.failedAttempts).toBe(0);
  });

  it("a right PIN resets the count", SLOW, async () => {
    await store.setPin("1234");
    for (let i = 0; i < 4; i++) await store.verifyPin("0000");
    expect((await store.verifyPin("1234")).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect((await store.verifyPin("0000")).locked).toBe(false);
  });

  it("the lock survives a restart", SLOW, async () => {
    await store.setPin("1234");
    for (let i = 0; i < 5; i++) await store.verifyPin("0000");
    const again = await ParentStore.open(fs, { clock: clock.now });
    expect((await again.verifyPin("1234")).locked).toBe(true);
  });

  it("a clock moved back does not extend the lock", SLOW, async () => {
    await store.setPin("1234");
    for (let i = 0; i < 5; i++) await store.verifyPin("0000");
    clock.t -= 10_000;
    const res = await store.verifyPin("1234");
    expect(res.locked).toBe(true);
    expect(res.retryAfterS).toBeLessThanOrEqual(LOCKOUT_SECONDS);
    clock.t += LOCKOUT_SECONDS + 1;
    expect((await store.verifyPin("1234")).ok).toBe(true);
  });

  it("rehashes a PIN saved with fewer iterations", SLOW, async () => {
    await store.setPin("1234");
    // An older file: the same PIN hashed with the minimum count.
    store.settings.pinIterations = MIN_PBKDF2_ITERATIONS;
    store.settings.pinHash = await hashPin("1234", hexToBytes(store.settings.pinSalt!), MIN_PBKDF2_ITERATIONS);
    await store.save();
    const s2 = await ParentStore.open(fs, { clock: clock.now, iterations: MIN_PBKDF2_ITERATIONS + 1 });
    expect((await s2.verifyPin("1234")).ok).toBe(true);
    expect(s2.settings.pinIterations).toBe(MIN_PBKDF2_ITERATIONS + 1);
    expect((await s2.verifyPin("1234")).ok).toBe(true);
  });

  it("five wrong tries at once still lock (checks run one at a time)", SLOW, async () => {
    await store.setPin("1234");
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => store.verifyPin("0000")));
    expect(results.filter((r) => r.locked)).toHaveLength(2);
    expect(store.settings.failedAttempts).toBe(5);
  });
});

describe("PIN, from the review of app/family", () => {
  it("two stores on one file share the wrong-PIN count", SLOW, async () => {
    const a = await ParentStore.open(fs, { clock: clock.now, iterations: MIN_PBKDF2_ITERATIONS });
    await a.setPin("1234");
    const b = await ParentStore.open(fs, { clock: clock.now, iterations: MIN_PBKDF2_ITERATIONS });
    for (let i = 0; i < 4; i++) await a.verifyPin("0000");
    expect((await b.verifyPin("0000")).locked).toBe(true);
    expect((await a.verifyPin("1234")).locked).toBe(true);
    expect((await ParentStore.open(fs)).settings.failedAttempts).toBe(5);
  });

  it("a check keeps settings changed in memory but not saved yet", SLOW, async () => {
    await store.setPin("1234");
    store.settings.shabbatMode = false;
    await store.verifyPin("0000");
    expect(store.settings.shabbatMode).toBe(false);
    expect(store.settings.failedAttempts).toBe(1);
  });

  it.each([0, -5, 1.5, 1000, 1e9])("a file with %d iterations drops the PIN instead of locking the parent out", async (n) => {
    await store.setPin("1234");
    const data = (await readJson(fs, "parent.json")).data!;
    await writeJson(fs, "parent.json", { ...data, pin_iterations: n });
    const warnings: string[] = [];
    const s2 = await ParentStore.open(fs, { onWarning: (m) => warnings.push(m) });
    expect(s2.hasPin()).toBe(false);
    expect(warnings.join()).toMatch(/PIN/);
    expect((await s2.verifyPin("1234")).ok).toBe(false); // resolves, never rejects
    await s2.setPin("5678"); // the parent can set a new one
    expect((await s2.verifyPin("5678")).ok).toBe(true);
  }, 60_000);

  it("a malformed salt or hash drops the PIN too", async () => {
    await store.setPin("1234");
    const data = (await readJson(fs, "parent.json")).data!;
    await writeJson(fs, "parent.json", { ...data, pin_salt: "zz" });
    expect((await ParentStore.open(fs)).hasPin()).toBe(false);
    await writeJson(fs, "parent.json", { ...data, pin_hash: "abc" });
    expect((await ParentStore.open(fs)).hasPin()).toBe(false);
  }, 60_000);

  it("changing the PIN while locked says locked", SLOW, async () => {
    await store.setPin("1234");
    for (let i = 0; i < 5; i++) await store.verifyPin("0000");
    const err = await store.setPin("5678", { current: "1234" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PinLockedError);
    expect(err).toBeInstanceOf(PinError);
    expect((err as PinLockedError).retryAfterS).toBeCloseTo(60);
    clock.t += 61;
    await store.setPin("5678", { current: "1234" });
    expect((await store.verifyPin("5678")).ok).toBe(true);
  });
});

describe("odd keys stay plain data", () => {
  it("a child id like __proto__ neither pollutes nor leaks", () => {
    const s = settingsFromDict(
      JSON.parse('{"profile_limits": {"__proto__": {"daily_max_minutes": 1}}, "weekly_days": {"__proto__": 2}}'),
    );
    expect(({} as Record<string, unknown>).daily_max_minutes).toBeUndefined();
    expect(Object.getPrototypeOf(s.profileLimits)).toBe(Object.prototype);
    expect(limitsFor(s, "__proto__")).toEqual({ daily_max_minutes: 1 });
    expect(limitsFor(s, "toString")).toBe(s.defaultLimits);
    expect(weeklyDaysFor(s, "__proto__", 6)).toBe(2);
    expect(weeklyDaysFor(s, "constructor", 10)).toBe(4);
  });

  it("family values keep unknown keys, even toString and __proto__", () => {
    const v = valuesFromDict(JSON.parse('{"toString": "x", "__proto__": {"a": 1}, "modesty_filter": false}'));
    expect(v.modestyFilter).toBe(false);
    expect(v.extra.toString).toBe("x");
    expect(Object.hasOwn(v.extra, "__proto__")).toBe(true);
    expect(Object.hasOwn(valuesToDict(v), "__proto__")).toBe(true);
  });
});

describe("gate without a PIN", () => {
  it("asks a two-digit multiplication without 10s and 11s", () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const g = makeGateChallenge(rng);
      expect(g.a >= 12 && g.a <= 99 && g.b >= 12 && g.b <= 99).toBe(true);
      expect(g.a % 10 && g.b % 10).toBeTruthy();
      expect(g.a % 11 && g.b % 11).toBeTruthy();
      expect(g.answer).toBe(g.a * g.b);
      expect(g.promptHe).toContain(String(g.a));
      expect(g.promptHe).toContain(String(g.b));
      expect(g.check(String(g.answer))).toBe(true);
      expect(g.check(` ${g.answer} `)).toBe(true);
      expect(g.check(String(g.answer + 1))).toBe(false);
      expect(g.check("abc")).toBe(false);
      expect(g.check("")).toBe(false);
    }
  });

  it("is the same for the same seed", () => {
    const a = makeGateChallenge(seeded(1));
    const b = makeGateChallenge(seeded(1));
    expect([a.a, a.b]).toEqual([b.a, b.b]);
  });
});

describe("secrets stay out of parent.json", () => {
  const KEY = "sk-test-1234567890abcdef";

  it("an AI key lives in the secret store, never in the settings", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set(SECRET_KEYS.aiKey("openai"), KEY);
    store.settings.ai = { provider: "openai", baseUrl: "", model: "", enabled: true };
    await store.save();
    expect(await fs.readText("parent.json")).not.toContain("sk-test");
    expect(await secrets.get(SECRET_KEYS.aiKey("openai"))).toBe(KEY);
    expect(String(secrets)).not.toContain("sk-test");
    expect(String(store)).not.toContain("sk-test");
    expect(JSON.stringify(settingsToDict(store.settings))).not.toContain("sk-test");
    await secrets.remove(SECRET_KEYS.aiKey("openai"));
    expect(await secrets.get(SECRET_KEYS.aiKey("openai"))).toBeNull();
  });

  it("settings never carry a secret field, even from an old file", async () => {
    // The old app kept keys in secrets.json; a stray one in parent.json is dropped.
    await fs.writeText("parent.json", JSON.stringify({ ai_api_key: KEY, ai: { api_key: KEY } }));
    const s = await ParentStore.open(fs, { clock: clock.now });
    await s.save();
    expect(await fs.readText("parent.json")).not.toContain("sk-test");
  });

  it("the store prints without the PIN hash", SLOW, async () => {
    await store.setPin("1234");
    const text = String(store);
    expect(text).toContain("pin_set=true");
    expect(text).not.toContain(store.settings.pinHash!);
  });
});

describe("redaction", () => {
  it("redact keeps the last 4 characters of long values only", () => {
    expect(redact(null)).toBe("***");
    expect(redact("")).toBe("***");
    expect(redact("short")).toBe("***");
    expect(redact("sk-test-1234567890abcdef")).toBe("***cdef");
  });

  it("scrub replaces every occurrence", () => {
    const key = "sk-test-1234567890abcdef";
    const out = scrub(`error calling api with key=${key} (key ${key})`, key, "");
    expect(out).not.toContain(key);
    expect(out.split("***cdef")).toHaveLength(3);
  });
});
