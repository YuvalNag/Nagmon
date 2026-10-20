import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
// another checkout on the same machine may be testing too: E2E_PORT moves this one
const PORT = Number(process.env.E2E_PORT ?? 4173);
const MAP_TESTS = /(map|quiz)\.spec\.ts/;
// the map projects also run the quality checks that walk the map (titles with @map)
const MAP_PROJECT_FILES = /(map|quiz|quality)\.spec\.ts/;
const ON_THE_MAP = /@map/;

/**
 * The family's phone: 2400x1080 landscape at about 2.75 device pixels
 * per CSS pixel, touch only. Screenshots come out at the phone's real
 * size, so what they show is what the child sees.
 */
export const PHONE = {
  viewport: { width: 873, height: 393 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
  locale: "he-IL",
};

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...PHONE,
    launchOptions: {
      // this container has Chromium here; CI uses Playwright's own
      executablePath: existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined,
    },
  },
  projects: [
    { name: "phone-he", use: { locale: "he-IL" }, testIgnore: MAP_TESTS, grepInvert: ON_THE_MAP },
    // the parent's phone could be in English: the game stays Hebrew
    { name: "phone-en", use: { locale: "en-US" }, testIgnore: MAP_TESTS, grepInvert: ON_THE_MAP },
    // the map draws WebGL in software here and takes the machine's CPU:
    // it runs after the others, so the tap-timing checks are not slowed by it
    { name: "map-he", use: { locale: "he-IL" }, testMatch: MAP_PROJECT_FILES, dependencies: ["phone-he", "phone-en"] },
    { name: "map-en", use: { locale: "en-US" }, testMatch: MAP_PROJECT_FILES, dependencies: ["phone-he", "phone-en"] },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
