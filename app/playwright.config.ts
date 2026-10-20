import { defineConfig } from "@playwright/test";

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
    baseURL: "http://localhost:4173",
    ...PHONE,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    },
  },
  projects: [
    { name: "phone-he", use: { locale: "he-IL" } },
    // the parent's phone could be in English: the game stays Hebrew
    { name: "phone-en", use: { locale: "en-US" } },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
