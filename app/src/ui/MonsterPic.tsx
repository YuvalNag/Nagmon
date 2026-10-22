import type { MonsterTable } from "../core/game/monsters";
import { artFile } from "../game/artSource";

interface Props {
  monsters: MonsterTable;
  species: string;
  side?: "front" | "back";
  /** The picture's height as a share of the screen's height. */
  height?: number;
}

/**
 * A creature's picture, cut out of its sheet (db/monsters.json: the
 * sheet, and where the front and the back are). The pixels stay sharp.
 */
export function MonsterPic({ monsters, species, side = "front", height = 0.3 }: Props) {
  const sp = monsters[species]?.sprites;
  const shown = Math.max(32, Math.round(window.innerHeight * height));
  // a species with no art (an old save, a creature added without a picture): a drawn friend, never an empty hole
  if (!sp) {
    return (
      <span className="monster-pic missing" data-fallback="true" aria-hidden="true" style={{ width: shown, height: shown }}>
        <svg viewBox="0 0 64 64" width={shown} height={shown}>
          <ellipse cx="32" cy="58" rx="18" ry="4" fill="#000" opacity="0.12" />
          <path d="M32 6c14 0 24 11 24 26 0 13-9 24-24 24S8 45 8 32C8 17 18 6 32 6z" fill="#ffd27a" stroke="#c98a1b" strokeWidth="3" />
          <circle cx="23" cy="29" r="4" fill="#3b2a12" />
          <circle cx="41" cy="29" r="4" fill="#3b2a12" />
          <path d="M23 40c4 5 14 5 18 0" fill="none" stroke="#3b2a12" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  const [x, y, w, h] = side === "back" ? sp.back : sp.front;
  const k = shown / h;
  return (
    <span className="monster-pic" aria-hidden="true" style={{ width: Math.round(w * k), height: shown }}>
      <span
        style={{
          width: w,
          height: h,
          backgroundImage: `url(${artFile(sp.sheet)})`,
          backgroundPosition: `${-x}px ${-y}px`,
          transform: `scale(${k})`,
        }}
      />
    </span>
  );
}
