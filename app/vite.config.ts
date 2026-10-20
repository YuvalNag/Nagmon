import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Capacitor loads the app from the device's files: relative paths.
  base: "./",
  // Phaser (about 1.4 MB) is its own chunk, fetched when a map opens
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 1600 },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
