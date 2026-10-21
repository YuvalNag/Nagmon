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
