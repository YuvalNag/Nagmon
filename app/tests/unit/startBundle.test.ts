import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the phone parses before the first screen: the page's own script plus
 * the chunks index.html preloads. The battle, the shop, the parents' area and
 * the other rarely used screens are lazy chunks and stay out of it (src/ui/lazy.tsx).
 * Checked on the build in dist/ when there is one (`npm run build` makes it);
 * the e2e check in map.spec.ts measures the same thing in a browser.
 */
export const START_LIMIT_BYTES = 450_000;

const DIST = join(__dirname, "..", "..", "dist");
const built = existsSync(join(DIST, "index.html"));

function startScripts(): string[] {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script|link rel="modulepreload")[^>]*?(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
  return [...new Set(refs)];
}

describe.skipIf(!built)("the start bundle (dist/)", () => {
  it("stays under the limit", () => {
    const files = startScripts();
    const total = files.reduce((n, f) => n + statSync(join(DIST, f)).size, 0);
    console.log(`start scripts: ${files.length} files, ${total} bytes (limit ${START_LIMIT_BYTES})`);
    expect(total).toBeLessThan(START_LIMIT_BYTES);
  });

  it("does not preload Phaser or the lazy screens", () => {
    const files = startScripts().map((f) => f.split("/").pop()!);
    for (const heavy of ["mapGame", "play", "BattleScreen", "ParentsArea", "ShopScreen", "RestScreen", "TutorScreen", "QuizScreen", "BagView", "EvolutionScene"]) {
      expect(files.some((f) => f.startsWith(heavy + "-")), heavy).toBe(false);
    }
  });

  it("has every lazy screen as a chunk of its own, loaded from the app's own files", () => {
    const chunks = readdirSync(join(DIST, "assets")).filter((f) => f.endsWith(".js"));
    for (const name of ["BattleScreen", "BagView", "RestScreen", "ShopScreen", "ParentsArea", "TutorScreen", "FriendsView", "BestiaryScreen", "TripScreen", "IntroScreen", "QuizScreen", "EvolutionScene"]) {
      expect(chunks.some((f) => f.startsWith(name + "-")), name).toBe(true);
    }
    // nothing is fetched from elsewhere: no absolute URL in an import
    for (const f of chunks.filter((c) => c.startsWith("index-"))) {
      expect(readFileSync(join(DIST, "assets", f), "utf8")).not.toMatch(/import\(\s*["']https?:/);
    }
  });
});
