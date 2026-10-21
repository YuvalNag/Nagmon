/**
 * A picture of the game's screen for a "something is wrong" report. Web
 * code cannot take one reliably (the map is WebGL in a WebView), so on
 * Android a small native plugin does it with PixelCopy
 * (android/app/src/main/java/org/nagmon/app/ScreenshotPlugin.java).
 * In a browser and in tests there is none: the report is written
 * without a picture, and nothing says so.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

interface ScreenshotPlugin {
  /** `image`: a base64 JPEG; missing when the phone could not take it. */
  take(): Promise<{ image?: string | null }>;
}

const Screenshot = registerPlugin<ScreenshotPlugin>("Screenshot");

/** A picture that does not come by now is not waited for: the sheet must not be held up. */
export const SCREENSHOT_TIMEOUT_MS = 3000;

/** The screen as a base64 JPEG (no `data:` prefix), or null. Never rejects. */
export async function takeScreenshot(timeoutMs: number = SCREENSHOT_TIMEOUT_MS): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const result = await Promise.race([Screenshot.take(), late]);
    const image = result?.image;
    return typeof image === "string" && image.length > 0 ? image : null;
  } catch {
    // an old build without the plugin, or the phone refused: no picture
    return null;
  } finally {
    clearTimeout(timer);
  }
}
