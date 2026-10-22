/** The tests' hook (docs/app/BATTLE_V3.md 12.1): `nagmon.battle.timescale` in localStorage makes every beat shorter; never set by the game. */
export function evolutionScale(): number {
  try {
    const v = localStorage.getItem("nagmon.battle.timescale");
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}
