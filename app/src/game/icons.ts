/**
 * The item and UI icons, read without the art manifest (that is a lazy
 * chunk; the shop's and the bag's icons are on screens the map opens at
 * once). art/icons.json is written by tools/app/art3.py with the manifest.
 */
import icons from "../../public/game/art/icons.json";
import { artFile } from "./artSource";

interface Sheet {
  file: string;
  frame: number[];
  cols: number;
  rows: number;
  status: string;
}

const data = icons as unknown as {
  drafts_enabled: boolean;
  sheets: Record<string, Sheet>;
  items: Record<string, { asset: string; frame: number }>;
  ui: Record<string, { asset: string; frame: number }>;
};

/** CSS that shows frame `frame` of a sheet of `cols` x `rows` equal frames, `height` tall. */
export function sheetStyle(url: string, cols: number, rows: number, frameSize: readonly number[], frame: number, height: string): Record<string, string> {
  const c = frame % cols;
  const r = Math.floor(frame / cols);
  const pos = (i: number, n: number) => (n > 1 ? `${(i / (n - 1)) * 100}%` : "0%");
  return {
    height,
    aspectRatio: `${frameSize[0]} / ${frameSize[1]}`,
    backgroundImage: `url("${url}")`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${pos(c, cols)} ${pos(r, rows)}`,
    backgroundRepeat: "no-repeat",
  };
}

function usable(sheet: Sheet | undefined): sheet is Sheet {
  return !!sheet && (sheet.status === "accepted" || data.drafts_enabled);
}

/** The icon of a shop item as CSS for a frame of the icon sheet, or null (the emoji stays). */
export function itemIconStyle(itemId: string, height: string): { id: string; frame: number; style: Record<string, string> } | null {
  const v = data.items[itemId];
  const sheet = v && data.sheets[v.asset];
  if (!v || !usable(sheet)) return null;
  return { id: v.asset, frame: v.frame, style: sheetStyle(artFile(sheet.file), sheet.cols, sheet.rows, sheet.frame, v.frame, height) };
}
