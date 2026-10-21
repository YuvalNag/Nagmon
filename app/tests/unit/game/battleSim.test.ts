import { beforeAll, describe, expect, it } from "vitest";
import { Battle } from "../../../src/core/game/battle";
import { type Band, QUESTION_CAP } from "../../../src/core/game/battleNumbers";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { monsterTable } from "../../../src/core/game/monsters";
import type { ContentLibrary } from "../../../src/core/learning";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { battleData, engineFor, gameJson, seeded, shipped } from "./helpers";

/**
 * Appendix A of docs/app/BATTLE_V3.md as a seeded test of the real rules (the Battle class itself, with the answers
 * scripted): the player is right with the probabilities of the tier table, takes the Sparkle when it is on a card
 * (60% of the turns), never uses swap or the Bag, and a friend that falls asleep is swapped for the next (free).
 * Level 10 wild creatures of the first chapter's families against a level 10 starter.
 */

let content: ContentLibrary;
let data: BattleData;
beforeAll(async () => {
  content = shipped();
  data = await battleData();
});
const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));
const AGE: Record<Band, number> = { A: 6, B: 9, C: 12 };
const ACC: Record<Band, { E: number; N: number }> = { A: { E: 0.9, N: 0.8 }, B: { E: 0.85, N: 0.72 }, C: { E: 0.8, N: 0.68 } };
/** Seconds of the time budget of 5.9: choose 2.0 + our animation 2.0 + the enemy's 1.5 + ticks 0.4; a question 6 s (easy) or 11 s (normal). */
const TURN_S = 5.9;
const Q_S = { E: 6, N: 11 } as const;


const starters = ["heliobud", "terrabub", "lunibble"];

interface Out {
  questions: number;
  turns: number;
  fainted: number;
  secs: number;
  capped: boolean;
  calm: boolean;
}

function fight(band: Band, seed: number): Out {
  const rng = seeded(seed);
  const world = new WorldState();
  for (const sp of starters) addCreature(world, sp, 10);
  // a random starter leads
  const lead = starters[Math.floor(rng() * 3)]!;
  world.creatures.sort((a, b) => (a.species === lead ? -1 : b.species === lead ? 1 : 0));
  const families = Object.keys(data.families);
  const wild = families[Math.floor(rng() * families.length)]!;
  const battle = new Battle({
    engine: engineFor(content, 3, 1),
    data,
    world,
    monsters,
    subjects,
    wild: { species: wild, level: 10, table: "sim" },
    clock: () => 0,
    maxChoices: null,
    age: AGE[band],
    field: new FieldLog({ info: () => {} }),
    onChange: () => {},
    rng,
  });
  let secs = 0;
  for (let guard = 0; battle.phase === "fighting" && guard < 60; guard++) {
    if (battle.needSwap) {
      const next = battle.team().find((c) => !c.fainted && c.id !== battle.partner.id);
      if (!next) break;
      battle.swap(next.id);
    }
    const open = battle.cards().filter((c) => !c.dimmed);
    // the Sparkle, when it is there and the child sees it
    const sparkle = open.find((c) => c.move.subject && battle.loves().includes(c.move.subject));
    let card = sparkle && rng() < 0.6 ? sparkle : undefined;
    if (!card) {
      const home = open.filter((c) => c.home);
      const eShare = band === "A" ? 0.3 : band === "B" ? 0.15 : 0;
      const want = rng() < eShare ? "E" : "N";
      card = home.find((c) => c.move.tier === want) ?? home[0] ?? open[0]!;
    }
    const tier = card.move.tier === "E" ? "E" : "N";
    const right = rng() < ACC[band][tier];
    battle.castScripted(card.move.id, right);
    secs += Q_S[tier] + TURN_S;
  }
  return { questions: battle.stats.questions, turns: battle.turns, fainted: battle.fainted, secs, capped: !!battle.reward?.capped, calm: battle.phase === "calm" };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

function run(band: Band, n = 2000) {
  const outs = Array.from({ length: n }, (_, i) => fight(band, 1000 + i * 7 + band.charCodeAt(0)));
  const qs = outs.map((o) => o.questions);
  return {
    q: mean(qs),
    p10: pct(qs, 0.1),
    p90: pct(qs, 0.9),
    maxQ: Math.max(...qs),
    turns: mean(outs.map((o) => o.turns)),
    maxTurns: Math.max(...outs.map((o) => o.turns)),
    minutes: mean(outs.map((o) => o.secs)) / 60,
    faint: outs.filter((o) => o.fainted > 0).length / n,
    capped: outs.filter((o) => o.capped).length / n,
    ended: outs.filter((o) => o.calm).length / n,
  };
}

describe("a wild fight, simulated 2,000 times a band (docs/app/BATTLE_V3.md 5.9 and 12.1)", () => {
  const rows: [Band, number][] = [["A", 0.72], ["B", 0.72], ["C", 0.72]];
  for (const [band, acc] of rows) {
    it(`band ${band} at ${acc * 100}% right`, () => {
      const r = run(band);
      // eslint-disable-next-line no-console
      console.log(`SIM band=${band} acc=${acc} q=${r.q.toFixed(2)} p10=${r.p10} p90=${r.p90} max=${r.maxQ} turns=${r.turns.toFixed(2)} maxTurns=${r.maxTurns} min=${r.minutes.toFixed(2)} faint=${(r.faint * 100).toFixed(1)}% capped=${(r.capped * 100).toFixed(1)}% calm=${(r.ended * 100).toFixed(1)}%`);
      expect(r.q).toBeGreaterThanOrEqual(5.5);
      expect(r.q).toBeLessThanOrEqual(9.5);
      expect(r.p90).toBeLessThanOrEqual(QUESTION_CAP[band]);
      expect(r.maxTurns).toBeLessThanOrEqual(16);
      expect(r.faint).toBeLessThan(0.05);
      expect(r.ended).toBe(1);
    });
  }
});
