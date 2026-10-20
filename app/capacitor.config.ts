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
};

export default config;
