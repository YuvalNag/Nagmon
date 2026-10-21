/**
 * The shop (docs/app/FEATURES.md 4.3): three shelves, and a purchase
 * that is a small lesson in money. Pure logic; ui/ShopScreen.tsx draws it.
 *
 * - Prices come from the economy table (mods/nagmon/economy/items.yaml).
 * - The pay step shows the price and the child makes it from coins:
 *   A (grades 0-1) counts up to ten with stacks of 1 and 5, B (2-4)
 *   makes the exact price from coins and bills, C (5+) pays the day's
 *   "10% off" price.
 * - A wrong amount is "a bit more" or "a bit less", counted aloud; after
 *   two wrong tries the shopkeeper counts with the child. Nobody is
 *   blocked and nobody pays more than the price on the shelf.
 * - An exact pile in A and B, with nobody's help, gives a tenth back
 *   (a wrong try before costs nothing).
 */
import type { WorldState } from "../world/worldState";
import { countOf, type Economy, give, type Item } from "./items";

export type Band = "A" | "B" | "C";
export type Shelf = "nets" | "snacks" | "helpers" | "medicine";

/** The three shelves, in the order the shop shows them. */
export const SHELVES: readonly Shelf[] = ["nets", "snacks", "helpers", "medicine"];
/** Items on a shelf at a time. */
export const SHELF_SIZE = 6;
export const DISCOUNT_PERCENT = 10;
/** Wrong tries before the shopkeeper counts with the child. */
export const HELP_AFTER = 2;
/** Exact first-try payments in a row that show the quick buy. */
export const RUN_FOR_QUICK = 5;

export const bandOf = (grade: number): Band => (grade <= 1 ? "A" : grade <= 4 ? "B" : "C");

export function shelfOf(item: Item): Shelf | null {
  if (item.price <= 0) return null;
  // the data says where medicine sits: most of it on its own shelf, a mint and an energy berry among the snacks
  if (item.kind === "medicine") return item.shelf === "snacks" ? "snacks" : "medicine";
  if (item.kind === "net") return "nets";
  if (item.kind === "snack" || item.kind === "tonic") return "snacks";
  if (item.kind === "helper") return "helpers";
  return null;
}

/** What a shelf sells, in the table's order. */
export function shelfItems(eco: Economy, shelf: Shelf): Item[] {
  return eco.order
    .map((id) => eco.items[id]!)
    .filter((i) => shelfOf(i) === shelf)
    // the youngest count to ten with stacks of at most 100, so the shop sells nothing dearer than that (All Better, 110, waits)
    .filter((i) => i.price <= 100)
    .slice(0, shelf === "medicine" ? 8 : SHELF_SIZE);
}

/** A tenth of the price, rounded down: the price is never more than listed. */
export const discountOf = (price: number): number => Math.floor((price * DISCOUNT_PERCENT) / 100);

/** The coins and bills a child can pick from. */
const COINS_B: readonly number[] = [1, 2, 5, 10, 20, 50];
const COINS_A: readonly number[] = [1, 5];
const STACK_UNITS = [1, 5, 10, 25, 50, 100];

export interface PayPlan {
  band: Band;
  /** The price on the shelf. */
  price: number;
  /** What one "1" is worth in coins (A makes big prices from bigger stacks, so it is only ever counting to ten). */
  unit: number;
  /** What the pile must add up to, in units. */
  target: number;
  denominations: readonly number[];
  /** C: the "10% off today" tag. */
  tag: { percent: number; was: number; now: number } | null;
}

export function payPlan(price: number, band: Band): PayPlan {
  if (band === "A") {
    const unit = STACK_UNITS.find((u) => price % u === 0 && price / u <= 10) ?? 1;
    return { band, price, unit, target: price / unit, denominations: COINS_A, tag: null };
  }
  if (band === "C") {
    const now = price - discountOf(price);
    return { band, price, unit: 1, target: now, denominations: COINS_B, tag: { percent: DISCOUNT_PERCENT, was: price, now } };
  }
  return { band, price, unit: 1, target: price, denominations: COINS_B, tag: null };
}

export type Verdict = { kind: "exact" | "short" | "over"; sum: number };

