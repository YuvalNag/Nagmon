/**
 * The parent area: the PIN, the quick gate, the location, Shabbat and
 * holiday mode, AI provider settings and per-child limits (port of
 * nagmon/family/parent.py).
 *
 * `parent.json` holds the settings. Secrets (AI keys, the GitHub token)
 * never go here; they live in platform/secrets (the Android Keystore).
 *
 * The PIN is kept as PBKDF2-HMAC-SHA256 with a 16-byte random salt and
 * 240,000 iterations (WebCrypto), hex-encoded exactly as the old app did,
 * so an old parent.json still verifies.
 */
import {
  type FileStore,
  type JsonObject,
  asBool,
  asFloat,
  asInt,
  asStr,
  isJsonObject,
  joinPath,
  readJson,
  writeJson,
} from "../../platform/storage";
import { defaultWeeklyDays } from "./goals";
import { type Location, locationFromDict, locationPreset, locationToDict } from "./location";
import { type FamilyValues, defaultValues, valuesFromDict, valuesToDict } from "./values";

export const SCHEMA_VERSION = 1;
export const MIN_PBKDF2_ITERATIONS = 200_000;
export const PBKDF2_ITERATIONS = 240_000;
export const SALT_BYTES = 16;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 60;
/** The old app took 4 to 8 digits; the new UI asks for exactly 4. */
export const PIN_MIN_LEN = 4;
export const PIN_MAX_LEN = 8;

/** Bad PIN format, or the current PIN is required or wrong. */
export class PinError extends Error {
  override name = "PinError";
}

// ---------------------------------------------------------------- redaction

/** Hides a secret; keeps the last 4 characters of long values (12+). */
export function redact(value: string | null | undefined): string {
  if (!value || value.length < 12) return "***";
  return "***" + value.slice(-4);
}

/** Replaces every occurrence of each secret in `text`. */
export function scrub(text: string, ...secrets: string[]): string {
  for (const s of secrets) if (s) text = text.split(s).join(redact(s));
  return text;
}

// ---------------------------------------------------------------- settings

export interface AIConfig {
  provider: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
}

/**
 * Screen-time limits as saved (`ScreenLimits.to_dict` of the old app).
 * Kept as a JSON object until screen time is ported (M8), which reads it
 * leniently; values written by the old app pass through unchanged.
 */
export type ScreenLimitsDict = JsonObject;

/** The old app's default limits, as its to_dict wrote them. */
export const DEFAULT_LIMITS: ScreenLimitsDict = {
  daily_max_minutes: 60,
  weekday_windows: ["16:00-19:30"],
  weekend_windows: ["08:00-12:00", "16:00-19:30"],
  weekend_days: [4, 5],
  bedtime: "20:00",
  wake_time: "06:00",
  break_every_minutes: 20,
  break_minutes: 5,
  warn_minutes: 5,
  grace_minutes: 3,
};

export interface ParentSettings {
  pinHash: string | null;
  pinSalt: string | null;
  pinIterations: number;
  failedAttempts: number;
  /** Seconds since the epoch; 0 when not locked. */
  lockedUntil: number;
  location: Location;
  shabbatMode: boolean;
  holidayMode: boolean;
  shabbatStopBeforeMinutes: number;
  ai: AIConfig;
  defaultLimits: ScreenLimitsDict;
  profileLimits: Record<string, ScreenLimitsDict>;
  weeklyDays: Record<string, number>;
  values: FamilyValues;
}

/** Fresh settings: no PIN, Jerusalem, Shabbat and holidays on. */
export function defaultSettings(): ParentSettings {
  return {
    pinHash: null,
    pinSalt: null,
    pinIterations: PBKDF2_ITERATIONS,
    failedAttempts: 0,
    lockedUntil: 0,
    location: locationPreset("jerusalem"),
    shabbatMode: true,
    holidayMode: true,
    shabbatStopBeforeMinutes: 10,
    ai: { provider: "none", baseUrl: "", model: "", enabled: false },
    defaultLimits: structuredClone(DEFAULT_LIMITS),
    profileLimits: {},
    weeklyDays: {},
    values: defaultValues(),
  };
}

