import { describe, expect, it } from "vitest";
import { quickBuyAllowed, withQuickBuy } from "../../../src/core/family/shopSettings";

describe("the parents' switch for the shop's quick buy", () => {
  it("is on by default, and a bad value reads as on", () => {
    expect(quickBuyAllowed({})).toBe(true);
    expect(quickBuyAllowed(undefined)).toBe(true);
    expect(quickBuyAllowed({ shop: "x" })).toBe(true);
    expect(quickBuyAllowed({ shop: { quick_buy: "no" } })).toBe(true);
  });

  it("is turned off and on, and the rest of the settings stays", () => {
    const off = withQuickBuy({ learning: { timer: true }, effects: { sound: false } }, false);
    expect(off).toEqual({ learning: { timer: true }, effects: { sound: false }, shop: { quick_buy: false } });
    expect(quickBuyAllowed(off)).toBe(false);
    expect(quickBuyAllowed(withQuickBuy(off, true))).toBe(true);
  });
});
