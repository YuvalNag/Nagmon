import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // a new id, next to the old app (org.nagmon.nagmon): the children keep
  // playing the old one until this one is ready (docs/app/SDD.md §2)
  appId: "org.nagmon.app",
  appName: "נגמון",
  webDir: "dist",
  android: {
    // no remote content, no mixed content
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // MainActivity hides the system bars and draws into the camera
      // cutout; Capacitor's own handling padded the page on older WebViews
      // (the emulator's), so the game did not cover the screen there and
      // taps landed a key off. The page keeps its own side gutter.
      insetsHandling: "disable",
    },
  },
};

export default config;
