import type { ReactNode } from "react";
import type { Economy } from "../core/game/items";
import { EGG_ITEM, type Prize } from "../core/game/loot";
import { itemText, t } from "../i18n";
import { CoinIcon, EggArt } from "./WorldArt";

/** What a prize looks like and says: coins, an item, or the egg. */
export function prizeLook(eco: Economy, p: Prize): { icon: ReactNode; words: string } {
  if (p.item) {
    const name = itemText(p.item, "name");
    const words = p.n > 1 ? t("restCoinsItem", { n: p.n, name }) : name;
    if (p.item === EGG_ITEM) return { icon: <EggArt />, words };
    return { icon: <span className="prize-glyph">{eco.items[p.item]?.icon ?? "🎁"}</span>, words };
  }
  return { icon: <CoinIcon className="prize-coin" />, words: t("restCoins", { n: p.coins }) };
}