/** The limits of one child, or the family's defaults. */
export function limitsFor(s: ParentSettings, profileId: string): ScreenLimitsDict {
  return s.profileLimits[profileId] ?? s.defaultLimits;
}

/** Practice days a week for one child: the parent's choice, or by age. */
export function weeklyDaysFor(s: ParentSettings, profileId: string, age: number | null): number {
  return s.weeklyDays[profileId] ?? defaultWeeklyDays(age);
}

/** The settings as parent.json holds them. */
export function settingsToDict(s: ParentSettings): JsonObject {
  return {
    schema_version: SCHEMA_VERSION,
    pin_hash: s.pinHash,
    pin_salt: s.pinSalt,
    pin_iterations: s.pinIterations,
    failed_attempts: s.failedAttempts,
    locked_until: s.lockedUntil,
    location: locationToDict(s.location),
    shabbat_mode: s.shabbatMode,
    holiday_mode: s.holidayMode,
    shabbat_stop_before_minutes: s.shabbatStopBeforeMinutes,
    ai: { provider: s.ai.provider, base_url: s.ai.baseUrl, model: s.ai.model, enabled: s.ai.enabled },
    default_limits: structuredClone(s.defaultLimits),
    profile_limits: structuredClone(s.profileLimits),
    weekly_days: { ...s.weeklyDays },
    values: valuesToDict(s.values),
  };
}

/** Lenient loader: each bad field falls back to its default. */
export function settingsFromDict(d: unknown): ParentSettings {
  const s = defaultSettings();
  if (!isJsonObject(d)) return s;
  if (typeof d.pin_hash === "string" && typeof d.pin_salt === "string") {
    s.pinHash = d.pin_hash;
    s.pinSalt = d.pin_salt;
    s.pinIterations = asInt(d.pin_iterations, PBKDF2_ITERATIONS);
  }
  s.failedAttempts = Math.max(0, asInt(d.failed_attempts, 0));
  s.lockedUntil = asFloat(d.locked_until, 0);
  try {
    s.location = locationFromDict(d.location);
  } catch {
    // keep Jerusalem
  }
  s.shabbatMode = asBool(d.shabbat_mode, true);
  s.holidayMode = asBool(d.holiday_mode, true);
  const stop = asInt(d.shabbat_stop_before_minutes, 10);
  s.shabbatStopBeforeMinutes = stop >= 0 && stop <= 120 ? stop : 10;
  if (isJsonObject(d.ai)) {
    // Only these four keys: a key from an old file never comes along.
    s.ai = {
      provider: asStr(d.ai.provider, "none"),
      baseUrl: asStr(d.ai.base_url, ""),
      model: asStr(d.ai.model, ""),
      enabled: asBool(d.ai.enabled, false),
    };
  }
  if (isJsonObject(d.default_limits)) s.defaultLimits = structuredClone(d.default_limits);
  if (isJsonObject(d.profile_limits)) {
    for (const [pid, v] of Object.entries(d.profile_limits)) {
      if (isJsonObject(v)) s.profileLimits[pid] = structuredClone(v);
    }
  }
  if (isJsonObject(d.weekly_days)) {
    for (const [pid, v] of Object.entries(d.weekly_days)) {
      const days = asInt(v, 0);
      if (days >= 1 && days <= 7) s.weeklyDays[pid] = days;
    }
  }
  s.values = valuesFromDict(d.values);
  return s;
}

// --------------------------------------------------------------------- PIN

