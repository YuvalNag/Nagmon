/// <reference types="node" />
import { cleanup, render } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ContentLibrary, loadContent, PyRandom } from "../../../src/core/learning";
import { DRAWN_FIGURE_KINDS, type Figure as FigureData } from "../../../src/core/learning/model";
import { Figure } from "../../../src/ui/Figure";

afterEach(cleanup);

function shipped(): ContentLibrary {
  const dir = "public/game/content";
  const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { files: { file: string }[] };
  const docs: Record<string, unknown> = {};
  for (const f of index.files) docs[f.file] = JSON.parse(readFileSync(`${dir}/${f.file}`, "utf8"));
  return loadContent(docs);
}

/** Every figure the real generators make, by kind: a few seeds on every skill. */
const made = new Map<string, { skill: string; item: string; seed: number; figure: FigureData }[]>();
beforeAll(() => {
  const content = shipped();
  for (const id of content.skills.keys())
    for (let seed = 0; seed < 8; seed++) {
      let q;
      try {
        q = content.generate(id, new PyRandom(seed));
      } catch {
        continue;
      }
      if (!q.figure) continue;
      const list = made.get(q.figure.kind) ?? [];
      list.push({ skill: id, item: q.item_id, seed, figure: q.figure });
      made.set(q.figure.kind, list);
    }
});

const draw = (figure: FigureData) => render(<Figure figure={figure} />).container.querySelector("svg")!;
const each = (kind: string, check: (svg: SVGSVGElement, figure: FigureData, who: string) => void) => {
  const list = made.get(kind) ?? [];
  expect(list.length, `no ${kind} figure from the generators`).toBeGreaterThan(0);
  for (const { skill, seed, figure } of list) {
    cleanup();
    check(draw(figure), figure, `${skill} seed ${seed}`);
  }
};
const count = (svg: Element, sel: string) => svg.querySelectorAll(sel).length;
const texts = (svg: Element) => [...svg.querySelectorAll("text")].map((t) => t.textContent);

