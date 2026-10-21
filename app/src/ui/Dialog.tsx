import { type MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tap } from "./Tap";

/** How fast a page types out, characters a second (the old game's dialogs typed too). */
export const TYPE_CPS = 45;

interface Props {
  /** The pages, each at most 120 characters (core/world/dialog.ts). */
  pages: readonly string[];
  /** A picture behind each page (the same index; none for a page without), e.g. the owl's story cards. */
  art?: readonly (string | undefined)[];
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
export function Dialog({ pages, art, onDone, advanceRef }: Props) {
  // the page and how much of it shows; the ref holds the same, so a tap or
  // a back press always acts on what is on the screen now, even two in a row
  const [view, setView] = useState({ page: 0, shown: 0 });
  const now = useRef(view);
  const closed = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  const text = pages[view.page] ?? "";
  const chars = Array.from(text);
  const full = view.shown >= chars.length;
  const lengthOf = (page: number) => Array.from(pages[page] ?? "").length;

  const show = (v: { page: number; shown: number }) => {
    now.current = v;
    setView(v);
  };

  // types the page out, by the time gone (a slow frame does not slow the
  // words); a page already shown whole stays whole
  useEffect(() => {
    const page = view.page;
    const length = Array.from(pages[page] ?? "").length;
    const start = performance.now();
    const timer = setInterval(() => {
      const n = Math.min(length, Math.floor(((performance.now() - start) / 1000) * TYPE_CPS) + 1);
      const v = now.current;
      if (v.page === page && v.shown < n) show({ page, shown: n });
      if (n >= length) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [pages, view.page]);

  // one function for the dialog's life: the tap and Android's back
  const advance = useRef(() => {});
  advance.current = () => {
    if (closed.current) return;
    const { page, shown } = now.current;
    if (shown < lengthOf(page)) show({ page, shown: lengthOf(page) });
    // the new page starts empty: a quick tap types it out, never skips it
    else if (page + 1 < pages.length) show({ page: page + 1, shown: 0 });
    else {
      closed.current = true;
      done.current();
    }
  };

  useLayoutEffect(() => {
    if (!advanceRef) return;
    const fn = () => advance.current();
    advanceRef.current = fn;
    return () => {
      if (advanceRef.current === fn) advanceRef.current = null;
    };
  }, [advanceRef]);

  return (
    <div className="dialog-layer" data-screen="dialog" data-page={view.page} data-pages={pages.length} data-full={full}>
      {art?.[view.page] && <img className="dialog-art" data-id="dialog_art" src={art[view.page]} alt="" draggable={false} />}
      <Tap id="dialog" className="dialog" aria-label={text} onTap={() => advance.current()}>
        <span className="dialog-box">
          <span className="dialog-text" data-id="dialog_text" aria-hidden="true">
            {/* the rest of the page holds its place, so the box never grows as it types */}
            <span>{chars.slice(0, view.shown).join("")}</span>
            <span className="dialog-rest">{chars.slice(view.shown).join("")}</span>
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
