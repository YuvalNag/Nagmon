import type { MonsterTable } from "../core/game/monsters";

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
  if (!sp) return <span className="monster-pic missing" aria-hidden="true" />;
  const [x, y, w, h] = side === "back" ? sp.back : sp.front;
  const shown = Math.max(32, Math.round(window.innerHeight * height));
  const k = shown / h;
  return (
    <span className="monster-pic" aria-hidden="true" style={{ width: Math.round(w * k), height: shown }}>
      <span
        style={{
          width: w,
          height: h,
          backgroundImage: `url(game/${sp.sheet})`,
          backgroundPosition: `${-x}px ${-y}px`,
          transform: `scale(${k})`,
        }}
      />
    </span>
  );
}