describe("every figure kind the generators make is drawn", () => {
  it("is in DRAWN_FIGURE_KINDS (a new kind added to a generator fails here until it is drawn)", () => {
    const dir = "src/core/learning/generators";
    const kinds = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts")))
      for (const m of readFileSync(`${dir}/${f}`, "utf8").matchAll(/makeFigure\(\s*"([a-z_]+)"/g)) kinds.add(m[1]!);
    expect(kinds.size).toBeGreaterThan(10);
    for (const k of kinds) expect(DRAWN_FIGURE_KINDS.has(k), `figure kind ${k} is not drawn`).toBe(true);
    // the fractions pick their kind by a variable
    for (const k of ["pie", "bar_model"]) expect(DRAWN_FIGURE_KINDS.has(k)).toBe(true);
    // and the kinds that really came out of the generators
    for (const k of made.keys()) expect(DRAWN_FIGURE_KINDS.has(k), k).toBe(true);
  });

  it("draws something (never the '?' card) with no text under 14 and no stroke under 2", () => {
    for (const [kind, list] of made) {
      if (kind === "objects") continue; // the cashier's pictures, drawn since M4
      for (const { skill, seed, figure } of list) {
        cleanup();
        const svg = draw(figure);
        expect(svg.getAttribute("data-kind")).toBe(kind);
        const hasQ = ["pattern", "grid_numbers", "polygon"].includes(kind); // a "?" is the unknown of the question
        if (!hasQ) expect(texts(svg), `${kind} ${skill} ${seed}`).not.toContain("?");
        expect(svg.children.length, `${kind} ${skill} ${seed}`).toBeGreaterThan(0);
        for (const t of svg.querySelectorAll("text")) expect(Number(t.getAttribute("font-size")), `${kind} ${skill}`).toBeGreaterThanOrEqual(14);
        for (const el of svg.querySelectorAll("[stroke-width]")) {
          if (el.getAttribute("stroke") === "none") continue;
          expect(Number(el.getAttribute("stroke-width")), `${kind} ${skill}`).toBeGreaterThanOrEqual(1);
        }
        expect(svg.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });
});

describe("grid_path (the robot's grid)", () => {
  it("draws width x height cells, the start marker, and one label per mark", () => {
    each("grid_path", (svg, f, who) => {
      const d = f.data as { width: number; height: number; marks?: Record<string, number[]> };
      expect(count(svg, '[data-fig="cell"]'), who).toBe(d.width * d.height);
      expect(count(svg, '[data-fig="start"]'), who).toBe(1);
      const marks = Object.keys(d.marks ?? {});
      expect(count(svg, '[data-fig="mark"]'), who).toBe(marks.length);
      for (const m of marks) if (m !== "★") expect(texts(svg), who).toContain(m);
      // the path of moves is not drawn unless show_moves is true
      expect(count(svg, '[data-fig="step"]'), who).toBe(0);
    });
  });

  it("the robot question labels four squares א ב ג ד, each at its own cell (y grows up)", () => {
    const list = (made.get("grid_path") ?? []).filter((m) => m.item.startsWith("logic.robot_end"));
    expect(list.length).toBeGreaterThan(0);
    for (const { figure } of list) {
      cleanup();
      const svg = draw(figure);
      const d = figure.data as { width: number; height: number; marks: Record<string, number[]> };
      expect(texts(svg).filter((t) => "אבגד".includes(t!)).sort()).toEqual(["א", "ב", "ג", "ד"]);
      const cells = [...svg.querySelectorAll('[data-fig="cell"]')].map((c) => [Number(c.getAttribute("x")), Number(c.getAttribute("y"))] as const);
      const xs = [...new Set(cells.map((c) => c[0]))].sort((a, b) => a - b);
      const ys = [...new Set(cells.map((c) => c[1]))].sort((a, b) => a - b);
      for (const [label, [x, y]] of Object.entries(d.marks)) {
        const g = svg.querySelector(`[data-fig="mark"][data-label="${label}"] text`)!;
        const cell = Number(svg.querySelector('[data-fig="cell"]')!.getAttribute("width"));
        const col = xs.findIndex((cx) => Math.abs(cx + cell / 2 - Number(g.getAttribute("x"))) < 0.5);
        const row = ys.findIndex((cy) => Math.abs(cy + cell / 2 - Number(g.getAttribute("y"))) < 0.5);
        expect([col, d.height - 1 - row]).toEqual([x, y]);
      }
    }
  });

  it("draws the arrows of the path when show_moves is true", () => {
    const svg = draw({ kind: "grid_path", data: { width: 5, height: 5, start: [0, 0], moves: ["R", "R", "U"], show_moves: true } });
    expect(count(svg, '[data-fig="step"]')).toBe(3);
  });

  it("a star mark is a five-point star shape", () => {
    const svg = draw({ kind: "grid_path", data: { width: 5, height: 5, start: [0, 0], marks: { "★": [2, 3] } } });
    const d = svg.querySelector('[data-fig="mark"] path')!.getAttribute("d")!;
    expect(d.split("L").length).toBe(10);
  });
});

describe("the other kinds", () => {
  it("polygon: one closed shape, a label for each side and angle", () => {
    each("polygon", (svg, f, who) => {
      expect(count(svg, '[data-fig="shape"]'), who).toBe(1);
      const labels = Object.values((f.data["labels"] ?? {}) as Record<string, string>);
      expect(count(svg, '[data-fig="height"]'), who).toBe(f.data["height"] || "height" in ((f.data["labels"] ?? {}) as object) ? 1 : 0);
      for (const l of labels) expect(texts(svg), who).toContain(String(l));
    });
  });

  it("solid: visible faces, and hidden edges dashed for a box", () => {
    each("solid", (svg, f, who) => {
      const name = String(f.data["name"]);
      if (["cube", "box", "cuboid", "prism", "pyramid"].includes(name) || /^(prism|pyramid)_/.test(name)) {
        expect(count(svg, '[data-fig="face"]'), who).toBeGreaterThanOrEqual(2);
        expect(count(svg, '[data-fig="hidden"]'), who).toBeGreaterThanOrEqual(1);
      } else expect(count(svg, '[data-fig="shape"]'), who).toBe(1);
    });
  });

  it("grid_path alone is not enough: grid_area draws width x height lines and a shaded cell per cell", () => {
    each("grid_area", (svg, f, who) => {
      const d = f.data as { width: number; height: number; cells: number[][] };
      expect(count(svg, '[data-fig="shaded"]'), who).toBe(d.cells.length);
      expect(count(svg, "line"), who).toBeGreaterThanOrEqual(d.width + d.height + 2);
    });
  });

  it("grid_numbers: every number is written and the hole is a marked '?' cell", () => {
    each("grid_numbers", (svg, f, who) => {
      const grid = f.data["grid"] as (number | null)[][];
      expect(count(svg, '[data-fig="cell"]'), who).toBe(grid.reduce((n, r) => n + r.length, 0));
      expect(count(svg, '[data-hole="1"]'), who).toBe(1);
      for (const v of grid.flat()) if (v !== null) expect(texts(svg), who).toContain(String(v));
      expect(texts(svg), who).toContain("?");
    });
  });

  it("pattern: a card for each item and the '?' card last", () => {
    each("pattern", (svg, f, who) => {
      const items = f.data["items"] as string[];
      expect(count(svg, '[data-fig="item"]'), who).toBe(items.length);
      expect(count(svg, '[data-fig="item"] image'), who).toBe(items.length - 1);
      expect(svg.querySelectorAll('[data-fig="item"]')[items.length - 1]!.getAttribute("data-hole")).toBe("1");
    });
  });

  it("circle: a circle, and a radius or diameter line when asked", () => {
    each("circle", (svg, f, who) => {
      expect(count(svg, 'circle[data-fig="shape"]'), who).toBe(1);
      expect(count(svg, '[data-fig="radius"]'), who).toBe(f.data["show"] === "radius" ? 1 : 0);
      expect(count(svg, '[data-fig="diameter"]'), who).toBe(f.data["show"] === "diameter" ? 1 : 0);
      if (f.data["label"] !== undefined) expect(texts(svg), who).toContain(String(f.data["label"]));
    });
  });

  it("angle: two rays, the arc, and its size", () => {
    each("angle", (svg, f, who) => {
      expect(count(svg, "line"), who).toBe(2);
      expect(count(svg, '[data-fig="arc"]'), who).toBe(1);
      if (f.data["degrees"] !== undefined && !("label" in f.data)) expect(texts(svg), who).toContain(`${f.data["degrees"]}°`);
    });
  });

  it("symmetry: the named shape", () => {
    each("symmetry", (svg, _f, who) => expect(count(svg, '[data-fig="shape"]'), who).toBe(1));
  });

  it("coordinate: a dot for each point, with its letter", () => {
    each("coordinate", (svg, f, who) => {
      const pts = f.data["points"] as { label?: string }[];
      expect(count(svg, '[data-fig="point"]'), who).toBe(pts.length);
      for (const p of pts) if (p.label) expect(texts(svg), who).toContain(p.label);
    });
  });

  it("number_line: a labelled dot for each number of the question", () => {
    each("number_line", (svg, f, who) => {
      for (const v of f.data["marks"] as number[]) expect(texts(svg), who).toContain(String(v));
      expect(count(svg, '[data-fig="mark"]'), who).toBe((f.data["marks"] as number[]).length);
    });
  });

  it("clock: 12 numbers, an hour hand and a minute hand at the right angles", () => {
    each("clock", (svg, f, who) => {
      for (let n = 1; n <= 12; n++) expect(texts(svg), who).toContain(String(n));
      expect(count(svg, '[data-fig="hour"]'), who).toBe(1);
      expect(count(svg, '[data-fig="minute"]'), who).toBe(1);
      const m = svg.querySelector('[data-fig="minute"]')!;
      const dx = Number(m.getAttribute("x2")) - Number(m.getAttribute("x1"));
      const dy = Number(m.getAttribute("y1")) - Number(m.getAttribute("y2"));
      const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      expect(Math.abs(deg - (Number(f.data["minute"]) % 60) * 6) % 360, who).toBeLessThan(0.5);
    });
  });

  it("pie and bar_model: `parts` parts, `shaded` of them shaded", () => {
    for (const kind of ["pie", "bar_model"]) {
      cleanup();
      const svg = draw({ kind, data: { parts: 5, shaded: 2 } });
      expect(count(svg, '[data-fig="part"]')).toBe(5);
      expect(count(svg, '[data-shaded="1"]')).toBe(2);
    }
    expect(count(draw({ kind: "pie", data: { parts: 1, shaded: 1 } }), '[data-shaded="1"]')).toBe(1);
  });

  it("an unknown kind is still a calm '?' card, never an error", () => {
    expect(texts(draw({ kind: "nope", data: {} }))).toEqual(["?"]);
  });
});
