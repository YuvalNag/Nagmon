/// <reference types="node" />
/**
 * Test helpers: the real content read straight from the YAML files (as
 * PyYAML reads them), a fake clock, and the canonical JSON + hash the
 * golden tests share with `golden/make_golden.py`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type ScalarTag } from "yaml";
import { type ContentDocs, type ContentLibrary, loadContent, type LoadOptions } from "../../../src/core/learning/content";
import { Fraction } from "../../../src/core/learning/fraction";
import "../../../src/core/learning/generators";

export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const CONTENT_DIR = join(REPO_ROOT, "mods", "nagmon", "learning");

const BOOL = "tag:yaml.org,2002:bool";
/** PyYAML's booleans (YAML 1.1 without the single letters y/n). */
const PY_BOOLS: ScalarTag[] = [
  { tag: BOOL, default: true, test: /^(?:yes|Yes|YES|true|True|TRUE|on|On|ON)$/, resolve: () => true },
  { tag: BOOL, default: true, test: /^(?:no|No|NO|false|False|FALSE|off|Off|OFF)$/, resolve: () => false },
];

/** Parse YAML the way the Python content loader does (YAML 1.1, PyYAML booleans). */
export function parseYaml(text: string): unknown {
  return parse(text, {
    version: "1.1",
    customTags: (tags) => [...tags.filter((t) => (t as ScalarTag).tag !== BOOL), ...PY_BOOLS],
  });
}

/** Every YAML file under `dir`, parsed, keyed by its path relative to `dir`. */
export function readDocs(dir: string = CONTENT_DIR): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (d: string): void => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".yaml")) out[relative(dir, p).split(sep).join("/")] = parseYaml(readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return out;
}

let docsCache: ContentDocs | null = null;
let libCache: ContentLibrary | null = null;

export function realDocs(): ContentDocs {
  docsCache ??= readDocs();
  return docsCache;
}

/**
 * The real content with the ported generators. Skills whose generator is
 * not ported yet (and those that need them) are left out: `lib.skipped`.
 */
export function library(): ContentLibrary {
  libCache ??= loadContent(realDocs(), { allowMissingGenerators: true });
  return libCache;
}

/** Load a dict of YAML texts (paths under the learning folder). */
export function loadTexts(files: Readonly<Record<string, string>>, opts: LoadOptions = {}): ContentLibrary {
  const docs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(files)) docs[k] = parseYaml(dedent(v));
  return loadContent(docs, opts);
}

/** Python's `textwrap.dedent`. */
export function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => (l.trim() ? l.slice(cut) : "")).join("\n");
}

/** Injected clock: a float time that tests advance explicitly. */
export class FakeClock {
  now: number;

  constructor(start = 1_800_000_000.0) {
    this.now = start;
  }

  readonly call = (): number => this.now;

  advance(seconds: number): void {
    this.now += seconds;
  }
}

/**
 * The same canonical JSON as `make_golden.py`: keys sorted as strings (a
 * JS object would put "7" before "16"), no spaces, Fractions as text.
 */
export function canonical(x: unknown): string {
  if (x instanceof Fraction) return JSON.stringify(x.toString());
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x !== null && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(x);
}

/** FNV-1a 32 over UTF-8, continuing from `h`. */
export function fnv1a(text: string, h = 0x811c9dc5): number {
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
