import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { Tap } from "./Tap";

/** How fast a page types out, characters a second (the old game's dialogs typed too). */
export const TYPE_CPS = 45;

interface Props {
  /** The pages, each at most 120 characters (core/world/dialog.ts). */
  pages: readonly string[];
  /** The last page was read. */
  onDone: () => void;
  /** Android's back: the same as a tap (MapScreen calls it). */
  advanceRef?: MutableRefObject<(() => void) | null>;
}

/**
 * A person's words over the map (docs/app/SDD.md §4.2): Hebrew, right to
 * left, a page at a time. Each page types out in reading order.
 * - A tap while it types shows the whole page; the next tap turns the
 *   page, and after the last one the dialog closes.
 * - The whole screen takes the tap (a child taps anywhere), and the
 *   dialog is its own screen (ScreenTime, in MapScreen): the finger that
 *   closed the one before presses nothing here, and the tap that closes
 *   this one presses nothing under it.
 * - Android's back does what a tap does: it never leaves the map.
 */
export function Dialog({ pages, onDone, advanceRef }: Props) {
  const [page, setPage] = useState(0);
  const text = pages[page] ?? "";
  const chars = useRef<string[]>([]);
  chars.current = Array.from(text);
  const [shown, setShown] = useState(0);
  const full = shown >= chars.current.length;
  const closed = useRef(false);

  // types the page out, by the time gone (a slow frame does not slow the words)
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => {
      const n = Math.floor(((performance.now() - start) / 1000) * TYPE_CPS) + 1;
      setShown(Math.min(n, chars.current.length));
      if (n >= chars.current.length) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [page, text]);

  const advance = useCallback(() => {
    if (closed.current) return;
    if (!full) {
      setShown(chars.current.length);
      return;
    }
    if (page + 1 < pages.length) {
      // the new page starts empty in the same render: a quick tap types it out, never skips it
      setShown(0);
      setPage(page + 1);
      return;
    }
    closed.current = true;
    onDone();
  }, [full, page, pages.length, onDone]);

  useEffect(() => {
    if (!advanceRef) return;
    advanceRef.current = advance;
    return () => {
      if (advanceRef.current === advance) advanceRef.current = null;
    };
  }, [advanceRef, advance]);

  return (
    <div className="dialog-layer" data-screen="dialog" data-page={page} data-pages={pages.length} data-full={full}>
      <Tap id="dialog" className="dialog" aria-label={text} onTap={advance}>
        <span className="dialog-box">
          <span className="dialog-text" data-id="dialog_text" aria-hidden="true">
            {/* the rest of the page holds its place, so the box never grows as it types */}
            <span>{chars.current.slice(0, shown).join("")}</span>
            <span className="dialog-rest">{chars.current.slice(shown).join("")}</span>
          </span>
          <span className="dialog-more" aria-hidden="true">
            {full && (
              <svg viewBox="0 0 24 24">
                <path d="M4 7 H20 L12 18 Z" />
              </svg>
            )}
          </span>
        </span>
      </Tap>
    </div>
  );
}
