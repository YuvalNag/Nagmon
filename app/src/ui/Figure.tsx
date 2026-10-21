import { DRAWN_FIGURE_KINDS, type Figure as FigureData } from "../core/learning/model";
import { t } from "../i18n";

/**
 * A question's picture, drawn in SVG (crisp, right to left safe), from
 * the figure the generator made (nagmon/ui/figures.py). M4 draws the kind
 * the cashier's questions use, "objects": emoji to count, groups to add,
 * and coins and notes. The other 14 kinds are M6; until then a neutral
 * "?" card is drawn, never an error.
 */

/** The figure kinds drawn here. */
export const FIGURE_KINDS: ReadonlySet<string> = DRAWN_FIGURE_KINDS;

const W = 300;
const H = 160;

const emojiUrl = (code: string) => `game/emoji/${code}.svg`;

/** Columns and cell size for `n` items in a w x h box. */
function grid(n: number, w: number, h: number): { cols: number; rows: number; cell: number } {
  let best = { cols: 1, rows: Math.max(1, n), cell: 0 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const cell = Math.min(w / cols, h / rows);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return best;
}

function Items({ code, n, x, y, w, h }: { code: string; n: number; x: number; y: number; w: number; h: number }) {
  const { cols, rows, cell } = grid(n, w, h);
  const x0 = x + (w - cols * cell) / 2;
  const y0 = y + (h - rows * cell) / 2;
  const size = cell * 0.86;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const cx = x0 + ((i % cols) + 0.5) * cell;
        const cy = y0 + (Math.floor(i / cols) + 0.5) * cell;
        return <image key={i} href={emojiUrl(code)} x={cx - size / 2} y={cy - size / 2} width={size} height={size} />;
      })}
    </>
  );
}

const COIN_SIZES: Record<number, number> = { 1: 0.78, 2: 0.84, 5: 0.9, 10: 1.0 };

function Coins({ coins }: { coins: number[] }) {
  const { cols, rows, cell } = grid(coins.length, W, H);
  const x0 = (W - cols * cell) / 2;
  const y0 = (H - rows * cell) / 2;
  return (
    <>
      {coins.map((value, i) => {
        const cx = x0 + ((i % cols) + 0.5) * cell;
        const cy = y0 + (Math.floor(i / cols) + 0.5) * cell;
        if (value >= 20) {
          // a banknote
          const bw = cell * 0.92;
          const bh = cell * 0.5;
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={4} fill="#b9e4c9" stroke="#2f5d46" strokeWidth={2} />
              <text x={cx} y={cy} className="fig-label" fontSize={bh * 0.45}>
                {`${value} ₪`}
              </text>
            </g>
          );
        }
        const r = cell * 0.46 * (COIN_SIZES[value] ?? 0.9);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill="#f4c542" stroke="#9a6b00" strokeWidth={2.5} />
            <circle cx={cx} cy={cy} r={r * 0.8} fill="none" stroke="#c99a1c" strokeWidth={1.2} />
            <text x={cx} y={cy - r * 0.12} className="fig-label" fontSize={r * (value < 10 ? 0.8 : 0.7)}>
              {value}
            </text>
            <text x={cx} y={cy + r * 0.5} className="fig-label" fontSize={r * 0.38}>
              ₪
            </text>
          </g>
        );
      })}
    </>
  );
}

function Objects({ data }: { data: Record<string, unknown> }) {
  if (Array.isArray(data["coins"])) return <Coins coins={(data["coins"] as unknown[]).map(Number)} />;
  const code = String(data["emoji"] ?? "");
  const groups = Array.isArray(data["groups"])
    ? (data["groups"] as unknown[]).map((g) => Math.max(0, Math.trunc(Number(g))))
    : [Math.max(0, Math.trunc(Number(data["count"] ?? 0)))];
  if (groups.length <= 1) return <Items code={code} n={groups[0] ?? 0} x={0} y={0} w={W} h={H} />;
  const plus = H * 0.16;
  const gw = (W - (groups.length - 1) * plus) / groups.length;
  return (
    <>
      {groups.map((g, i) => {
        const left = i * (gw + plus);
        return (
          <g key={i}>
            <rect x={left} y={0} width={gw} height={H} rx={10} fill={i % 2 ? "#dcebff" : "#ffe7d6"} />
            <Items code={code} n={g} x={left + 6} y={6} w={gw - 12} h={H - 12} />
            {i < groups.length - 1 && (
              <path
                d={`M${left + gw + plus * 0.18} ${H / 2} h${plus * 0.64} M${left + gw + plus / 2} ${H / 2 - plus * 0.32} v${plus * 0.64}`}
                stroke="#17323a"
                strokeWidth={4}
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
    </>
  );
}

export function Figure({ figure }: { figure: FigureData }) {
  const known = FIGURE_KINDS.has(figure.kind);
  return (
    <svg className="figure" data-id="figure" data-kind={figure.kind} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("quizPicture")}>
      {known ? (
        <Objects data={(figure.data ?? {}) as Record<string, unknown>} />
      ) : (
        <g>
          <rect x={2} y={2} width={W - 4} height={H - 4} rx={12} fill="#ffffff" stroke="#9cc7d1" strokeWidth={3} />
          <text x={W / 2} y={H / 2} className="fig-label" fontSize={64} fill="#4b6870">
            ?
          </text>
        </g>
      )}
    </svg>
  );
}
