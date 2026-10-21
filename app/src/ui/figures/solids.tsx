import type { ReactNode } from "react";
import { BOX, C, Data, fitPoints, fmt, inset, LabelOut, LW, num, path, r2, THIN, type Pt } from "./kit";

/** The solids (cube, cuboid, prism, pyramid, cylinder, cone, sphere), in an oblique view; hidden edges dashed. */

type V3 = readonly [number, number, number];
const K: Pt = [0.5 * Math.cos((40 * Math.PI) / 180), 0.5 * Math.sin((40 * Math.PI) / 180)];
const project = (p: V3): Pt => [p[0] + p[2] * K[0], p[1] + p[2] * K[1]];

const NAMES: Record<string, string> = { קובייה: "cube", תיבה: "cuboid", גליל: "cylinder", חרוט: "cone", כדור: "sphere", פירמידה: "pyramid", מנסרה: "prism" };

function dims(raw: unknown, keys: string[][]): (number | undefined)[] {
  if (raw === null || raw === undefined) return keys.map(() => undefined);
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const low = Object.fromEntries(Object.entries(raw as Data).map(([k, v]) => [k.toLowerCase(), v]));
    return keys.map((g) => {
      const k = g.find((x) => x in low);
      return k === undefined ? undefined : num(low[k]);
    });
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  return keys.map((_, i) => (i < arr.length ? num(arr[i]) : undefined));
}

const clampRatio = (v: number[]): number[] => {
  const top = Math.max(...v);
  return v.map((x) => Math.min(top, Math.max(top / 4, x)));
};

function polyhedron(verts: V3[], faces: number[][]) {
  const n = verts.length;
  const c = [0, 1, 2].map((k) => verts.reduce((s, v) => s + v[k]!, 0) / n) as [number, number, number];
  const view: V3 = [-K[0], -K[1], 1];
  const visible: { f: number[]; n: V3 }[] = [];
  const faceVis: boolean[] = [];
  for (const f of faces) {
    const [a, b, d] = [verts[f[0]!]!, verts[f[1]!]!, verts[f[2]!]!];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nn: V3 = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const out = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
    if (nn[0] * out[0]! + nn[1] * out[1]! + nn[2] * out[2]! < 0) nn = [-nn[0], -nn[1], -nn[2]];
    const vis = nn[0] * view[0] + nn[1] * view[1] + nn[2] * view[2] < -1e-9;
    faceVis.push(vis);
    if (vis) {
      const len = Math.hypot(...nn) || 1;
      visible.push({ f, n: [nn[0] / len, nn[1] / len, nn[2] / len] });
    }
  }
  const edges = new Map<string, [number, number, boolean]>();
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i]!;
      const b = f[(i + 1) % f.length]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const old = edges.get(key);
      edges.set(key, [Math.min(a, b), Math.max(a, b), (old?.[2] ?? false) || faceVis[fi]!]);
    }
  });
  return { visible, edges: [...edges.values()] };
}

function boxSolid(l: number, h: number, d: number): [V3[], number[][]] {
  return [
    [[0, 0, 0], [l, 0, 0], [l, h, 0], [0, h, 0], [0, 0, d], [l, 0, d], [l, h, d], [0, h, d]],
    [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [1, 2, 6, 5], [0, 3, 7, 4]],
  ];
}

function ngonSolid(kind: string, n: number): [V3[], number[][]] {
  const r = 1;
  const h = 1.6;
  const start = Math.PI / 2 + Math.PI / n;
  const base: V3[] = Array.from({ length: n }, (_, i) => [r + r * Math.cos(start + (2 * Math.PI * i) / n), 0, r + r * Math.sin(start + (2 * Math.PI * i) / n)]);
  const ring = Array.from({ length: n }, (_, i) => i);
  if (kind === "pyramid") return [[...base, [r, h, r]], [ring, ...ring.map((i) => [i, (i + 1) % n, n])]];
  return [[...base, ...base.map((b): V3 => [b[0], h, b[2]])], [ring, ring.map((i) => n + i), ...ring.map((i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])]];
}

function shade(n: V3): string {
  if (n[1] > 0.3) return "var(--fig-top)";
  if (n[0] > 0.3) return "var(--fig-side)";
  return C.fill;
}

