import { BOX, C, Data, Label, LW, num, path, r2, THIN, type Pt } from "./kit";

/** The clock and the fractions (pie, bar_model). */

/** A clock face: numbers 1-12, ticks, a short thick hour hand and a long thin minute hand (two lengths, not two colours alone). */
export function Clock({ data }: { data: Data }) {
  const hour = Math.trunc(num(data["hour"], 12));
  const minute = ((Math.trunc(num(data["minute"], 0)) % 60) + 60) % 60;
  const c: Pt = [BOX.x + BOX.w / 2, BOX.y + BOX.h / 2];
  const R = Math.min(BOX.w, BOX.h) / 2;
  const inner = R - LW;
  const at = (deg: number, r: number): Pt => [c[0] + r * Math.sin((deg * Math.PI) / 180), c[1] - r * Math.cos((deg * Math.PI) / 180)];
  const hourAngle = ((hour % 12) + minute / 60) * 30;
  return (
    <g>
      <circle data-fig="face" cx={c[0]} cy={c[1]} r={r2(inner)} fill={C.paper} stroke={C.ink} strokeWidth={LW} />
      {Array.from({ length: 60 }, (_, i) => {
        const long = i % 5 === 0;
        const a = at(i * 6, inner * (long ? 0.86 : 0.92));
        const b = at(i * 6, inner * 0.97);
        return <line key={i} x1={r2(a[0])} y1={r2(a[1])} x2={r2(b[0])} y2={r2(b[1])} stroke={long ? C.ink : C.soft} strokeWidth={long ? THIN : 1.6} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const p = at((i + 1) * 30, inner * 0.68);
        return (
          <Label key={i} x={p[0]} y={p[1]} size={inner * 0.2}>
            {String(i + 1)}
          </Label>
        );
      })}
      <line data-fig="hour" x1={c[0]} y1={c[1]} x2={r2(at(hourAngle, inner * 0.48)[0])} y2={r2(at(hourAngle, inner * 0.48)[1])} stroke={C.ink} strokeWidth={LW * 2} strokeLinecap="round" />
      <line data-fig="minute" x1={c[0]} y1={c[1]} x2={r2(at(minute * 6, inner * 0.8)[0])} y2={r2(at(minute * 6, inner * 0.8)[1])} stroke={C.path} strokeWidth={LW} strokeLinecap="round" />
      <circle cx={c[0]} cy={c[1]} r={LW * 1.5} fill={C.ink} />
    </g>
  );
}

function parts(data: Data): [number, number] {
  const p = Math.max(1, Math.trunc(num(data["parts"], 1)));
  return [p, Math.min(p, Math.max(0, Math.trunc(num(data["shaded"], 0))))];
}

/** A pie cut into equal parts, some shaded. */
export function Pie({ data }: { data: Data }) {
  const [n, shaded] = parts(data);
  const c: Pt = [BOX.x + BOX.w / 2, BOX.y + BOX.h / 2];
  const R = Math.min(BOX.w, BOX.h) / 2 - LW / 2;
  const at = (a: number): Pt => [c[0] + R * Math.sin(a), c[1] - R * Math.cos(a)];
  return (
    <g>
      {n === 1 ? (
        <circle data-fig="part" data-shaded={shaded ? "1" : "0"} cx={c[0]} cy={c[1]} r={R} fill={shaded ? C.fill : C.paper} />
      ) : (
        Array.from({ length: n }, (_, i) => {
          const a0 = (2 * Math.PI * i) / n;
          const a1 = (2 * Math.PI * (i + 1)) / n;
          const [p0, p1] = [at(a0), at(a1)];
          return <path key={i} data-fig="part" data-shaded={i < shaded ? "1" : "0"} d={`M${r2(c[0])} ${r2(c[1])}L${r2(p0[0])} ${r2(p0[1])}A${r2(R)} ${r2(R)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${r2(p1[0])} ${r2(p1[1])}Z`} fill={i < shaded ? C.fill : C.paper} stroke={C.ink} strokeWidth={THIN} strokeLinejoin="round" />;
        })
      )}
      <circle cx={c[0]} cy={c[1]} r={R} fill="none" stroke={C.ink} strokeWidth={LW} />
    </g>
  );
}

/** A bar cut into equal parts, some shaded. */
export function BarModel({ data }: { data: Data }) {
  const [n, shaded] = parts(data);
  const bh = Math.min(BOX.h, Math.max(BOX.w * 0.3, 24));
  const top = BOX.y + (BOX.h - bh) / 2;
  const cw = BOX.w / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} data-fig="part" data-shaded={i < shaded ? "1" : "0"} x={r2(BOX.x + i * cw)} y={r2(top)} width={r2(cw)} height={r2(bh)} fill={i < shaded ? C.fill : C.paper} stroke={C.ink} strokeWidth={THIN} />
      ))}
      <path d={path([[BOX.x, top], [BOX.x + BOX.w, top], [BOX.x + BOX.w, top + bh], [BOX.x, top + bh]], true)} fill="none" stroke={C.ink} strokeWidth={LW} />
    </g>
  );
}
