import { Arrowhead, BOX, C, Data, fitMap, fitPoints, fmt, inset, Label, LabelOut, LW, num, path, Plate, r2, THIN, toPoints, type Pt } from "./kit";

/** The flat figures: polygon, circle, angle, symmetry, coordinate and number_line. */

const regular = (n: number): Pt[] => {
  const a0 = -Math.PI / 2 - Math.PI / n;
  return Array.from({ length: n }, (_, i) => [Math.cos(a0 + (2 * Math.PI * i) / n), Math.sin(a0 + (2 * Math.PI * i) / n)] as Pt);
};

const SIDES: Record<string, number> = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, octagon: 8, circle: 48 };
const ALIASES: Record<string, string> = { משולש: "triangle", ריבוע: "square", מלבן: "rectangle", מחומש: "pentagon", משושה: "hexagon", מתומן: "octagon", מעוין: "rhombus", מקבילית: "parallelogram", טרפז: "trapezoid", דלתון: "kite", לב: "heart", כוכב: "star", בית: "house", חץ: "arrow", פרפר: "butterfly", עיגול: "circle" };
const mirror = (right: Pt[]): Pt[] => [...right, ...[...right].reverse().filter((p) => Math.abs(p[0]) > 1e-9).map((p) => [-p[0], p[1]] as Pt)];

const SHAPES: Record<string, Pt[]> = {
  rectangle: [[0, 0], [3, 0], [3, 2], [0, 2]],
  right_triangle: [[0, 0], [4, 0], [0, 3]],
  equilateral: regular(3),
  isosceles: [[0, 0], [4, 0], [2, 3]],
  scalene: [[0, 0], [4, 0], [1, 3]],
  rhombus: [[0, -1.5], [1, 0], [0, 1.5], [-1, 0]],
  parallelogram: [[0, 0], [3, 0], [4, 2], [1, 2]],
  trapezoid: [[0, 0], [4, 0], [3, 2], [1, 2]],
  isosceles_trapezoid: [[0, 0], [4, 0], [3, 2], [1, 2]],
  kite: [[0, -2], [1, 0], [0, 1], [-1, 0]],
  heart: Array.from({ length: 64 }, (_, i) => {
    const t = (2 * Math.PI * i) / 64;
    return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)] as Pt;
  }),
  star: Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.42 : 1;
    return [r * Math.cos(Math.PI / 2 + (i * Math.PI) / 5), r * Math.sin(Math.PI / 2 + (i * Math.PI) / 5)] as Pt;
  }),
  house: [[-1, 0], [1, 0], [1, 1.2], [0, 2.2], [-1, 1.2]],
  arrow: mirror([[0, 2.2], [0.8, 1.2], [0.35, 1.2], [0.35, 0], [0, 0]]),
  butterfly: mirror([[0, 1.0], [0.4, 1.9], [1.4, 2.2], [1.7, 1.4], [0.9, 0.4], [1.5, -0.4], [1.2, -1.4], [0.5, -1.3], [0, -0.8]]),
};

function named(raw: unknown): Pt[] {
  const text = String(raw ?? "").trim();
  const name = ALIASES[text] ?? text.toLowerCase().replace(/ /g, "_");
  const n = SIDES[name];
  return n ? regular(n) : (SHAPES[name] ?? []);
}

const signedArea = (p: readonly Pt[]): number => 0.5 * p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * a[1], 0);

