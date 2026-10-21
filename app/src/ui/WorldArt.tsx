import type { ReactNode } from "react";

/**
 * The pictures of the places inside the houses, drawn here in SVG and CSS
 * until the generated art exists (docs/app/FEATURES.md, status table).
 * Each picture is ONE component with a fixed props contract, so the real
 * art replaces its body and nothing else changes:
 *
 * - CoinIcon: the small coin beside a price or the wallet
 * - CoinArt: a coin or a bill to pay with (value on its face)
 * - StackArt: a stack of coins (the youngest count stacks of 1 and 5)
 * - ShelfArt: the shop's shelf boards under a row of item cards
 */

/** The small coin by a price (the font has no coin sign). */
export function CoinIcon({ className = "coin-icon" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill="#f4c542" stroke="#9a6b00" strokeWidth="2" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#c99a1c" strokeWidth="1.5" />
    </svg>
  );
}

/** A coin (1, 2, 5, 10) or a bill (20, 50) with its value on its face. */
export function CoinArt({ value }: { value: number }) {
  if (value >= 20) {
    return (
      <svg className="coin-art bill" viewBox="0 0 56 36" aria-hidden="true" focusable="false">
        <rect x="2" y="3" width="52" height="30" rx="5" fill="#b9e4c9" stroke="#2f5d46" strokeWidth="2.5" />
        <circle cx="28" cy="18" r="9" fill="none" stroke="#2f5d46" strokeWidth="1.5" opacity="0.5" />
        <text x="28" y="23" textAnchor="middle" fontSize="15" fontWeight="700" fill="#17323a">
          {value}
        </text>
      </svg>
    );
  }
  const r = value >= 10 ? 21 : value >= 5 ? 19 : value >= 2 ? 17 : 15;
  return (
    <svg className="coin-art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r={r} fill="#f4c542" stroke="#9a6b00" strokeWidth="2.5" />
      <circle cx="24" cy="24" r={r - 4} fill="none" stroke="#c99a1c" strokeWidth="1.4" />
      <text x="24" y="30" textAnchor="middle" fontSize={value >= 10 ? 16 : 19} fontWeight="700" fill="#17323a">
        {value}
      </text>
    </svg>
  );
}

/** A stack of `n` coins (n is 1 or 5 in the youngest's pay step); `unit` is what each one is worth, shown when it is more than 1. */
export function StackArt({ n, unit = 1 }: { n: number; unit?: number }) {
  const h = 8;
  const coins = Math.max(1, Math.min(n, 5));
  return (
    <svg className="stack-art" viewBox="0 0 48 56" aria-hidden="true" focusable="false">
      {Array.from({ length: coins }, (_, i) => {
        const y = 40 - i * h;
        return (
          <g key={i}>
            <ellipse cx="24" cy={y + 4} rx="19" ry="7" fill="#c99a1c" stroke="#9a6b00" strokeWidth="2" />
            <ellipse cx="24" cy={y} rx="19" ry="7" fill="#f4c542" stroke="#9a6b00" strokeWidth="2" />
          </g>
        );
      })}
      {unit > 1 && (
        <text x="24" y="14" textAnchor="middle" fontSize="13" fontWeight="700" fill="#17323a">
          {unit}
        </text>
      )}
    </svg>
  );
}

/** The shelf: item cards stand on wooden boards, row after row. */
export function ShelfArt({ children }: { children: ReactNode }) {
  return (
    <div className="shelf-art" data-id="shelf">
      {children}
    </div>
  );
}

/** The nurse's desk at the Rest Center: a counter with a lamp and a little bell. */
export function DeskArt() {
  return (
    <svg className="desk-art" viewBox="0 0 120 72" role="img" aria-hidden="true" focusable="false">
      <rect x="4" y="30" width="112" height="38" rx="6" fill="#d9b27c" stroke="#9a6b3a" strokeWidth="3" />
      <rect x="4" y="26" width="112" height="10" rx="5" fill="#f0cf9a" stroke="#9a6b3a" strokeWidth="3" />
      <path d="M86 26 V12 h10" fill="none" stroke="#4b6870" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M92 6 h14 l-3 9 h-8 z" fill="#ffe08a" stroke="#c99a1c" strokeWidth="2" />
      <circle cx="30" cy="22" r="6" fill="#f4c542" stroke="#9a6b00" strokeWidth="2" />
      <rect x="24" y="26" width="12" height="3" rx="1.5" fill="#9a6b00" />
      <rect x="18" y="44" width="30" height="16" rx="3" fill="#fff6e3" stroke="#9a6b3a" strokeWidth="2" />
      <rect x="66" y="44" width="30" height="16" rx="3" fill="#fff6e3" stroke="#9a6b3a" strokeWidth="2" />
    </svg>
  );
}

