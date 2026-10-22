import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * docs/app/ART_DELIVERY.md, A1: no raw path of an owner picture in src/. Everything asks
 * `artUrl(id)` (src/game/art.ts) or `artFile(file)` (src/game/artSource.ts), so a picture that is
 * not in the build is drawn from its placeholder and a later slice can serve it from a pack.
 */
const SRC = join(__dirname, "..", "..", "src");
/** The one module that knows the owner's paths. */
const ALLOWED = new Set(["game/artSource.ts"]);
/** Owner picture paths, with or without the game/ prefix. */
const RAW = /(?<![\w./-])(?:game\/)?(?:art\/[\w.$]|avatars\/|sprites\/(?:monsters|npc|portraits)\/)/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx|css)$/.test(n) ? [p] : [];
  });
}

/** The code without comments (a comment may name a path). */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("raw art paths in src/", () => {
  it("finds none outside game/artSource.ts", () => {
    const hits: string[] = [];
    for (const f of files(SRC)) {
      const rel = relative(SRC, f).split("\\").join("/");
      if (ALLOWED.has(rel)) continue;
      code(readFileSync(f, "utf8"))
        .split("\n")
        // the manifest and the icons are data imports, not pictures
        .filter((l) => !/^\s*import\b.*public\/game\/art\/[\w]+\.json/.test(l))
        .forEach((line, i) => {
          if (RAW.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("would catch one (the pattern itself)", () => {
    for (const bad of ['url(game/sprites/portraits/nagmon_owl.png)', '"game/art/backdrops/moon.webp"', "`game/avatars/${k}.png`", '"sprites/npc/nagmon_owl.png"', "`art/${x}.webp`"]) {
      expect(RAW.test(bad), bad).toBe(true);
    }
    for (const fine of ['"game/emoji/1f600.svg"', "game/db/avatars.json", "`game/maps/${name}.json`", "start/", "chart/x", "game/sprites/ui/hp.png"]) {
      expect(RAW.test(fine), fine).toBe(false);
    }
  });

  it("is not fooled by comments", () => {
    expect(code("// game/art/x.webp\nconst a = 1; /* game/avatars/y.png */")).not.toMatch(RAW);
    expect(code('const u = "https://x/y";')).toContain("https://x/y");
  });
});
