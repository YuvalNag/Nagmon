import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Android's back button. While a listener is bound, Capacitor does not
 * close the app on it, so a child pressing it while typing never drops
 * out of the game. Returns a function that unbinds; nothing in a browser.
 */
export function bindBackButton(handler: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  const listener = App.addListener("backButton", () => handler()).catch(() => null);
  return () => void listener.then((l) => l?.remove());
}
