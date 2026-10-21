/**
 * The parents' switch for the shop's quick buy, kept in the child's
 * settings (`settings.shop.quick_buy`). On by default: a child who has
 * mastered money may skip the pay step. Anything unreadable reads as on.
 */
import type { JsonObject } from "../../platform/storage";

function isDict(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function quickBuyAllowed(settings: unknown): boolean {
  const shop = isDict(settings) ? settings["shop"] : undefined;
  return isDict(shop) && typeof shop["quick_buy"] === "boolean" ? shop["quick_buy"] : true;
}

/** The settings with the quick buy turned on or off; the rest stays as it is. */
export function withQuickBuy(settings: JsonObject, on: boolean): JsonObject {
  const shop = isDict(settings["shop"]) ? settings["shop"] : {};
  return { ...settings, shop: { ...shop, quick_buy: on } };
}