function Poly({ verts, faces, labels }: { verts: V3[]; faces: number[][]; labels: Map<string, number | undefined> }) {
  const px = 16;
  const shown = [...labels.entries()].filter(([, v]) => v !== undefined) as [string, number][];
  const m = fitPoints(verts.map(project), inset(BOX, shown.length ? px * 1.6 : 6));
  const scr = verts.map((v) => m.at(...project(v)));
  const { visible, edges } = polyhedron(verts, faces);
  const cx = scr.reduce((s, p) => s + p[0], 0) / scr.length;
  const cy = scr.reduce((s, p) => s + p[1], 0) / scr.length;
  return (
    <g>
      {visible.map(({ f, n }, i) => (
        <path key={i} data-fig="face" d={path(f.map((k) => scr[k]!), true)} fill={shade(n)} />
      ))}
      {edges.map(([a, b, vis]) => (
        <line key={`${a},${b}`} data-fig={vis ? "edge" : "hidden"} x1={r2(scr[a]![0])} y1={r2(scr[a]![1])} x2={r2(scr[b]![0])} y2={r2(scr[b]![1])} stroke={vis ? C.ink : C.soft} strokeWidth={vis ? LW : THIN} strokeDasharray={vis ? undefined : "6 5"} strokeLinecap="round" />
      ))}
      {shown.map(([key, value]) => {
        const [i, j] = key.split(",").map(Number) as [number, number];
        const mid: Pt = [(scr[i]![0] + scr[j]![0]) / 2, (scr[i]![1] + scr[j]![1]) / 2];
        return <LabelOut key={key} text={fmt(value)} anchor={mid} dir={[mid[0] - cx, mid[1] - cy]} size={px} />;
      })}
    </g>
  );
}

function ellipse(c: Pt, rx: number, ry: number, t0: number, t1: number, steps = 40): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => [c[0] + rx * Math.cos(t0 + ((t1 - t0) * i) / steps), c[1] - ry * Math.sin(t0 + ((t1 - t0) * i) / steps)] as Pt);
}

function Round({ name, raw }: { name: string; raw: unknown }) {
  let [r, h] = dims(raw, [["r", "radius"], ["h", "height"]]);
  if (r === undefined && raw && typeof raw === "object" && !Array.isArray(raw)) {
    const d = dims(raw, [["d", "diameter"]])[0];
    r = d === undefined ? undefined : d / 2;
  }
  let rv = r || 1;
  let hv = name === "sphere" ? 0 : h || rv * 2;
  if (name !== "sphere") [rv, hv] = clampRatio([rv, hv]) as [number, number];
  const e = rv * 0.32;
  const px = 16;
  const margin = r !== undefined || h !== undefined ? px * 1.6 : 6;
  const area = inset(BOX, margin);
  const sphere = name === "sphere";
  const xmin = -rv;
  const xmax = rv;
  const ymin = sphere ? -rv : -e;
  const ymax = sphere ? rv : hv + e;
  const sc = Math.max(Math.min(area.w / (xmax - xmin), area.h / (ymax - ymin)), 1e-6);
  const at = (x: number, y: number): Pt => [area.x + area.w / 2 + x * sc, area.y + area.h / 2 - (y - (ymin + ymax) / 2) * sc];
  const c0 = at(0, 0);
  const ct = at(0, hv);
  const R = rv * sc;
  const front = ellipse(c0, R, e * sc, Math.PI, 2 * Math.PI);
  const back = ellipse(c0, R, e * sc, 0, Math.PI);
  const dash = { stroke: C.soft, strokeWidth: THIN, strokeDasharray: "6 5", fill: "none" };
  let radiusFrom = c0;
  const body: ReactNode[] = [];
  if (sphere) {
    body.push(<circle key="b" data-fig="shape" cx={c0[0]} cy={c0[1]} r={R} fill={C.fill} stroke={C.ink} strokeWidth={LW} />, <path key="bk" d={path(back)} {...dash} />, <path key="f" d={path(front)} fill="none" stroke={C.ink} strokeWidth={THIN} />);
  } else if (name === "cylinder") {
    radiusFrom = ct;
    body.push(
      <path key="b" data-fig="shape" d={path([at(-rv, hv), at(rv, hv), ...[...front].reverse()], true)} fill={C.fill} />,
      <path key="bk" d={path(back)} {...dash} />,
      <path key="t" d={path(ellipse(ct, R, e * sc, 0, 2 * Math.PI, 56), true)} fill="var(--fig-top)" stroke={C.ink} strokeWidth={LW} />,
      <line key="l" x1={r2(at(-rv, 0)[0])} y1={r2(at(-rv, 0)[1])} x2={r2(at(-rv, hv)[0])} y2={r2(at(-rv, hv)[1])} stroke={C.ink} strokeWidth={LW} />,
      <line key="r" x1={r2(at(rv, 0)[0])} y1={r2(at(rv, 0)[1])} x2={r2(at(rv, hv)[0])} y2={r2(at(rv, hv)[1])} stroke={C.ink} strokeWidth={LW} />,
      <path key="f" d={path(front)} fill="none" stroke={C.ink} strokeWidth={LW} />,
    );
  } else {
    body.push(
      <path key="b" data-fig="shape" d={path([ct, ...[...front].reverse()], true)} fill={C.fill} />,
      <path key="bk" d={path(back)} {...dash} />,
      <line key="a" x1={r2(ct[0])} y1={r2(ct[1])} x2={r2(c0[0])} y2={r2(c0[1])} {...dash} />,
      <path key="e" d={path([at(-rv, 0), ct, at(rv, 0)])} fill="none" stroke={C.ink} strokeWidth={LW} strokeLinejoin="round" />,
      <path key="f" d={path(front)} fill="none" stroke={C.ink} strokeWidth={LW} />,
    );
  }
  const start = radiusFrom;
  const end: Pt = [start[0] + R, start[1]];
  return (
    <g>
      {body}
      {h !== undefined && !sphere && <LabelOut text={fmt(h)} anchor={at(rv, hv / 2)} dir={[1, 0]} size={px} />}
      {r !== undefined && (
        <g>
          <line x1={r2(start[0])} y1={r2(start[1])} x2={r2(end[0])} y2={r2(end[1])} stroke={C.accent} strokeWidth={LW} strokeDasharray="7 4" />
          <circle cx={r2(start[0])} cy={r2(start[1])} r={LW} fill={C.ink} />
          <LabelOut text={fmt(r)} anchor={[(start[0] + end[0]) / 2, start[1] + (name === "cone" ? e * sc : sphere ? -e * sc * 0.6 : 0)]} dir={[0, name === "cone" ? 1 : -1]} size={px} />
        </g>
      )}
    </g>
  );
}

