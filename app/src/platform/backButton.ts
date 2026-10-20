import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Android's back button. While a listener is bound, Capacitor does not
 * close the app on it, so a child pressing it while typing never drops
 * out of the game. In a browser, Escape is the back key (a keyboard, and
 * the browser tests). Returns a function that unbinds.
 */
export function bindBackButton(handler: () => void, win: Pick<Window, "addEventListener" | "removeEventListener"> = window): () => void {
  if (!Capacitor.isNativePlatform()) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat) return;
      e.preventDefault();
      handler();
    };
    win.addEventListener("keydown", onKey as EventListener);
    return () => win.removeEventListener("keydown", onKey as EventListener);
  }
  const listener = App.addListener("backButton", () => handler()).catch(() => null);
  return () => void listener.then((l) => l?.remove());
}