/** A polygon from its points, with labels on sides ("side_0") and angles ("angle_1"), on a grid if asked. */
export function Polygon({ data }: { data: Data }) {
  let pts = toPoints(data["points"]);
  if (!pts.length) pts = named(data["name"]);
  if (!pts.length) return <Plate />;
  const labels = Object.entries((data["labels"] ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined);
  const px = 16;
  const area = inset(BOX, labels.length ? px * 1.5 : 4);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const grid = data["grid"] === true;
  let m = fitPoints(pts, area);
  const lines: [Pt, Pt][] = [];
  if (grid) {
    const x0 = Math.floor(Math.min(...xs));
    const x1 = Math.max(Math.ceil(Math.max(...xs)), x0 + 1);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.max(Math.ceil(Math.max(...ys)), y0 + 1);
    m = fitMap(x0, x1, y0, y1, area);
    if ((x1 - x0) * (y1 - y0) <= 2500) {
      for (let x = x0; x <= x1; x++) lines.push([m.at(x, y0), m.at(x, y1)]);
      for (let y = y0; y <= y1; y++) lines.push([m.at(x0, y), m.at(x1, y)]);
    }
  }
  const scr = pts.map((p) => m.at(p[0], p[1]));
  const ccw = signedArea(pts) >= 0;
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const n = pts.length;
  let hp = toPoints(data["height"]);
  if (hp.length !== 2 && labels.some(([k]) => k === "height")) {
    // a height label with no line: from the highest vertex straight down to the base
    const top = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    hp = [[top[0], Math.min(...ys)], top];
  }
  const height = hp.length === 2 ? ([m.at(hp[0]![0], hp[0]![1]), m.at(hp[1]![0], hp[1]![1])] as const) : null;
  return (
    <g>
      {lines.map(([a, b], i) => (
        <line key={i} x1={r2(a[0])} y1={r2(a[1])} x2={r2(b[0])} y2={r2(b[1])} stroke={C.grid} strokeWidth={THIN} />
      ))}
      <path data-fig="shape" d={path(scr, n > 1)} fill={n >= 3 ? C.fill : "none"} stroke={C.ink} strokeWidth={LW} strokeLinejoin="round" />
      {height && (
        <g data-fig="height">
          <line x1={r2(height[0][0])} y1={r2(height[0][1])} x2={r2(height[1][0])} y2={r2(height[1][1])} stroke={C.ink} strokeWidth={THIN} strokeDasharray="7 5" strokeLinecap="round" />
          {labels.some(([k]) => k === "height") && (
            <Label x={(height[0][0] + height[1][0]) / 2 + 14} y={(height[0][1] + height[1][1]) / 2} size={px} bg>
              {fmt((data["labels"] as Record<string, unknown>)["height"])}
            </Label>
          )}
        </g>
      )}
      {data["right_angle"] !== undefined && n >= 3 && <RightAngle pts={scr} at={Math.trunc(num(data["right_angle"])) % n} />}
      {scr.map((p, i) => (
        <circle key={i} cx={r2(p[0])} cy={r2(p[1])} r={LW * 0.7} fill={C.ink} />
      ))}
      {labels.map(([key, text]) => {
        const [kind, idx] = key.split("_");
        if (!idx || !/^\d+$/.test(idx)) return null;
        const i = Number(idx) % n;
        if (kind === "side" && n >= 2) {
          const a = pts[i]!;
          const b = pts[(i + 1) % n]!;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const [nx, ny] = ccw ? [dy, -dx] : [-dy, dx];
          const mid = m.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          return <LabelOut key={key} text={fmt(text)} anchor={mid} dir={[nx, -ny]} size={px} />;
        }
        if (kind === "angle") {
          const [vx, vy] = scr[i]!;
          const [ccx, ccy] = m.at(cx, cy);
          const d = Math.hypot(ccx - vx, ccy - vy) || 1;
          const off = Math.min(px * 1.6, d * 0.6);
          return (
            <Label key={key} x={vx + ((ccx - vx) / d) * off} y={vy + ((ccy - vy) / d) * off} size={px}>
              {fmt(text)}
            </Label>
          );
        }
        return null;
      })}
    </g>
  );
}

/** The small square at a right angle's corner (vertex `at`). */
function RightAngle({ pts, at }: { pts: Pt[]; at: number }) {
  const n = pts.length;
  const v = pts[at]!;
  const a = pts[(at + n - 1) % n]!;
  const b = pts[(at + 1) % n]!;
  const un = (p: Pt): Pt => {
    const d = Math.hypot(p[0] - v[0], p[1] - v[1]) || 1;
    return [(p[0] - v[0]) / d, (p[1] - v[1]) / d];
  };
  const s = 11;
  const ua = un(a);
  const ub = un(b);
  return <path d={path([[v[0] + ua[0] * s, v[1] + ua[1] * s], [v[0] + (ua[0] + ub[0]) * s, v[1] + (ua[1] + ub[1]) * s], [v[0] + ub[0] * s, v[1] + ub[1] * s]])} fill="none" stroke={C.ink} strokeWidth={THIN} />;
}

/** A circle, with its radius or diameter drawn when asked, and a label. */
export function Circle({ data }: { data: Data }) {
  const c: Pt = [BOX.x + BOX.w / 2, BOX.y + BOX.h / 2];
  const R = Math.min(BOX.w, BOX.h) / 2 - LW;
  const show = String(data["show"] ?? "").toLowerCase();
  const label = data["label"];
  const a = (-20 * Math.PI) / 180;
  return (
    <g>
      <circle data-fig="shape" cx={c[0]} cy={c[1]} r={R} fill={C.alt} stroke={C.ink} strokeWidth={LW} />
      {show === "radius" && <line data-fig="radius" x1={c[0]} y1={c[1]} x2={r2(c[0] + R * Math.cos(a))} y2={r2(c[1] + R * Math.sin(a))} stroke={C.ink} strokeWidth={LW} strokeLinecap="round" />}
      {show === "diameter" && <line data-fig="diameter" x1={c[0] - R} y1={c[1]} x2={c[0] + R} y2={c[1]} stroke={C.ink} strokeWidth={LW} strokeLinecap="round" />}
      <circle cx={c[0]} cy={c[1]} r={LW * 1.1} fill={C.ink} />
      {label !== undefined && label !== null && String(label) !== "" && (
        <Label x={show === "radius" ? c[0] + R * 0.45 : c[0]} y={show === "radius" ? c[1] - 16 : show === "diameter" ? c[1] - 14 : c[1]} size={20} bg>
          {fmt(label)}
        </Label>
      )}
    </g>
  );
}

/** An angle: two rays, its arc, and its size ("90°", a square for a right angle). */
export function Angle({ data }: { data: Data }) {
  const deg = Math.max(0, Math.min(360, num(data["degrees"], 45)));
  const rot = num(data["rotation"], 0);
  const a1 = (rot * Math.PI) / 180;
  const a2 = ((rot + deg) * Math.PI) / 180;
  const arcR = 0.3;
  const at = (a: number, r: number): Pt => [r * Math.cos(a), r * Math.sin(a)];
  const world: Pt[] = [[0, 0], at(a1, 1), at(a2, 1), ...Array.from({ length: 17 }, (_, k) => at(a1 + ((a2 - a1) * k) / 16, arcR))];
  const px = 18;
  const m = fitPoints(world, inset(BOX, px));
  const v = m.at(0, 0);
  const steps = Math.max(8, Math.trunc(deg / 4));
  const arc = Array.from({ length: steps + 1 }, (_, k) => m.at(...at(a1 + ((a2 - a1) * k) / steps, arcR)));
  const right = Math.abs(deg - 90) < 1e-6;
  const d1 = at(a1, 1);
  const d2 = at(a2, 1);
  const s = 0.18;
  const sq = [m.at(d1[0] * s, d1[1] * s), m.at((d1[0] + d2[0]) * s, (d1[1] + d2[1]) * s), m.at(d2[0] * s, d2[1] * s)];
  const label = "label" in data ? data["label"] : `${fmt(deg)}°`;
  const mid = (a1 + a2) / 2;
  const lr = deg >= 30 ? arcR + 0.22 : arcR + 0.4;
  const lp = m.at(lr * Math.cos(mid), lr * Math.sin(mid));
  return (
    <g>
      {deg > 0 && <path data-fig="arc" d={path([v, ...(right ? sq : arc)], true)} fill={C.fill} stroke={C.accent} strokeWidth={LW} strokeLinejoin="round" />}
      <line x1={r2(v[0])} y1={r2(v[1])} x2={r2(m.at(...d1)[0])} y2={r2(m.at(...d1)[1])} stroke={C.ink} strokeWidth={LW} strokeLinecap="round" />
      <line x1={r2(v[0])} y1={r2(v[1])} x2={r2(m.at(...d2)[0])} y2={r2(m.at(...d2)[1])} stroke={C.ink} strokeWidth={LW} strokeLinecap="round" />
      <circle cx={r2(v[0])} cy={r2(v[1])} r={LW * 0.9} fill={C.ink} />
      {label !== null && label !== undefined && String(label) !== "" && (
        <Label x={lp[0]} y={lp[1]} size={px}>
          {fmt(label)}
        </Label>
      )}
    </g>
  );
}

/** A shape, and (when the data names an axis) its line of symmetry, dashed. */
export function Symmetry({ data }: { data: Data }) {
  const pts = Array.isArray(data["shape"]) ? toPoints(data["shape"]) : named(data["shape"]);
  const axis = String(data["axis"] ?? "").toLowerCase();
  const area = inset(BOX, 14);
  if (!pts.length) return <Plate />;
  const m = fitPoints(pts, area);
  const scr = pts.map((p) => m.at(p[0], p[1]));
  const xs = scr.map((p) => p[0]);
  const ys = scr.map((p) => p[1]);
  const [l, r, t, b] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  const dash = { stroke: C.accent, strokeWidth: LW, strokeDasharray: "9 6", strokeLinecap: "round" as const };
  return (
    <g>
      <path data-fig="shape" d={path(scr, true)} fill={C.alt} stroke={C.ink} strokeWidth={LW} strokeLinejoin="round" />
      {(axis === "vertical" || axis === "both") && <line data-fig="axis" x1={cx} y1={t - 8} x2={cx} y2={b + 8} {...dash} />}
      {(axis === "horizontal" || axis === "both") && <line data-fig="axis" x1={l - 8} y1={cy} x2={r + 8} y2={cy} {...dash} />}
    </g>
  );
}

function niceStep(span: number, maxTicks = 10): number {
  if (span <= 0) return 1;
  const raw = span / maxTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const k of [1, 2, 5, 10]) if (k * mag >= raw - 1e-12) return k * mag;
  return 10 * mag;
}

