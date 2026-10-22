/**
 * The Bag and the economy (docs/app/FEATURES.md 4.2 and 4.3). The table
 * of items and prices is `mods/nagmon/economy/items.yaml`, shipped as
 * game/economy.json; the counts are the child's, in world.json.
 *
 * - No item is lost by a wrong answer; nothing is sold; a stack holds 99.
 * - Snacks and tonics are used outside a battle, on a friend; nets and
 *   helpers inside one (capture.ts, core/world/quiz.ts).
 * - Never stuck: with no net at all, the owl gives one a day.
 */
import { addItemText } from "../../i18n";
import { countOneMore, countToday, type WorldState } from "../world/worldState";
import { giveXp, type Growth } from "./collection";

export type ItemKind = "net" | "befriend_tool" | "snack" | "tonic" | "medicine" | "helper" | "key" | "evolution_card";
export type CardKind = "zone" | "subject" | "bright" | "rainbow";
export type HelperKind = "hint" | "fifty" | "pass";

export interface Item {
  id: string;
  tab: string;
  kind: ItemKind;
  /** Coins in the shop (0 for key items). */
  price: number;
  /** A picture character; the name and the words are in i18n (item_<id>_name, item_<id>_desc). */
  icon: string;
  /** A net: how many seal answers it saves (a silver net, one). */
  sealLess: number;
  /** A snack: hearts and growth points. */
  hearts: number;
  xp: number;
  /** A tonic: how many right answers grow twice as fast. */
  boostAnswers: number;
  helper: HelperKind | null;
  /** The shop shelf the data names (medicine has its own), or null. */
  shelf: string | null;
  /** Medicine: what it does (heal_pep, wake, cleanse, refill_charges), the share of Pep it gives, and whether it wakes a friend who fell asleep. */
  effect: string | null;
  healShare: number;
  healsDozing: boolean;
  /** A net or a card (BATTLE_V3 8.4): the multiplier of the befriend chance (1 for everything else). */
  toolMult: number;
  /** A snack as a treat in the Befriend tray: its multiplier (1 when it is not a treat). */
  treatMult: number;
  /** A friendship card: it counts on every creature ("any"), those of one subject, or those native to one zone. */
  scope: "any" | "subject" | "zone" | null;
  scopeId: string | null;
  /** The Star Net: the first shake never fails. */
  firstShakeSafe: boolean;
  /** False: not on any shelf (Star Net, the Rainbow Card); it comes from rewards. */
  forSale: boolean;
  /** The data's progress gate for the shop ("keeper:1", "guardian:moon", "guardians:3"), or null. */
  soldAfter: string | null;
  /** An Evolution Card (BATTLE_V3 7.2): which kind, the stage it evolves from (a number, or any), and the lowest level it works at (Rainbow). */
  card: CardKind | null;
  fromStage: number | "any" | null;
  minLevel: number;
}

export interface Economy {
  tabs: string[];
  items: Record<string, Item>;
  /** Item ids in the table's order. */
  order: string[];
  stack: number;
  starterKit: Record<string, number>;
  spare: { item: string; perDay: number };
  sealCoins: number;
}

const KINDS = new Set(["net", "befriend_tool", "snack", "tonic", "medicine", "helper", "key", "evolution_card"]);
const CARDS = new Set(["zone", "subject", "bright", "rainbow"]);
const HELPERS = new Set(["hint", "fifty", "pass"]);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : d);
/** A multiplier: a finite number from 1 to 3 (anything else is 1). */
const mult = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 3 ? v : 1);

/** From the parsed game/economy.json; an item with unreadable fields is left out. */
export function economy(doc: unknown): Economy {
  const d = (typeof doc === "object" && doc !== null ? doc : {}) as Record<string, unknown>;
  const items: Record<string, Item> = {};
  const order: string[] = [];
  const list = Array.isArray(d["items"]) ? d["items"] : [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r["id"] !== "string" || typeof r["tab"] !== "string" || typeof r["icon"] !== "string" || !KINDS.has(String(r["kind"]))) continue;
    items[r["id"]] = {
      id: r["id"],
      tab: r["tab"],
      kind: r["kind"] as ItemKind,
      price: num(r["price"]),
      icon: r["icon"],
      sealLess: num(r["seal_less"]),
      hearts: num(r["hearts"]),
      xp: num(r["xp"]),
      boostAnswers: num(r["boost_answers"]),
      helper: HELPERS.has(String(r["helper"])) ? (r["helper"] as HelperKind) : null,
      shelf: typeof r["shelf"] === "string" ? r["shelf"] : null,
      effect: typeof r["effect"] === "string" ? r["effect"] : null,
      healShare: typeof r["heal_share"] === "number" ? Math.max(0, Math.min(1, r["heal_share"])) : 0,
      healsDozing: r["heals_dozing"] === true,
      toolMult: mult(r["tool_mult"]),
      treatMult: mult(r["treat_mult"]),
      scope: r["scope"] === "any" || r["scope"] === "subject" || r["scope"] === "zone" ? r["scope"] : null,
      scopeId: typeof r["scope_id"] === "string" ? r["scope_id"] : null,
      firstShakeSafe: r["first_shake_never_fails"] === true,
      forSale: r["sold"] !== false,
      soldAfter: typeof r["sold_after"] === "string" ? r["sold_after"] : null,
      card: CARDS.has(String(r["card"])) ? (r["card"] as CardKind) : null,
      fromStage: r["from_stage"] === "any" ? "any" : typeof r["from_stage"] === "number" ? Math.trunc(r["from_stage"]) : null,
      minLevel: num(r["min_level"]),
    };
    // the data's own words for an item with no entry in the texts (the medicine of the new battle)
    if (typeof r["name_he"] === "string") addItemText(r["id"], r["name_he"], typeof r["desc_he"] === "string" ? r["desc_he"] : "");
    order.push(r["id"]);
  }
  const kit: Record<string, number> = {};
  const rawKit = d["starter_kit"];
  if (typeof rawKit === "object" && rawKit !== null) for (const [k, v] of Object.entries(rawKit)) if (items[k]) kit[k] = num(v);
  const spare = (d["spare_net"] ?? {}) as Record<string, unknown>;
  return {
    tabs: Array.isArray(d["tabs"]) ? d["tabs"].map(String) : [],
    items,
    order,
    stack: Math.max(1, num(d["stack_limit"], 99)),
    starterKit: kit,
    spare: { item: typeof spare["item"] === "string" ? spare["item"] : "", perDay: num(spare["per_day"], 1) },
    sealCoins: num(d["seal_coins"]),
  };
}

