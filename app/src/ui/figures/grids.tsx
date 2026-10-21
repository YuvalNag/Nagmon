import { BOX, C, Data, gridBox, Label, LW, Plate, THIN, emojiUrl, fmt, num, path, r2, type Pt } from "./kit";

/** The figures on a grid: grid_path (the robot), grid_area, grid_numbers, and pattern. */

const DIRS: Record<string, Pt> = { R: [1, 0], L: [-1, 0], U: [0, 1], D: [0, -1] };

function moves(raw: unknown): [string, number][] {
  const out: [string, number][] = [];
  for (const token of Array.isArray(raw) ? raw : []) {
    const t = String(token).trim().toUpperCase();
    const letters = [...t].filter((ch) => ch in DIRS);
    const digits = [...t].filter((ch) => ch >= "0" && ch <= "9").join("");
    if (letters.length === 1) out.push([letters[0]!, digits ? Number(digits) : 1]);
  }
  return out;
}

/** A five-point star (never four), centred on (cx, cy). */
function star(cx: number, cy: number, r: number): string {
  const pts: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const rr = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
  return path(pts, true);
}

/**
 * A grid (y up: row 0 is the bottom row), the robot's start cell, the
 * path of its moves when `show_moves` is true, and the labelled marks
 * (letter to [x, y]) on their cells: which square is א, ב, ג, ד.
 */
