import type { ReactNode } from "react";
import type { MoonPhase } from "../../core/world/sky";

/**
 * The pictures of the working objects, drawn here in SVG and CSS until the generated art exists
 * (docs/app/ART_NEEDED_W2.md). As in WorldArt.tsx, each picture is ONE component with a fixed props
 * contract, so the real art replaces its body and nothing else changes:
 *
 * - Pic: a picture from the emoji set by its code (facts, people, snacks)
 * - MoonArt: the moon of a phase (8 pictures)
 * - EnvelopeArt: a letter, closed or open
 * - StarIcon: the favourite star of a friend
 * - BookArt: a book on the shelf, in the colour of its subject
 * - StampArt: a reading stamp
 * - TvFrame: the TV's box around a channel
 * - FridgeArt: the open fridge with its three shelves
 */

/** A picture from the emoji set (game/emoji/<code>.svg). */
export function Pic({ code, className = "pic" }: { code: string; className?: string }) {
  return <img className={className} src={`game/emoji/${code}.svg`} alt="" draggable={false} />;
}

/** The moon of a phase: a dark disc and the lit part, lit on the right while it grows and on the left while it shrinks (the north). */
export function MoonArt({ phase, lit }: { phase: MoonPhase; lit: number }) {
  const R = 40;
  const waxing = phase === "waxing_crescent" || phase === "first_quarter" || phase === "waxing_gibbous";
  const gibbous = phase === "waxing_gibbous" || phase === "waning_gibbous";
  // the terminator is an ellipse as wide as the lit share is far from half
  const rx = phase === "first_quarter" || phase === "last_quarter" ? 0 : Math.abs(1 - 2 * Math.max(0, Math.min(1, lit))) * R;
  const outer = `M50,${50 - R} A${R},${R} 0 0 ${waxing ? 1 : 0} 50,${50 + R}`;
  const sweep = waxing ? (gibbous ? 1 : 0) : gibbous ? 0 : 1;
  const d = `${outer} A${rx},${R} 0 0 ${sweep} 50,${50 - R} Z`;
  return (
    <svg className="moon-art" viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false" data-phase={phase}>
      <circle cx="50" cy="50" r={R} fill="#26324d" stroke="#0f1830" strokeWidth="2" />
      {phase === "full" && <circle cx="50" cy="50" r={R} fill="#fff4c7" />}
      {phase !== "full" && phase !== "new" && <path d={d} fill="#fff4c7" />}
      <circle cx="50" cy="50" r={R} fill="none" stroke="#0f1830" strokeWidth="2" />
    </svg>
  );
}

/** A letter: closed with its flap, or open with a page showing. */
export function EnvelopeArt({ open = false, className = "envelope-art" }: { open?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true" focusable="false" data-open={open}>
      {open && <rect x="12" y="2" width="40" height="28" rx="3" fill="#fffdf6" stroke="#9a8a5a" strokeWidth="2" />}
      <rect x="4" y="14" width="56" height="30" rx="4" fill="#f6e3b4" stroke="#9a6b00" strokeWidth="2.5" />
      {open ? <path d="M4 16 L32 34 L60 16" fill="none" stroke="#9a6b00" strokeWidth="2.5" /> : <path d="M5 15 L32 33 L59 15" fill="#e8cf8e" stroke="#9a6b00" strokeWidth="2.5" />}
    </svg>
  );
}

/** The favourite star, full or only an outline. */
export function StarIcon({ on }: { on: boolean }) {
  return (
    <svg className="star-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-on={on}>
      <path d="M12 2.5 L14.8 9 L21.8 9.6 L16.5 14.2 L18.1 21 L12 17.4 L5.9 21 L7.5 14.2 L2.2 9.6 L9.2 9 Z" fill={on ? "#f4c542" : "none"} stroke="#9a6b00" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** A book: its cover colour is the subject's colour. */
export function BookArt({ color, children }: { color: string; children?: ReactNode }) {
  return (
    <span className="book-art" style={{ ["--book" as string]: color }} aria-hidden="true">
      <span className="book-spine" />
      <span className="book-cover">{children}</span>
    </span>
  );
}

/** A reading stamp (a small round seal with a book on it). */
export function StampArt({ className = "stamp-art" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="21" fill="#fbe3e0" stroke="#b5453a" strokeWidth="3" strokeDasharray="4 3" />
      <rect x="13" y="15" width="22" height="18" rx="2" fill="#fff" stroke="#b5453a" strokeWidth="2.5" />
      <path d="M24 15 V33" stroke="#b5453a" strokeWidth="2.5" />
    </svg>
  );
}

/** The TV's box: wood, a screen with the channel inside, two knobs. */
export function TvFrame({ children }: { children: ReactNode }) {
  return (
    <div className="tv-frame" data-id="tv_frame">
      <div className="tv-screen">{children}</div>
      <div className="tv-knobs" aria-hidden="true">
        <span />
        <span />
      </div>
    </div>
  );
}

/** The fridge: a pale box with the snacks on its shelves. */
export function FridgeArt({ children }: { children: ReactNode }) {
  return (
    <div className="fridge-art" data-id="fridge_art">
      <div className="fridge-inside">{children}</div>
      <span className="fridge-handle" aria-hidden="true" />
    </div>
  );
}
