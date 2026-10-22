import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * The chapters' pictures (game/art/chapters/, tools/app/art3.py) are lazy when
 * the manifest says so: they stay in the repo and the dev server, but are left
 * out of dist/ (so out of the APK) unless the build is run with
 * NAGMON_CHAPTER_ART=1. docs/app/ART_ASSETS.md.
 */
const manifestPath = join(__dirname, "public", "game", "art", "manifest.json");
const lazyChapters = existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath, "utf8")).chapters_lazy === true;
const shipChapters = process.env["NAGMON_CHAPTER_ART"] === "1" || !lazyChapters;

const leaveOutChapterArt = (): Plugin => ({
  name: "nagmon-leave-out-chapter-art",
  apply: "build",
  closeBundle() {
    if (!shipChapters) rmSync(join(__dirname, "dist", "game", "art", "chapters"), { recursive: true, force: true });
  },
});

export default defineConfig({
  plugins: [react(), leaveOutChapterArt()],
  define: { __NAGMON_CHAPTER_ART__: JSON.stringify(shipChapters) },
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
