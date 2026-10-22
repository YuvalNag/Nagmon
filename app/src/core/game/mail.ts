/**
 * The mail (docs/app/WORLD_V2.md 8 and 8.1): the post box at home and the
 * PC's Mail tab. One daily postcard from a rotating sender among the
 * people the child knows (a verbatim fact, sometimes a small gift);
 * event letters (thanks from a helped neighbour, a quest letter) arrive
 * the NEXT morning. Pure functions over the world's save; the phone's
 * local day is passed in.
 *
 * - at most 1 postcard and 3 event letters a day; 30 letters are kept
 *   (the oldest read ones fall off first, a letter with a gift not yet
 *   taken is kept as long as anything else can go);
 * - 1 postcard in 4 carries a small gift, at most 20 coins a week come
 *   from mail, and a gift is taken once;
 * - nothing is bought here and nothing is taken away.
 *
 * The letters are authored (`mods/nagmon/mail/letters.yaml`, shipped as
 * game/mail.json), three variants each; a variant never repeats the one
 * the same letter had last. No child name or free text is saved: a letter
 * is its id and variant, and the name is put in when it is read.
 */
import type { WorldState } from "../world/worldState";
import { dayNumber, hashOf, weekOf } from "./dayPick";
import type { Economy } from "./items";
import { grant, type Prize } from "./loot";

export const MAIL_KEEP = 30;
export const EVENT_PER_DAY = 3;
export const GIFT_ONE_IN = 4;
export const COINS_PER_WEEK = 20;
/** Event letters waiting for the next morning (a bound, so a loop elsewhere cannot fill the save). */
export const PENDING_MAX = 12;

export interface Gift {
  coins?: number;
  item?: string;
  n?: number;
}

export interface MailItem {
  /** Unique on this phone: day, letter and a counter. */
  uid: string;
  /** The authored letter (game/mail.json). */
  id: string;
  /** Which of its variants. */
  v: number;
  /** The sender's slug. */
  from: string;
  kind: "postcard" | "event";
  /** The day it arrived. */
  day: string;
  read: boolean;
  claimed: boolean;
  gift?: Gift;
}

export interface MailSave {
  items: MailItem[];
  /** The day the last postcard came: one a day. */
  lastPostcard: string | null;
  /** Event letters on their way: they arrive on a day after `after`. */
  pending: { id: string; after: string }[];
  /** How many event letters came today. */
  eventsToday: { day: string; n: number } | null;
  /** Coins taken from mail this week. */
  coinWeek: { week: number; coins: number } | null;
  /** A counter for unique ids. */
  serial: number;
}

export const noMail = (): MailSave => ({ items: [], lastPostcard: null, pending: [], eventsToday: null, coinWeek: null, serial: 0 });

export const mailIsEmpty = (m: MailSave): boolean => !m.items.length && !m.lastPostcard && !m.pending.length && !m.eventsToday && !m.coinWeek;

export interface Variant {
  text: string;
  /** A fact of the base the letter carries verbatim. */
  fact: string | null;
  /** A letter that may carry a recall question about its fact. */
  recall: boolean;
  gift: Gift | null;
}

export interface Letter {
  id: string;
  from: string;
  kind: "postcard" | "event";
  variants: Variant[];
}

export interface Sender {
  slug: string;
  name: string;
  /** Known from the start (the owl), else the child must have met them. */
  always: boolean;
  /** A picture code from the emoji set (the portrait stand-in). */
  emoji: string;
}

