/**
 * Where the family lives, for candle lighting and the end of Shabbat
 * (the `Location` of nagmon/family/calendar.py; the calendar itself is
 * ported in M8).
 */
import { type JsonObject, isJsonObject } from "../../platform/storage";

export interface Location {
  lat: number;
  lon: number;
  /** An IANA time zone, e.g. "Asia/Jerusalem". */
  tz: string;
  cityHe: string;
  /** Candles are lit this many minutes before sunset (0..90). */
  candleMinutes: number;
  /** Tzeit (the end of Shabbat): the sun this many degrees below the horizon. */
  tzeitDegrees: number;
  /** Or a fixed number of minutes after sunset. */
  tzeitFixedMinutes: number | null;
}

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a location and checks it; throws a RangeError on bad values.
 */
export function makeLocation(
  lat: number,
  lon: number,
  tz: string,
  cityHe: string,
  candleMinutes = 18,
  tzeitDegrees = 8.5,
  tzeitFixedMinutes: number | null = null,
): Location {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError("lat out of range");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new RangeError("lon out of range");
  if (!isTimeZone(tz)) throw new RangeError(`unknown time zone ${JSON.stringify(tz)}`);
  if (!Number.isInteger(candleMinutes) || candleMinutes < 0 || candleMinutes > 90) {
    throw new RangeError("candle_minutes out of range");
  }
  if (!Number.isFinite(tzeitDegrees)) throw new RangeError("tzeit_degrees out of range");
  if (tzeitFixedMinutes !== null && !Number.isInteger(tzeitFixedMinutes)) {
    throw new RangeError("tzeit_fixed_minutes must be whole minutes");
  }
  return { lat, lon, tz, cityHe, candleMinutes, tzeitDegrees, tzeitFixedMinutes };
}

const IL = "Asia/Jerusalem";

/** Cities with their custom for candle lighting (coordinates as hebcal.com uses). */
export const LOCATION_PRESETS = {
  jerusalem: makeLocation(31.76904, 35.21633, IL, "ירושלים", 40),
  haifa: makeLocation(32.81841, 34.9885, IL, "חיפה", 30),
  petah_tikva: makeLocation(32.08707, 34.88747, IL, "פתח תקווה", 20),
  tel_aviv: makeLocation(32.08088, 34.78057, IL, "תל אביב", 18),
  bnei_brak: makeLocation(32.08074, 34.8338, IL, "בני ברק", 18),
  beer_sheva: makeLocation(31.25181, 34.7913, IL, "באר שבע", 18),
  modiin: makeLocation(31.89385, 35.01504, IL, "מודיעין", 18),
  beit_shemesh: makeLocation(31.73072, 34.99293, IL, "בית שמש", 18),
  ashdod: makeLocation(31.79213, 34.64966, IL, "אשדוד", 18),
  netanya: makeLocation(32.33291, 34.85992, IL, "נתניה", 18),
} as const satisfies Record<string, Location>;

export type PresetKey = keyof typeof LOCATION_PRESETS;

/** A copy of a preset; throws a RangeError for an unknown key. */
export function locationPreset(key: string): Location {
  if (!Object.hasOwn(LOCATION_PRESETS, key)) throw new RangeError(`unknown city ${key}`);
  return { ...LOCATION_PRESETS[key as PresetKey] };
}

/** The location as the old files hold it. */
export function locationToDict(l: Location): JsonObject {
  return {
    lat: l.lat,
    lon: l.lon,
    tz: l.tz,
    city_he: l.cityHe,
    candle_minutes: l.candleMinutes,
    tzeit_degrees: l.tzeitDegrees,
    tzeit_fixed_minutes: l.tzeitFixedMinutes,
  };
}

/** A location from a saved dict; throws a RangeError on bad data. */
export function locationFromDict(d: unknown): Location {
  if (!isJsonObject(d)) throw new RangeError("location must be an object");
  const num = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
  const { lat, lon, tz, city_he, candle_minutes, tzeit_degrees, tzeit_fixed_minutes } = d;
  if (typeof tz !== "string" || typeof city_he !== "string") throw new RangeError("bad location");
  return makeLocation(
    num(lat),
    num(lon),
    tz,
    city_he,
    candle_minutes === undefined ? 18 : num(candle_minutes),
    tzeit_degrees === undefined ? 8.5 : num(tzeit_degrees),
    tzeit_fixed_minutes === undefined || tzeit_fixed_minutes === null ? null : num(tzeit_fixed_minutes),
  );
}