/** Axes with a grid, and the labelled points (A, B) of a coordinate question. */
export function Coordinate({ data }: { data: Data }) {
  const raw = Array.isArray(data["points"]) ? (data["points"] as unknown[]) : [];
  const pts = toPoints(raw);
  const rg = data["range"];
  let vals: number[];
  if (Array.isArray(rg)) {
    vals = rg.map((v) => num(v));
    if (vals.length === 2) vals = [...vals, ...vals];
    if (vals.length !== 4) vals = [0, 5, 0, 5];
  } else {
    const n = Math.abs(num(rg, 5)) || 5;
    const lo = num(data["quadrants"]) === 4 || pts.some(([x, y]) => x < 0 || y < 0) ? -n : 0;
    vals = [lo, n, lo, n];
  }
  let [xmin, xmax, ymin, ymax] = vals as [number, number, number, number];
  for (const [x, y] of pts) [xmin, xmax, ymin, ymax] = [Math.min(xmin, x), Math.max(xmax, x), Math.min(ymin, y), Math.max(ymax, y)];
  xmin = Math.floor(xmin);
  ymin = Math.floor(ymin);
  xmax = Math.max(Math.ceil(xmax), xmin + 1);
  ymax = Math.max(Math.ceil(ymax), ymin + 1);
  const px = 14;
  const m = fitMap(xmin, xmax, ymin, ymax, inset(BOX, px * 1.7));
  const xs = niceStep(xmax - xmin);
  const ys = niceStep(ymax - ymin);
  const ticks = (lo: number, hi: number, step: number) => {
    const out: number[] = [];
    for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push(k * step);
    return out;
  };
  const xt = ticks(xmin, xmax, xs);
  const yt = ticks(ymin, ymax, ys);
  const axY = ymin <= 0 && 0 <= ymax ? 0 : ymin;
  const axX = xmin <= 0 && 0 <= xmax ? 0 : xmin;
  const xEvery = Math.max(1, Math.ceil((px * 2.2) / (xs * m.s)));
  const yEvery = Math.max(1, Math.ceil((px * 1.3) / (ys * m.s)));
  const head = 8;
  const xa = [m.at(xmin, axY), m.at(xmax, axY)] as const;
  const ya = [m.at(axX, ymin), m.at(axX, ymax)] as const;
  return (
    <g>
      {xt.map((x) => (
        <line key={`gx${x}`} x1={r2(m.at(x, ymin)[0])} y1={r2(m.at(x, ymin)[1])} x2={r2(m.at(x, ymax)[0])} y2={r2(m.at(x, ymax)[1])} stroke={C.grid} strokeWidth={THIN} />
      ))}
      {yt.map((y) => (
        <line key={`gy${y}`} x1={r2(m.at(xmin, y)[0])} y1={r2(m.at(xmin, y)[1])} x2={r2(m.at(xmax, y)[0])} y2={r2(m.at(xmax, y)[1])} stroke={C.grid} strokeWidth={THIN} />
      ))}
      <line x1={r2(xa[0][0])} y1={r2(xa[0][1])} x2={r2(xa[1][0] + head * 0.6)} y2={r2(xa[1][1])} stroke={C.ink} strokeWidth={LW} />
      <Arrowhead tip={[xa[1][0] + head * 1.6, xa[1][1]]} dir={[1, 0]} size={head} />
      <line x1={r2(ya[0][0])} y1={r2(ya[0][1])} x2={r2(ya[1][0])} y2={r2(ya[1][1] - head * 0.6)} stroke={C.ink} strokeWidth={LW} />
      <Arrowhead tip={[ya[1][0], ya[1][1] - head * 1.6]} dir={[0, -1]} size={head} />
      {xt.map((x) => {
        const p = m.at(x, axY);
        return (
          <g key={`tx${x}`}>
            <line x1={r2(p[0])} y1={r2(p[1] - 4)} x2={r2(p[0])} y2={r2(p[1] + 4)} stroke={C.ink} strokeWidth={THIN} />
            {Math.round(x / xs) % xEvery === 0 && !(x === axX && axY === 0) && (
              <Label x={p[0]} y={p[1] + px * 1.05} size={px} color={C.soft}>
                {fmt(x)}
              </Label>
            )}
          </g>
        );
      })}
      {yt.map((y) => {
        const p = m.at(axX, y);
        return (
          <g key={`ty${y}`}>
            <line x1={r2(p[0] - 4)} y1={r2(p[1])} x2={r2(p[0] + 4)} y2={r2(p[1])} stroke={C.ink} strokeWidth={THIN} />
            {Math.round(y / ys) % yEvery === 0 && !(y === axY && axX === 0) && (
              <Label x={p[0] - px * 1.1} y={p[1]} size={px} color={C.soft}>
                {fmt(y)}
              </Label>
            )}
          </g>
        );
      })}
      {axX === 0 && axY === 0 && (
        <Label x={m.at(0, 0)[0] - px * 0.8} y={m.at(0, 0)[1] + px * 0.9} size={px} color={C.soft}>
          0
        </Label>
      )}
      {pts.map((p, i) => {
        const [x, y] = m.at(p[0], p[1]);
        const label = raw[i] && typeof raw[i] === "object" && !Array.isArray(raw[i]) ? (raw[i] as Data)["label"] : null;
        return (
          <g key={i} data-fig="point" data-label={label ? String(label) : undefined}>
            <circle cx={r2(x)} cy={r2(y)} r={6} fill={C.accent} stroke={C.ink} strokeWidth={THIN} />
            {label ? (
              <Label x={x + 13} y={y - 13} size={18}>
                {String(label)}
              </Label>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** A number line with ticks, the numbers of the question as labelled dots, and the arrows at both ends. */
export function NumberLine({ data }: { data: Data }) {
  const lo = num(data["min"], 0);
  let hi = num(data["max"], 10);
  if (hi <= lo) hi = lo + 1;
  const y = BOX.y + BOX.h / 2 - 6;
  const pad = 22;
  const xOf = (v: number) => BOX.x + pad + ((v - lo) / (hi - lo)) * (BOX.w - 2 * pad);
  const raw = data["marks"];
  const marked: number[] = Array.isArray(raw) ? raw.map((m) => num(m && typeof m === "object" && !Array.isArray(m) ? (m as Data)["value"] : m)) : [];
  const step = !Array.isArray(raw) && raw ? num(raw) || niceStep(hi - lo) : niceStep(hi - lo, 12);
  const ticks: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9 && ticks.length < 200; k++) ticks.push(Math.round(k * step * 1e9) / 1e9);
  const spacing = (BOX.w - 2 * pad) / Math.max(1, ticks.length - 1);
  const every = Math.max(1, Math.ceil(Math.max(...ticks.map((t) => fmt(t).length * 15 * 0.62), 0) / spacing + 0.4));
  const point = data["point"];
  return (
    <g>
      <line x1={BOX.x + 4} y1={y} x2={BOX.x + BOX.w - 4} y2={y} stroke={C.ink} strokeWidth={LW} />
      <Arrowhead tip={[BOX.x - 2, y]} dir={[-1, 0]} size={10} />
      <Arrowhead tip={[BOX.x + BOX.w + 2, y]} dir={[1, 0]} size={10} />
      {ticks.map((t, i) => (
        <g key={t}>
          <line x1={r2(xOf(t))} y1={y - 7} x2={r2(xOf(t))} y2={y + 7} stroke={C.ink} strokeWidth={THIN} />
          {(i % every === 0 || i === ticks.length - 1) && (
            <Label x={xOf(t)} y={y + 24} size={15} color={C.soft}>
              {fmt(t)}
            </Label>
          )}
        </g>
      ))}
      {[...marked, ...(point !== undefined && point !== null ? [num(point)] : [])]
        .filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9)
        .map((v, i) => (
          <g key={`m${i}`} data-fig="mark">
            <circle cx={r2(xOf(v))} cy={y} r={8} fill={C.accent} stroke={C.ink} strokeWidth={THIN} />
            <Label x={xOf(v)} y={y - 24} size={18}>
              {fmt(v)}
            </Label>
          </g>
        ))}
    </g>
  );
}