/** One go at paying: the pile of coins the child made, and how it went. */
export class Payment {
  pile: number[] = [];
  /** Wrong tries so far. */
  wrong = 0;
  /** The shopkeeper counted it. */
  helped = false;

  constructor(readonly plan: PayPlan) {}

  get sum(): number {
    return this.pile.reduce((n, v) => n + v, 0);
  }

  add(value: number): boolean {
    if (!this.plan.denominations.includes(value)) return false;
    this.pile.push(value);
    return true;
  }

  removeAt(i: number): void {
    this.pile.splice(i, 1);
  }

  clear(): void {
    this.pile = [];
  }

  /** The pile against the price: a wrong one is a try. */
  check(): Verdict {
    const sum = this.sum;
    const kind = sum === this.plan.target ? "exact" : sum < this.plan.target ? "short" : "over";
    if (kind !== "exact") this.wrong++;
    return { kind, sum };
  }

  /** The shopkeeper counts with the child now. */
  get helpDue(): boolean {
    return this.wrong >= HELP_AFTER;
  }

  /** The right pile, largest coins first. */
  help(): void {
    this.helped = true;
    let left = this.plan.target;
    this.pile = [];
    for (const v of [...this.plan.denominations].sort((a, b) => b - a)) {
      while (left >= v) {
        this.pile.push(v);
        left -= v;
      }
    }
  }

  /** Right on the first go, with nobody's help. */
  get firstTry(): boolean {
    return this.wrong === 0 && !this.helped;
  }
}

/** The running total as each coin of the pile is counted aloud (in the plan's units). */
export function countSteps(pile: readonly number[]): number[] {
  let n = 0;
  return pile.map((v) => (n += v));
}

export interface Way {
  band: Band;
  /** The pile was exactly the price. */
  exact: boolean;
  /** The shopkeeper counted it. */
  helped: boolean;
  /** Bought with the quick button, no pay step. */
  quick: boolean;
}

export interface Bought {
  ok: boolean;
  /** Coins taken: never more than the price on the shelf. */
  charged: number;
  /** The tenth given back for an exact first try. */
  back: number;
  reason?: "unknown" | "coins" | "full";
}

/** What the child must have in the wallet to start paying. */
export const startPrice = (item: Item, band: Band): number => (band === "C" ? item.price - discountOf(item.price) : item.price);

export function affordable(world: WorldState, item: Item, band: Band): boolean {
  return world.money >= startPrice(item, band);
}

/** What this way of paying costs. */
export function chargeFor(item: Item, way: Way): { charged: number; back: number } {
  const d = discountOf(item.price);
  if (way.band === "C") return { charged: item.price - d, back: 0 };
  if (way.exact && !way.helped && !way.quick) return { charged: item.price - d, back: d };
  return { charged: item.price, back: 0 };
}

/** Takes the coins and puts the item in the Bag, or does neither. */
export function buy(world: WorldState, eco: Economy, id: string, way: Way): Bought {
  const item = eco.items[id];
  const none = (reason: Bought["reason"]): Bought => ({ ok: false, charged: 0, back: 0, ...(reason ? { reason } : {}) });
  if (!item || shelfOf(item) === null) return none("unknown");
  if (!affordable(world, item, way.band)) return none("coins");
  if (countOf(world, id) >= eco.stack) return none("full");
  const { charged, back } = chargeFor(item, way);
  give(world, eco, id, 1);
  world.addMoney(-charged);
  return { ok: true, charged, back };
}

const SKILL: Record<Band, string> = { A: "math.money.coins", B: "math.money.change_20", C: "math.money.change" };
const RUN = "nagmon_pay_run";

/** Exact first-try payments in a row. */
export function payRun(variables: ReadonlyMap<string, string>): number {
  const n = Number(variables.get(RUN));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** After a paid pay step: the run goes on after a first-try exact payment, and starts again after any other. */
export function recordPay(variables: Map<string, string>, firstTryExact: boolean): void {
  variables.set(RUN, String(firstTryExact ? payRun(variables) + 1 : 0));
}

/** The money skill is mastered: the engine says so for the band's skill, or five exact first tries in a row. */
export function moneyMastered(mastered: ReadonlyMap<string, number>, band: Band, variables: ReadonlyMap<string, string>): boolean {
  return mastered.has(SKILL[band]) || payRun(variables) >= RUN_FOR_QUICK;
}