export interface PinCheck {
  ok: boolean;
  locked: boolean;
  attemptsLeft: number;
  retryAfterS: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * PBKDF2-HMAC-SHA256 of the PIN, 32 bytes as hex: the same value
 * Python's `hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, n).hex()` gives.
 */
export async function hashPin(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

/**
 * Compares two strings in time that depends only on their length, so a
 * wrong PIN does not tell how many characters of the hash matched.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  // Past the end of b, charCodeAt gives NaN, which `^` treats as 0.
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkFormat(pin: unknown): asserts pin is string {
  const ok =
    typeof pin === "string" && /^[0-9]+$/.test(pin) && pin.length >= PIN_MIN_LEN && pin.length <= PIN_MAX_LEN;
  if (!ok) throw new PinError(`PIN must be ${PIN_MIN_LEN}-${PIN_MAX_LEN} digits`);
}

function randomSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  return salt;
}

// --------------------------------------------------------------------- gate

/**
 * The quick parent gate without a PIN: a two-digit multiplication a young
 * child cannot do in their head. Not a security boundary; the PIN is.
 */
export interface GateChallenge {
  a: number;
  b: number;
  answer: number;
  promptHe: string;
  /** True when `given` (spaces allowed around it) is the answer. */
  check(given: string): boolean;
}

/** A random number in [0, 1) from the system's secure source. */
function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
}

function gateNumber(rng: () => number): number {
  for (;;) {
    const n = 12 + Math.floor(rng() * 88); // 12..99
    if (n % 10 && n % 11) return n;
  }
}

/** A new gate question; `rng` (values in [0, 1)) is for tests. */
export function makeGateChallenge(rng: () => number = secureRandom): GateChallenge {
  const a = gateNumber(rng);
  const b = gateNumber(rng);
  const answer = a * b;
  return {
    a,
    b,
    answer,
    promptHe: `כמה זה ${a} × ${b}?`,
    check(given: string): boolean {
      const g = (given ?? "").trim();
      return /^[0-9]+$/.test(g) && Number(g) === answer;
    },
  };
}

// -------------------------------------------------------------------- store

export interface ParentStoreOptions {
  /** Directory of the data root inside the file store ("" by default). */
  root?: string;
  /** Seconds since the epoch. */
  clock?: () => number;
  /** PBKDF2 iterations for new hashes; at least 200,000. */
  iterations?: number;
  /** Told when parent.json had to be recovered (the app log listens). */
  onWarning?: (message: string) => void;
}

/** parent.json and the PIN. Open it with {@link ParentStore.open}. */
export class ParentStore {
  settings: ParentSettings;
  /** True when parent.json was corrupt and a backup or defaults were used. */
  readonly recovered: boolean;
  private fs: FileStore;
  private path: string;
  private clock: () => number;
  private iterations: number;
  // PIN checks run one at a time: the attempt count must not race.
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    fs: FileStore,
    path: string,
    settings: ParentSettings,
    recovered: boolean,
    o: ParentStoreOptions,
  ) {
    this.fs = fs;
    this.path = path;
    this.settings = settings;
    this.recovered = recovered;
    this.clock = o.clock ?? (() => Date.now() / 1000);
    this.iterations = o.iterations ?? PBKDF2_ITERATIONS;
  }