export interface MailData {
  senders: Record<string, Sender>;
  letters: Record<string, Letter>;
  /** The small gifts a postcard may carry. */
  gifts: Gift[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function gift(v: unknown): Gift | null {
  const r = rec(v);
  if (typeof r["coins"] === "number" && r["coins"] >= 1) return { coins: Math.trunc(r["coins"]) };
  if (typeof r["item"] === "string" && r["item"]) return { item: r["item"], n: typeof r["n"] === "number" && r["n"] >= 1 ? Math.trunc(r["n"]) : 1 };
  return null;
}

/** From the parsed game/mail.json; a letter with no text, or from nobody, is left out. */
export function mailData(doc: unknown): MailData {
  const d = rec(doc);
  const senders: Record<string, Sender> = {};
  for (const [slug, raw] of Object.entries(rec(d["senders"]))) {
    const s = rec(raw);
    if (str(s["name_he"])) senders[slug] = { slug, name: str(s["name_he"]), always: s["always"] === true, emoji: str(s["emoji"]) || "2709" };
  }
  const letters: Record<string, Letter> = {};
  for (const [id, raw] of Object.entries(rec(d["letters"]))) {
    const l = rec(raw);
    const kind = l["kind"] === "event" ? "event" : "postcard";
    const variants = (Array.isArray(l["variants"]) ? l["variants"] : []).flatMap((x): Variant[] => {
      const v = rec(x);
      return str(v["text_he"]) ? [{ text: str(v["text_he"]), fact: str(v["fact"]) || null, recall: v["recall"] === true, gift: gift(v["gift"]) }] : [];
    });
    if (senders[str(l["from"])] && variants.length) letters[id] = { id, from: str(l["from"]), kind, variants };
  }
  const gifts = (Array.isArray(d["gifts"]) ? d["gifts"] : []).flatMap((g) => gift(g) ?? []);
  return { senders, letters, gifts };
}

function parseGift(v: unknown): Gift | undefined {
  return gift(v) ?? undefined;
}

/** A saved mail box; whatever cannot be read is dropped. */
export function parseMail(v: unknown): MailSave {
  const m = noMail();
  const r = rec(v);
  for (const raw of Array.isArray(r["items"]) ? r["items"] : []) {
    const i = rec(raw);
    if (!str(i["uid"]) || !str(i["id"]) || !str(i["from"]) || !str(i["day"])) continue;
    const item: MailItem = {
      uid: str(i["uid"]),
      id: str(i["id"]),
      v: typeof i["v"] === "number" && i["v"] >= 0 ? Math.trunc(i["v"]) : 0,
      from: str(i["from"]),
      kind: i["kind"] === "event" ? "event" : "postcard",
      day: str(i["day"]),
      read: i["read"] === true,
      claimed: i["claimed"] === true,
    };
    const g = parseGift(i["gift"]);
    if (g) item.gift = g;
    m.items.push(item);
  }
  m.items = m.items.slice(-MAIL_KEEP);
  m.lastPostcard = str(r["lastPostcard"]) || null;
  for (const raw of (Array.isArray(r["pending"]) ? r["pending"] : []).slice(0, PENDING_MAX)) {
    const p = rec(raw);
    if (str(p["id"]) && str(p["after"])) m.pending.push({ id: str(p["id"]), after: str(p["after"]) });
  }
  const e = rec(r["eventsToday"]);
  if (str(e["day"]) && typeof e["n"] === "number") m.eventsToday = { day: str(e["day"]), n: Math.max(0, Math.trunc(e["n"])) };
  const w = rec(r["coinWeek"]);
  if (typeof w["week"] === "number" && typeof w["coins"] === "number") m.coinWeek = { week: Math.trunc(w["week"]), coins: Math.max(0, Math.trunc(w["coins"])) };
  m.serial = typeof r["serial"] === "number" && r["serial"] >= 0 ? Math.trunc(r["serial"]) : m.items.length;
  return m;
}

/** The people the child may get a postcard from: always-known ones, and those met. */
export function knownSenders(world: WorldState, data: MailData): Sender[] {
  return Object.values(data.senders)
    .filter((s) => s.always || world.met[s.slug] !== undefined)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

/** The variant of a letter to send now: by the day, never the one this letter had last. */
function variantFor(world: WorldState, letter: Letter, today: string): number {
  const n = letter.variants.length;
  const last = [...world.mail.items].reverse().find((i) => i.id === letter.id)?.v;
  let v = hashOf(`${letter.id}:${today}`) % n;
  if (n > 1 && v === last) v = (v + 1) % n;
  return v;
}

/** The week's coins taken from mail so far. */
export function coinsThisWeek(world: WorldState, today: string): number {
  const w = world.mail.coinWeek;
  return w && w.week === weekOf(today) ? w.coins : 0;
}

/** Whether a postcard of this day carries a gift (1 in 4, by the date), and which of the pool. */
export function dayGift(data: MailData, today: string): Gift | null {
  if (!data.gifts.length || hashOf(`gift:${today}`) % GIFT_ONE_IN !== 0) return null;
  return data.gifts[hashOf(`gift-pick:${today}`) % data.gifts.length]!;
}

function add(world: WorldState, letter: Letter, v: number, today: string, g: Gift | null): MailItem {
  const m = world.mail;
  m.serial += 1;
  const item: MailItem = { uid: `${today}:${letter.id}:${m.serial}`, id: letter.id, v, from: letter.from, kind: letter.kind, day: today, read: false, claimed: false };
  if (g) item.gift = { ...g };
  m.items.push(item);
  return item;
}

/** Drops the oldest letters over the limit: read ones with nothing left to take first. */
function trim(world: WorldState): void {
  const m = world.mail;
  while (m.items.length > MAIL_KEEP) {
    const order = [
      (i: MailItem) => i.read && (!i.gift || i.claimed),
      (i: MailItem) => i.read,
      () => true,
    ];
    let at = -1;
    for (const test of order) {
      at = m.items.findIndex(test);
      if (at >= 0) break;
    }
    m.items.splice(at, 1);
  }
}

/** Queues an event letter: it arrives on a day after `today` (the next morning). False for an unknown letter. */
export function queueEvent(world: WorldState, data: MailData, id: string, today: string): boolean {
  const letter = data.letters[id];
  if (!letter || letter.kind !== "event") return false;
  const m = world.mail;
  if (m.pending.length >= PENDING_MAX || m.pending.some((p) => p.id === id && p.after === today)) return false;
  m.pending.push({ id, after: today });
  return true;
}

/**
 * What arrives by `today`: the day's postcard (once) and the event
 * letters queued on an earlier day (up to 3 a day; the rest wait for the
 * next morning). Safe to call as often as wanted. Returns the new letters.
 */
export function deliver(world: WorldState, data: MailData, today: string): MailItem[] {
  const m = world.mail;
  const arrived: MailItem[] = [];
  // event letters first: they were promised
  if (!m.eventsToday || m.eventsToday.day !== today) m.eventsToday = { day: today, n: 0 };
  const keep: typeof m.pending = [];
  for (const p of m.pending) {
    const letter = data.letters[p.id];
    if (!letter) continue;
    if (dayNumber(p.after) < dayNumber(today) && m.eventsToday.n < EVENT_PER_DAY) {
      m.eventsToday.n += 1;
      const v = variantFor(world, letter, today);
      arrived.push(add(world, letter, v, today, letter.variants[v]!.gift));
    } else keep.push(p);
  }
  m.pending = keep;
  if (m.lastPostcard !== today) {
    const senders = knownSenders(world, data);
    const postcards = senders.flatMap((s) => Object.values(data.letters).filter((l) => l.kind === "postcard" && l.from === s.slug));
    if (postcards.length) {
      const letter = postcards[dayNumber(today) % postcards.length]!;
      const v = variantFor(world, letter, today);
      m.lastPostcard = today;
      arrived.push(add(world, letter, v, today, letter.variants[v]!.gift ?? dayGift(data, today)));
    }
  }
  trim(world);
  return arrived;
}

/** Letters not read yet (the flag on the post box). */
export const unreadCount = (world: WorldState): number => world.mail.items.filter((i) => !i.read).length;

/** Newest first. */
export const inbox = (world: WorldState): MailItem[] => [...world.mail.items].reverse();

export function markRead(world: WorldState, uid: string): boolean {
  const i = world.mail.items.find((x) => x.uid === uid);
  if (!i || i.read) return false;
  i.read = true;
  return true;
}

export interface Taken {
  taken: boolean;
  prize?: Prize;
}

/**
 * Takes the gift of a letter, once. Coins are held to {@link COINS_PER_WEEK}
 * a week from mail: over it the gift becomes the first item of the pool,
 * so nobody opens a letter and finds nothing.
 */
export function claimGift(world: WorldState, eco: Economy, data: MailData, uid: string, today: string): Taken {
  const i = world.mail.items.find((x) => x.uid === uid);
  if (!i || !i.gift || i.claimed) return { taken: false };
  let g: Gift = i.gift;
  if (g.coins) {
    const left = COINS_PER_WEEK - coinsThisWeek(world, today);
    if (left < g.coins) {
      const instead = data.gifts.find((x) => x.item && eco.items[x.item]);
      if (!instead) return { taken: false };
      g = instead;
    }
  }
  const got = grant(world, eco, g.item ? { coins: 0, item: g.item, n: g.n ?? 1 } : { coins: g.coins ?? 0, item: null, n: 0 });
  i.claimed = true;
  if (got.coins) {
    const week = weekOf(today);
    const w = world.mail.coinWeek && world.mail.coinWeek.week === week ? world.mail.coinWeek : { week, coins: 0 };
    w.coins += got.coins;
    world.mail.coinWeek = w;
  }
  return { taken: true, prize: got };
}
