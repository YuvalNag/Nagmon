import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
// another checkout on the same machine may be testing too: E2E_PORT moves this one
const PORT = Number(process.env.E2E_PORT ?? 4173);

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
    { name: "phone-he", use: { locale: "he-IL" } },
    // the parent's phone could be in English: the game stays Hebrew
    { name: "phone-en", use: { locale: "en-US" } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