  /** Loads parent.json (or the defaults); a weak iteration count throws a RangeError. */
  static async open(fs: FileStore, options: ParentStoreOptions = {}): Promise<ParentStore> {
    const iterations = options.iterations ?? PBKDF2_ITERATIONS;
    if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS) {
      throw new RangeError(`PBKDF2 needs at least ${MIN_PBKDF2_ITERATIONS} iterations`);
    }
    const path = joinPath(options.root ?? "", "parent.json");
    const res = await readJson(fs, path);
    if (res.recovered) options.onWarning?.(`parent.json recovered (${res.status})`);
    return new ParentStore(fs, path, settingsFromDict(res.data), res.recovered, options);
  }

  /** Never shows the PIN hash or salt. */
  toString(): string {
    const s = this.settings;
    return (
      `ParentStore(pin_set=${this.hasPin()}, city=${s.location.cityHe}, ` +
      `shabbat=${s.shabbatMode}, holidays=${s.holidayMode}, ai=${s.ai.provider})`
    );
  }

  toJSON(): string {
    return this.toString();
  }

  /** Writes parent.json (after any PIN check in progress). */
  save(): Promise<void> {
    return this.serial(() => this.write());
  }

  private write(): Promise<void> {
    return writeJson(this.fs, this.path, settingsToDict(this.settings));
  }

  hasPin(): boolean {
    return this.settings.pinHash !== null;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Sets the PIN (4 to 8 ASCII digits). Changing an existing PIN needs
   * the current one; a wrong current PIN counts as a wrong attempt.
   */
  setPin(pin: string, { current }: { current?: string } = {}): Promise<void> {
    return this.serial(async () => {
      checkFormat(pin);
      if (this.hasPin() && (current === undefined || !(await this.verifyNow(current)).ok)) {
        throw new PinError("the current PIN is required");
      }
      const salt = randomSalt();
      const s = this.settings;
      s.pinSalt = bytesToHex(salt);
      s.pinIterations = this.iterations;
      s.pinHash = await hashPin(pin, salt, this.iterations);
      s.failedAttempts = 0;
      s.lockedUntil = 0;
      await this.write();
    });
  }

  /** Seconds until the lock ends (0 when not locked). */
  lockoutRemaining(): Promise<number> {
    return this.serial(() => this.lockoutNow());
  }

  private async lockoutNow(): Promise<number> {
    const s = this.settings;
    const now = this.clock();
    if (s.lockedUntil - now > LOCKOUT_SECONDS) {
      // The clock moved back: never lock longer than the full period.
      s.lockedUntil = now + LOCKOUT_SECONDS;
      await this.write();
    }
    return Math.max(0, s.lockedUntil - now);
  }

  /**
   * Checks a PIN. Five wrong tries lock it for 60 s, and while locked even
   * the right PIN is refused. A right PIN saved with fewer iterations is
   * hashed again with the current count.
   */
  verifyPin(pin: string): Promise<PinCheck> {
    return this.serial(() => this.verifyNow(pin));
  }

  private async verifyNow(pin: string): Promise<PinCheck> {
    const s = this.settings;
    if (!this.hasPin()) return { ok: false, locked: false, attemptsLeft: 0, retryAfterS: 0 };
    const remaining = await this.lockoutNow();
    if (remaining > 0) return { ok: false, locked: true, attemptsLeft: 0, retryAfterS: remaining };
    if (s.lockedUntil) {
      // The lock is over: a fresh set of tries.
      s.lockedUntil = 0;
      s.failedAttempts = 0;
    }
    const candidate = typeof pin === "string" ? pin : "";
    const hash = await hashPin(candidate, hexToBytes(s.pinSalt ?? ""), s.pinIterations);
    if (constantTimeEqual(hash, s.pinHash ?? "")) {
      s.failedAttempts = 0;
      if (s.pinIterations < this.iterations) {
        const salt = randomSalt();
        s.pinSalt = bytesToHex(salt);
        s.pinIterations = this.iterations;
        s.pinHash = await hashPin(candidate, salt, this.iterations);
      }
      await this.write();
      return { ok: true, locked: false, attemptsLeft: MAX_ATTEMPTS, retryAfterS: 0 };
    }
    s.failedAttempts += 1;
    if (s.failedAttempts >= MAX_ATTEMPTS) {
      s.lockedUntil = this.clock() + LOCKOUT_SECONDS;
      await this.write();
      return { ok: false, locked: true, attemptsLeft: 0, retryAfterS: LOCKOUT_SECONDS };
    }
    await this.write();
    return { ok: false, locked: false, attemptsLeft: MAX_ATTEMPTS - s.failedAttempts, retryAfterS: 0 };
  }
}
