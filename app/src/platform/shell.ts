/**
 * The little the page needs from the Android app around it
 * (android/app/src/main/java/org/nagmon/app/AppShellPlugin.java):
 * - the system's font size, which the page applies itself (the WebView's
 *   own text zoom is off: it grew some text and not other, and broke the
 *   screens), up to {@link MAX_FONT_SCALE};
 * - "who plays" is on the screen: Android's `reportFullyDrawn`, which the
 *   emulator check reads as the cold start time (docs/app/SDD.md §10).
 * In a browser there is no shell: the scale stays 1.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

interface AppShellPlugin {
  fontScale(): Promise<{ value: number }>;
  fullyDrawn(): Promise<void>;
}

const AppShell = registerPlugin<AppShellPlugin>("AppShell");

/** The screens are checked up to here (Playwright and the emulator, 130%). */
export const MAX_FONT_SCALE = 1.3;

/** The system's font scale as the page uses it: never smaller, at most 130%. */
export function pageFontScale(system: number): number {
  if (!Number.isFinite(system)) return 1;
  return Math.round(Math.min(MAX_FONT_SCALE, Math.max(1, system)) * 100) / 100;
}

/** Sets `--font-scale` on the page from the system's font size. Never rejects. */
export async function applySystemFontScale(root: HTMLElement = document.documentElement): Promise<number> {
  let system = 1;
  if (Capacitor.isNativePlatform()) {
    try {
      system = (await AppShell.fontScale()).value;
    } catch {
      // an old shell: the default size
    }
  }
  const scale = pageFontScale(system);
  root.style.setProperty("--font-scale", String(scale));
  return scale;
}

/** "Who plays" is drawn, with the children on it: the app has started. */
export function reportStarted(): void {
  const w = globalThis as { __startedAt?: number };
  if (w.__startedAt !== undefined) return;
  w.__startedAt = performance.now();
  if (Capacitor.isNativePlatform()) void AppShell.fullyDrawn().catch(() => undefined);
}
