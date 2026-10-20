/**
 * Sharing text: the log ("send log") and crash reports. On Android it
 * opens the system share sheet (@capacitor/share), so the parent picks
 * where it goes; in the browser the text is downloaded as a file.
 *
 * Nothing calls this without a parent's tap (SDD §7).
 */
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { hideNames, redactSecrets } from "../core/crashReport";

export interface ShareTextOptions {
  /** The share sheet's title (and an e-mail's subject). */
  title?: string;
  /** The file name of the browser download. */
  fileName?: string;
}

/**
 * "shared": the share sheet took it; "cancelled": the parent closed it;
 * "downloaded": the browser saved it.
 */
export type ShareOutcome = "shared" | "cancelled" | "downloaded";

// The plugin rejects with this message when the sheet is dismissed.
const CANCELLED = /cancel/i;

/** Shares `text`; other failures than a closed sheet reject. */
export async function shareText(
  text: string,
  { title = "Nagmon", fileName = "nagmon.txt" }: ShareTextOptions = {},
): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ title, text, dialogTitle: title });
      return "shared";
    } catch (e) {
      if (e instanceof Error && CANCELLED.test(e.message)) return "cancelled";
      throw e;
    }
  }
  download(text, fileName);
  return "downloaded";
}

function download(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.append(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Let the download start before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export interface ShareRedactedOptions extends ShareTextOptions {
  /** The saved keys (the secret store's values). Required: never forget them. */
  secrets: Iterable<string>;
  /** Every child's name, deleted profiles included (ProfileStore.allNames). */
  names: Iterable<string>;
}

/**
 * Hides keys and the children's names once more, right before the text
 * leaves the phone, then shares it.
 */
export function shareRedacted(
  text: string,
  options: ShareRedactedOptions,
): Promise<ShareOutcome> {
  const { secrets, names, ...rest } = options ?? ({} as Partial<ShareRedactedOptions>);
  // Also at run time: a call without them would share unhidden text.
  if (!secrets || !names) return Promise.reject(new TypeError("shareRedacted needs secrets and names"));
  return shareText(hideNames(redactSecrets(text, secrets), names), rest);
}
