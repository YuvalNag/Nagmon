import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * The chapters' pictures (game/art/chapters/, tools/app/art3.py) are lazy when
 * the manifest says so: they stay in the repo and the dev server, but are left
 * out of dist/ (so out of the APK) unless the build is run with
 * NAGMON_CHAPTER_ART=1. docs/app/ART_ASSETS.md.
 */
const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, "public", "game", "art", "manifest.json");
const lazyChapters = existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath, "utf8")).chapters_lazy === true;
const shipChapters = process.env["NAGMON_CHAPTER_ART"] === "1" || !lazyChapters;

/**
 * The pictures whose files are not in this build (docs/app/ART_DELIVERY.md, A1): the app draws their
 * placeholders instead (src/game/artSource.ts). A build with all the art lists nothing.
 */
const missingArt: string[] = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, "utf8")).assets as { file: string }[])
      .map((a) => a.file)
      .filter((f) => !existsSync(join(here, "public", "game", f)))
  : [];

const leaveOutChapterArt = (): Plugin => ({
  name: "nagmon-leave-out-chapter-art",
  apply: "build",
  closeBundle() {
    if (shipChapters) return;
    // the chapters' placeholders stay with the chapters' pictures
    for (const base of ["art", join("placeholders", "art")])
      rmSync(join(here, "dist", "game", base, "chapters"), { recursive: true, force: true });
  },
});

export default defineConfig({
  plugins: [react(), leaveOutChapterArt()],
  define: { __NAGMON_CHAPTER_ART__: JSON.stringify(shipChapters), __NAGMON_ART_MISSING__: JSON.stringify(missingArt) },
  // Capacitor loads the app from the device's files: relative paths.
  base: "./",
  // Phaser (about 1.4 MB) is its own chunk, fetched when a map opens
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 1600 },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
  },
});