export function GridPath({ data }: { data: Data }) {
  const w = Math.max(1, Math.trunc(num(data["width"], 5)));
  const h = Math.max(1, Math.trunc(num(data["height"], 5)));
  const start = Array.isArray(data["start"]) ? ([num(data["start"][0]), num(data["start"][1])] as Pt) : ([0, 0] as Pt);
  const { cell, ox, oy } = gridBox(w, h, BOX);
  const centre = (x: number, y: number): Pt => [ox + (x + 0.5) * cell, oy + (h - y - 0.5) * cell];
  const marks = Object.entries((data["marks"] ?? {}) as Record<string, unknown>);
  const steps: [Pt, Pt][] = [];
  if (data["show_moves"] === true || data["show_path"] === true) {
    let [x, y] = start;
    const repeat = Math.max(1, Math.trunc(num(data["repeat"], 1)));
    for (let k = 0; k < repeat; k++)
      for (const [d, n] of moves(data["moves"]))
        for (let i = 0; i < n; i++) {
          const nx = x + DIRS[d]![0];
          const ny = y + DIRS[d]![1];
          steps.push([[x, y], [nx, ny]]);
          [x, y] = [nx, ny];
        }
  }
  const s = centre(start[0], start[1]);
  const badge = Math.max(cell * 0.4, 11);
  return (
    <g>
      <rect x={r2(ox)} y={r2(oy)} width={r2(w * cell)} height={r2(h * cell)} fill={C.paper} />
      {Array.from({ length: w * h }, (_, i) => (
        <rect key={i} data-fig="cell" x={r2(ox + (i % w) * cell)} y={r2(oy + Math.floor(i / w) * cell)} width={r2(cell)} height={r2(cell)} fill={C.paper} stroke={C.grid} strokeWidth={THIN} />
      ))}
      <rect x={r2(ox)} y={r2(oy)} width={r2(w * cell)} height={r2(h * cell)} fill="none" stroke={C.ink} strokeWidth={LW} />
      {steps.map(([a, b], i) => {
        const p = centre(a[0], a[1]);
        const q = centre(b[0], b[1]);
        const ux = q[0] - p[0];
        const uy = q[1] - p[1];
        const tip: Pt = [p[0] + ux * 0.8, p[1] + uy * 0.8];
        const head = cell * 0.28;
        const len = Math.hypot(ux, uy) || 1;
        const hx = ux / len;
        const hy = uy / len;
        return (
          <g key={i} data-fig="step" stroke={C.path} strokeWidth={LW} strokeLinecap="round">
            <line x1={r2(p[0])} y1={r2(p[1])} x2={r2(tip[0] - hx * head * 0.6)} y2={r2(tip[1] - hy * head * 0.6)} />
            <path d={path([tip, [tip[0] - hx * head - hy * head * 0.55, tip[1] - hy * head + hx * head * 0.55], [tip[0] - hx * head + hy * head * 0.55, tip[1] - hy * head - hx * head * 0.55]], true)} fill={C.path} strokeWidth={1} />
          </g>
        );
      })}
      <g data-fig="start">
        <circle cx={r2(s[0])} cy={r2(s[1])} r={r2(cell * 0.4)} fill={C.accent} stroke={C.ink} strokeWidth={LW} />
        <image href={emojiUrl("1f916")} x={r2(s[0] - cell * 0.27)} y={r2(s[1] - cell * 0.27)} width={r2(cell * 0.54)} height={r2(cell * 0.54)} />
      </g>
      {marks.map(([label, pos]) => {
        const p = Array.isArray(pos) ? centre(num(pos[0]), num(pos[1])) : s;
        return (
          <g key={label} data-fig="mark" data-label={label}>
            {label === "★" ? (
              <path d={star(p[0], p[1], badge * 1.15)} fill={C.accent} stroke={C.ink} strokeWidth={THIN} strokeLinejoin="round" />
            ) : (
              <>
                <rect x={r2(p[0] - badge)} y={r2(p[1] - badge)} width={r2(badge * 2)} height={r2(badge * 2)} rx={r2(badge * 0.3)} fill={C.fill} stroke={C.ink} strokeWidth={LW} />
                <Label x={p[0]} y={p[1]} size={cell * 0.55}>
                  {label}
                </Label>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Cells of a grid shaded (y up): an area counted in squares. */
export function GridArea({ data }: { data: Data }) {
  const w = Math.trunc(num(data["width"]));
  const h = Math.trunc(num(data["height"]));
  if (w <= 0 || h <= 0) return <Plate />;
  const raw = data["cells"];
  const cells = Array.isArray(raw) ? raw.map((c) => [Math.trunc(num((c as unknown[])[0])), Math.trunc(num((c as unknown[])[1]))] as Pt) : Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w)] as Pt);
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const { cell, ox, oy } = gridBox(w, h, BOX);
  const px = (x: number) => ox + x * cell;
  const py = (y: number) => oy + (h - y) * cell;
  const edges: [Pt, Pt][] = [];
  for (const [x, y] of cells)
    for (const [dx, dy, a, b] of [
      [0, -1, [x, y], [x + 1, y]],
      [0, 1, [x, y + 1], [x + 1, y + 1]],
      [-1, 0, [x, y], [x, y + 1]],
      [1, 0, [x + 1, y], [x + 1, y + 1]],
    ] as [number, number, Pt, Pt][])
      if (!set.has(`${x + dx},${y + dy}`)) edges.push([a, b]);
  return (
    <g>
      <rect x={r2(ox)} y={r2(oy)} width={r2(w * cell)} height={r2(h * cell)} fill={C.paper} />
      {cells
        .filter(([x, y]) => x >= 0 && x < w && y >= 0 && y < h)
        .map(([x, y]) => (
          <rect key={`${x},${y}`} data-fig="shaded" x={r2(px(x))} y={r2(py(y + 1))} width={r2(cell)} height={r2(cell)} fill={C.fill} />
        ))}
      {Array.from({ length: w + 1 }, (_, x) => (
        <line key={`v${x}`} x1={r2(px(x))} y1={r2(oy)} x2={r2(px(x))} y2={r2(oy + h * cell)} stroke={C.grid} strokeWidth={THIN} />
      ))}
      {Array.from({ length: h + 1 }, (_, y) => (
        <line key={`h${y}`} x1={r2(ox)} y1={r2(py(y))} x2={r2(ox + w * cell)} y2={r2(py(y))} stroke={C.grid} strokeWidth={THIN} />
      ))}
      {edges.map(([a, b], i) => (
        <line key={i} x1={r2(px(a[0]))} y1={r2(py(a[1]))} x2={r2(px(b[0]))} y2={r2(py(b[1]))} stroke={C.ink} strokeWidth={LW} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** A table of numbers with one hole ("?") to fill. */
export function GridNumbers({ data }: { data: Data }) {
  const grid = Array.isArray(data["grid"]) ? (data["grid"] as unknown[]).map((r) => (Array.isArray(r) ? (r as unknown[]) : [])) : [];
  const rows = grid.length;
  const cols = Math.max(0, ...grid.map((r) => r.length));
  if (!rows || !cols) return <Plate />;
  const target = Array.isArray(data["target"]) ? [Math.trunc(num(data["target"][0])), Math.trunc(num(data["target"][1]))] : [-1, -1];
  const { cell, ox, oy } = gridBox(cols, rows, BOX);
  return (
    <g>
      {grid.flatMap((row, r) =>
        Array.from({ length: cols }, (_, c) => {
          const hole = r === target[0] && c === target[1];
          const v = row[c];
          const text = v === null || v === undefined ? (hole ? "?" : "") : fmt(v);
          return (
            <g key={`${r},${c}`} data-fig="cell" data-hole={hole ? "1" : undefined}>
              <rect x={r2(ox + c * cell)} y={r2(oy + r * cell)} width={r2(cell)} height={r2(cell)} fill={hole ? C.accent : C.paper} stroke={C.soft} strokeWidth={THIN} />
              {text && (
                <Label x={ox + (c + 0.5) * cell} y={oy + (r + 0.5) * cell} size={Math.min(cell * 0.5, ((cell * 0.86) / Math.max(1, text.length)) * 1.6)}>
                  {text}
                </Label>
              )}
            </g>
          );
        }),
      )}
      <rect x={r2(ox)} y={r2(oy)} width={r2(cols * cell)} height={r2(rows * cell)} fill="none" stroke={C.ink} strokeWidth={LW} />
    </g>
  );
}

/** A row of pictures that repeats, with a "?" card where the next one goes. */
export function Pattern({ data }: { data: Data }) {
  const items = Array.isArray(data["items"]) ? (data["items"] as unknown[]).map(String) : [];
  if (!items.length) return <Plate />;
  const n = items.length;
  const rows = n <= 8 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const { cell, ox, oy } = gridBox(cols, rows, BOX);
  const card = cell * 0.88;
  return (
    <g>
      {items.map((item, i) => {
        const cx = ox + ((i % cols) + 0.5) * cell;
        const cy = oy + (Math.floor(i / cols) + 0.5) * cell;
        const hole = item.trim() === "?";
        return (
          <g key={i} data-fig="item" data-hole={hole ? "1" : undefined}>
            <rect x={r2(cx - card / 2)} y={r2(cy - card / 2)} width={r2(card)} height={r2(card)} rx={r2(card * 0.14)} fill={hole ? C.accent : C.paper} stroke={hole ? C.ink : C.grid} strokeWidth={hole ? LW : THIN} />
            {hole ? (
              <Label x={cx} y={cy} size={card * 0.6}>
                ?
              </Label>
            ) : (
              <image href={emojiUrl(item)} x={r2(cx - card * 0.39)} y={r2(cy - card * 0.39)} width={r2(card * 0.78)} height={r2(card * 0.78)} />
            )}
          </g>
        );
      })}
    </g>
  );
}