export function Solid({ data }: { data: Data }) {
  const text = String(data["name"] ?? "").trim();
  const name = NAMES[text] ?? text.toLowerCase().replace(/ /g, "_");
  const raw = data["dims"];
  if (name === "sphere" || name === "cylinder" || name === "cone") return <Round name={name} raw={raw} />;
  const sides = name.split("_");
  const n = Number(sides[1]);
  if ((sides[0] === "prism" || sides[0] === "pyramid") && sides.length === 2 && Number.isInteger(n)) {
    const [verts, faces] = ngonSolid(sides[0], Math.max(3, Math.min(12, n)));
    return <Poly verts={verts} faces={faces} labels={new Map()} />;
  }
  if (name === "cube") {
    const [a] = dims(raw, [["a", "edge", "side", "s", "l", "length"]]);
    const [verts, faces] = boxSolid(a || 1, a || 1, a || 1);
    return <Poly verts={verts} faces={faces} labels={new Map([["0,1", a]])} />;
  }
  if (name === "cuboid" || name === "box") {
    const [l, w, h] = dims(raw, [["l", "length", "a", "x"], ["w", "width", "d", "depth", "b", "z"], ["h", "height", "c", "y"]]);
    const [lv, wv, hv] = clampRatio([l || 3, w || 2, h || 2]) as [number, number, number];
    const [verts, faces] = boxSolid(lv, hv, wv);
    return <Poly verts={verts} faces={faces} labels={new Map([["0,1", l], ["1,5", w], ["0,3", h]])} />;
  }
  if (name === "prism") {
    const [w, h, d] = dims(raw, [["w", "base", "b", "a"], ["h", "height"], ["d", "depth", "l", "length"]]);
    const [wv, hv, dv] = clampRatio([w || 2, h || 1.7, d || 3]) as [number, number, number];
    const verts: V3[] = [[0, 0, 0], [wv, 0, 0], [wv / 2, hv, 0], [0, 0, dv], [wv, 0, dv], [wv / 2, hv, dv]];
    return <Poly verts={verts} faces={[[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [0, 2, 5, 3]]} labels={new Map([["0,1", w], ["1,4", d]])} />;
  }
  if (name === "pyramid") {
    const [l, w, h] = dims(raw, [["l", "length", "a", "base"], ["w", "width", "d"], ["h", "height"]]);
    const [lv, wv, hv] = clampRatio([l || 2, w || l || 2, h || 2]) as [number, number, number];
    const verts: V3[] = [[0, 0, 0], [lv, 0, 0], [lv, 0, wv], [0, 0, wv], [lv / 2, hv, wv / 2]];
    return <Poly verts={verts} faces={[[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]} labels={new Map([["0,1", l], ["1,2", w]])} />;
  }
  return null;
}