/** A resting mat under a friend: soft, round, a little pillow. */
export function MatArt() {
  return (
    <svg className="mat-art" viewBox="0 0 120 40" aria-hidden="true" focusable="false">
      <ellipse cx="60" cy="24" rx="56" ry="14" fill="#b9d9e6" stroke="#6aa3b8" strokeWidth="3" />
      <ellipse cx="60" cy="22" rx="40" ry="8" fill="#d3ecf4" />
    </svg>
  );
}

/** A gift box (the daily gift): closed, or open with a shine. */
export function GiftArt({ open = false }: { open?: boolean }) {
  return (
    <svg className={`gift-art${open ? " open" : ""}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="8" y="26" width="48" height="32" rx="4" fill="#ff9fb2" stroke="#b34a62" strokeWidth="3" />
      <rect x="28" y="26" width="8" height="32" fill="#ffe08a" />
      <g transform={open ? "translate(0,-10) rotate(-12 32 24)" : undefined}>
        <rect x="5" y="14" width="54" height="14" rx="4" fill="#ffb7c6" stroke="#b34a62" strokeWidth="3" />
        <rect x="28" y="14" width="8" height="14" fill="#ffe08a" />
        <path d="M32 14 c-8 -12 -18 -4 -8 0 z M32 14 c8 -12 18 -4 8 0 z" fill="#ffe08a" stroke="#c99a1c" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** A chest, shut or open. */
export function ChestArt({ open = false }: { open?: boolean }) {
  return (
    <svg className={`chest-art${open ? " open" : ""}`} viewBox="0 0 96 80" role="img" aria-hidden="true" focusable="false">
      <rect x="8" y="34" width="80" height="40" rx="5" fill="#b9814a" stroke="#6d4620" strokeWidth="3.5" />
      <rect x="8" y="46" width="80" height="6" fill="#d9a56a" />
      {open ? (
        <>
          <path d="M10 34 L18 8 H78 L86 34 Z" fill="#c8915a" stroke="#6d4620" strokeWidth="3.5" strokeLinejoin="round" />
          <ellipse cx="48" cy="36" rx="34" ry="5" fill="#ffe08a" />
          <path d="M30 28 l4 -10 M48 26 v-12 M66 28 l-4 -10" stroke="#ffe08a" strokeWidth="3.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M8 36 Q8 10 48 10 Q88 10 88 36 Z" fill="#c8915a" stroke="#6d4620" strokeWidth="3.5" strokeLinejoin="round" />
          <rect x="40" y="34" width="16" height="16" rx="3" fill="#f4c542" stroke="#9a6b00" strokeWidth="3" />
          <circle cx="48" cy="42" r="2.5" fill="#6d4620" />
        </>
      )}
    </svg>
  );
}

/** A spotted egg. */
export function EggArt() {
  return (
    <svg className="egg-art" viewBox="0 0 48 60" role="img" aria-hidden="true" focusable="false">
      <path d="M24 3 C36 3 44 24 44 38 C44 50 35 57 24 57 C13 57 4 50 4 38 C4 24 12 3 24 3 Z" fill="#fff6e3" stroke="#9a6b3a" strokeWidth="3" />
      <circle cx="17" cy="32" r="4" fill="#7fc8a9" />
      <circle cx="31" cy="26" r="3.2" fill="#f2a65a" />
      <circle cx="29" cy="42" r="4.5" fill="#8fb3ff" />
      <circle cx="16" cy="46" r="2.5" fill="#ffb7c6" />
    </svg>
  );
}

/**
 * An egg inside a ring that fills as right answers warm it: `got` of
 * `need` (the Friends screen).
 */
export function EggRing({ got, need }: { got: number; need: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = need > 0 ? Math.max(0, Math.min(1, got / need)) : 0;
  return (
    <span className="egg-ring" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={got}>
      <svg className="egg-ring-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#d3ecf4" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="#f2a65a" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 32 32)" data-share={share.toFixed(2)} />
      </svg>
      <span className="egg-ring-egg">
        <EggArt />
      </span>
    </span>
  );
}

/** A sign or notice board with a picture on it. */
export function NoticeArt({ children }: { children: ReactNode }) {
  return (
    <span className="notice-art">
      <span className="notice-board">{children}</span>
      <span className="notice-post" aria-hidden="true" />
    </span>
  );
}