export const countOf = (world: WorldState, id: string): number => world.items.get(id) ?? 0;

/** Adds items up to the stack limit; returns how many went in (an unknown item: none). */
export function give(world: WorldState, eco: Economy, id: string, n = 1): number {
  if (!eco.items[id] || n < 1) return 0;
  const have = countOf(world, id);
  const added = Math.max(0, Math.min(Math.trunc(n), eco.stack - have));
  if (added) world.items.set(id, have + added);
  return added;
}

/** Uses up items; false (and nothing taken) when there are not enough. */
export function take(world: WorldState, id: string, n = 1): boolean {
  const have = countOf(world, id);
  if (n < 1 || have < n) return false;
  if (have === n) world.items.delete(id);
  else world.items.set(id, have - n);
  return true;
}

/** The items of a tab that the child has, in the table's order. */
export function itemsInTab(world: WorldState, eco: Economy, tab: string): Item[] {
  return eco.order.map((id) => eco.items[id]!).filter((i) => i.tab === tab && countOf(world, i.id) > 0);
}

const KIT = "nagmon_kit";

/** The first nets, once. False when they were given before. */
export function giveStarterKit(world: WorldState, eco: Economy): boolean {
  if (world.variables.has(KIT)) return false;
  world.variables.set(KIT, "yes");
  for (const [id, n] of Object.entries(eco.starterKit)) give(world, eco, id, n);
  return true;
}

/** True when the child has no net of any kind. */
export function noNets(world: WorldState, eco: Economy): boolean {
  return !Object.values(eco.items).some((i) => i.kind === "net" && countOf(world, i.id) > 0);
}

/** The owl's spare net: only with no net at all, and a few times a day. Returns the item given. */
export function claimSpareNet(world: WorldState, eco: Economy, today: string): Item | null {
  const item = eco.items[eco.spare.item];
  if (!item || !noNets(world, eco) || countToday(world.variables, "spare_net", today) >= eco.spare.perDay) return null;
  if (!give(world, eco, item.id, 1)) return null;
  countOneMore(world.variables, "spare_net", today);
  return item;
}

export interface Fed {
  ok: boolean;
  growth: Growth | null;
}

const BOOST = "nagmon_growth_boost";

/** Right answers left that grow twice as fast. */
export function boostLeft(world: WorldState): number {
  return num(Number(world.variables.get(BOOST)));
}

/** One right answer's growth factor: 2 while a tonic lasts (and one is used), else 1. */
export function spendBoost(world: WorldState): number {
  const left = boostLeft(world);
  if (left < 1) return 1;
  world.variables.set(BOOST, String(left - 1));
  return 2;
}

/**
 * A snack or a tonic for a friend, outside a battle. Refused (nothing
 * used up) for an item not in the Bag, one that is not for eating, an
 * unknown friend, or a tonic while one is still working.
 */
export function feed(world: WorldState, eco: Economy, creatureId: string, itemId: string): Fed {
  const item = eco.items[itemId];
  const c = world.creatures.find((x) => x.id === creatureId);
  const no: Fed = { ok: false, growth: null };
  if (!item || !c || countOf(world, itemId) < 1) return no;
  if (item.kind === "snack") {
    take(world, itemId);
    c.hearts = Math.min(5, (c.hearts ?? 0) + item.hearts);
    return { ok: true, growth: giveXp(world, c.id, item.xp) };
  }
  if (item.kind === "tonic") {
    if (boostLeft(world) > 0) return no;
    take(world, itemId);
    world.variables.set(BOOST, String(item.boostAnswers));
    return { ok: true, growth: null };
  }
  return no;
}
