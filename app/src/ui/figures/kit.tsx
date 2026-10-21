import type { ReactNode } from "react";

/**
 * The shared parts of the figure drawings (nagmon/ui/figures.py in SVG):
 * the 300 x 160 box, the palette (CSS variables), a world to screen map
 * (y up in the data, down on the screen) and text and line helpers.
 * Figures carry no words: only letters, numbers and shapes.
 */

export const W = 300;
export const H = 160;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The drawing area: the box less a margin. */
export const BOX: Rect = { x: 8, y: 8, w: W - 16, h: H - 16 };
export type Pt = readonly [number, number];
export type Data = Record<string, unknown>;

/** The palette: the app's ink and accent, and the figure's own pastels (styles.css). */
export const C = {
  ink: "var(--ink)",
  soft: "var(--ink-soft)",
  fill: "var(--fig-fill)",
  alt: "var(--fig-alt)",
  accent: "var(--fig-accent)",
  grid: "var(--fig-grid)",
  paper: "var(--fig-paper)",
  path: "var(--accent)",
};

/** Strokes: the figure is drawn at 0.74 of its size on the phone, so 3.4 is 2.5 px and 2.8 is 2 px. */
export const LW = 3.4;
export const THIN = 2.8;
/** No text under 14 units. */
export const MIN_TEXT = 14;

export const num = (v: unknown, d = 0): number => {
  if (typeof v === "string" && v.includes("/")) {
    const [a, b] = v.split("/").map(Number);
    return b ? a! / b : d;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const r2 = (n: number): number => Math.round(n * 100) / 100;

export function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  const n = Number(v);
  if (Number.isFinite(n)) return Number.isInteger(n) ? String(n) : String(r2(n));
  return String(v ?? "");
}

export function toPoints(raw: unknown): Pt[] {
  if (!Array.isArray(raw)) return [];
  const out: Pt[] = [];
  for (const p of raw) {
    if (Array.isArray(p)) out.push([num(p[0]), num(p[1])]);
    else if (p && typeof p === "object") out.push([num((p as Data)["x"]), num((p as Data)["y"])]);
  }
  return out;
}

/** World (y up) to screen, one scale for both axes, centred in `rect`. */
export function fitMap(xmin: number, xmax: number, ymin: number, ymax: number, rect: Rect) {
  const s = Math.max(Math.min(rect.w / Math.max(xmax - xmin, 1e-9), rect.h / Math.max(ymax - ymin, 1e-9)), 1e-6);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { s, at: (x: number, y: number): Pt => [cx + (x - (xmin + xmax) / 2) * s, cy - (y - (ymin + ymax) / 2) * s] };
}

export function fitPoints(pts: readonly Pt[], rect: Rect) {
  const xs = pts.length ? pts.map((p) => p[0]) : [0];
  const ys = pts.length ? pts.map((p) => p[1]) : [0];
  return fitMap(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), rect);
}

export function path(pts: readonly Pt[], closed = false): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${r2(x)} ${r2(y)}`).join("") + (closed ? "Z" : "");
}

export function inset(r: Rect, m: number): Rect {
  return { x: r.x + m, y: r.y + m, w: Math.max(1, r.w - 2 * m), h: Math.max(1, r.h - 2 * m) };
}

/** A line of text, centred on (x, y). `bg` puts a paper chip behind it. */
export function Label({ x, y, size, color, bg, children }: { x: number; y: number; size: number; color?: string; bg?: boolean; children: ReactNode }) {
  const s = Math.max(MIN_TEXT, size);
  const text = String(children);
  const tw = textWidth(text, s);
  return (
    <>
      {bg && <rect x={r2(x - tw / 2 - 3)} y={r2(y - s * 0.62)} width={r2(tw + 6)} height={r2(s * 1.24)} rx={4} fill={C.paper} />}
      <text x={r2(x)} y={r2(y)} className="fig-label" fontSize={r2(s)} style={color ? { fill: color } : undefined}>
        {text}
      </text>
    </>
  );
}

export const textWidth = (text: string, size: number): number => text.length * size * 0.62;

/** A label just outside `anchor`, along `dir` (screen). */
export function LabelOut({ text, anchor, dir, size, color }: { text: string; anchor: Pt; dir: Pt; size: number; color?: string }) {
  const s = Math.max(MIN_TEXT, size);
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / len;
  const uy = dir[1] / len;
  const off = LW + 0.5 * (Math.abs(ux) * textWidth(text, s) + Math.abs(uy) * s) + s * 0.15;
  return (
    <Label x={anchor[0] + ux * off} y={anchor[1] + uy * off} size={s} color={color}>
      {text}
    </Label>
  );
}

export function Arrowhead({ tip, dir, size, color = C.ink }: { tip: Pt; dir: Pt; size: number; color?: string }) {
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / len;
  const uy = dir[1] / len;
  const bx = tip[0] - ux * size;
  const by = tip[1] - uy * size;
  const px = -uy * size * 0.55;
  const py = ux * size * 0.55;
  return <path d={path([tip, [bx + px, by + py], [bx - px, by - py]], true)} fill={color} />;
}

/** Cell and origin for a w x h grid centred in `rect`. */
export function gridBox(cols: number, rows: number, rect: Rect) {
  const cell = Math.min(rect.w / cols, rect.h / rows);
  return { cell, ox: rect.x + (rect.w - cols * cell) / 2, oy: rect.y + (rect.h - rows * cell) / 2 };
}

/** The empty dashed tray for a figure with nothing in it. */
export function Plate() {
  return <rect x={BOX.x + 2} y={BOX.y + 2} width={BOX.w - 4} height={BOX.h - 4} rx={10} fill="none" stroke={C.soft} strokeWidth={THIN} strokeDasharray="8 6" />;
}

export const emojiUrl = (code: string): string => `game/emoji/${code}.svg`;
