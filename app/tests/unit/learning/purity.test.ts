// @vitest-environment node
/// <reference types="node" />
/**
 * test_learning_purity.py: the learning core stays pure. It imports only
 * its own modules (no React, Phaser, Capacitor or Node), and never touches
 * the DOM, timers, storage or the network.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./helpers";

const CORE = join(REPO_ROOT, "app", "src", "core", "learning");
const FORBIDDEN_GLOBALS = /\b(window|document|localStorage|sessionStorage|fetch|XMLHttpRequest|setTimeout|setInterval|navigator|process)\b/;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("purity", () => {
  const files = sources(CORE);

  it("has sources", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => relative(CORE, f)))("%s imports only the learning core", (rel) => {
    const text = readFileSync(join(CORE, rel), "utf8");
    const imports = [...text.matchAll(/^\s*(?:import|export)\b[^"']*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1] ?? m[2]);
    for (const spec of imports) expect(spec!.startsWith("./") || spec!.startsWith("../"), `${rel}: ${spec}`).toBe(true);
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(FORBIDDEN_GLOBALS.exec(code)?.[0] ?? null, rel).toBeNull();
  });
});
