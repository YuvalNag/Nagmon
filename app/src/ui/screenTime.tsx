import { createContext, type ReactNode, useLayoutEffect, useState } from "react";

/**
 * A press that begins this soon after a screen appeared was meant for
 * the screen before it: a fast double tap on "done" must not also press
 * "next" in the same spot (docs/app/SDD.md §4).
 */
export const FRESH_MS = 280;

/** When the screen now showing appeared (performance.now()); none outside a screen. */
export const ShownAt = createContext(-Infinity);

/** Marks a new screen: mount it with a new key for each screen shown. */
export function ScreenTime({ children }: { children: ReactNode }) {
  const [at] = useState(() => performance.now());
  useLayoutEffect(() => {
    // the browser tests and the emulator check wait this out before a tap
    (globalThis as { __screenShownAt?: number }).__screenShownAt = at;
  }, [at]);
  return <ShownAt.Provider value={at}>{children}</ShownAt.Provider>;
}
