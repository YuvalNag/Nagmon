import type { CSSProperties } from "react";
import { itemIconStyle } from "../game/icons";

/**
 * The picture of a shop item: its icon of the icon sheet (art/icons.json),
 * or the emoji of the data when the item has none or the sheet is not usable.
 * It is as big as the text round it (`1.15em`), so it takes the place of the emoji.
 */
export function ItemIcon({ id, emoji }: { id: string; emoji: string }) {
  const icon = itemIconStyle(id, "1.15em");
  if (!icon) return <>{emoji}</>;
  return <span className="item-icon" aria-hidden="true" data-art={icon.id} data-frame={icon.frame} style={{ display: "inline-block", ...(icon.style as CSSProperties) }} />;
}
