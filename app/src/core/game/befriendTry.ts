/**
 * One fight's befriending (docs/app/BATTLE_V3.md 8, slice S3): what the child
 * owns, the chance a choice gives, and one try (tool and treat used up,
 * pity, Mercy, the shakes, the friend joining). `Battle` owns the phases and
 * calls this through `battle.befriend`; nothing here touches moves,
 * statuses or intents. The enemy's statuses come in through `host.statuses()`
 * (slice S2 adds Drowsy, Dizzy and the rest to that list; until then only
 * "calm", Fog 0, is there).
 */
import type { Band, BattleData } from "../data/battleTypes";
import type { Creature, WorldState } from "../world/worldState";
import { addCreature, type Growth, giveXp, PARTY_SIZE } from "./collection";
import { CATCH_POINTS } from "./battleNumbers";
import {
  autoPick,
  type BefriendRules,
  befriendRules,
  type Chance,
  chanceOf,
  isNet,
  rollShakes,
  type ChanceWord,
  type Tool,
  toolsIn,
  type Treat,
  treatsIn,
} from "./befriend";
import type { FieldLog } from "./fieldLog";
import { countOf, type Economy, give, take } from "./items";
import type { MonsterTable } from "./monsters";

/** What the child chose in the tray (an item id each, or none). */
export interface Selection {
  tool: string | null;
  treat: string | null;
}

export interface Options {
  tools: Tool[];
  treats: Treat[];
  /** The Auto choice (never a rare tool). */
  auto: Selection;
  /** The species' liked treat is known to the child (they befriended its kind before). */
  likedKnown: boolean;
  /** Tries made and failed so far in this fight. */
  tries: number;
  failed: number;
}

export type Refusal = "no_tool" | "full" | "not_now";

export interface TryResult {
  /** "refused": nothing happened and nothing was used. */
  kind: "caught" | "failed" | "refused";
  refusal: Refusal | null;
  chance: Chance | null;
  /** Shakes to show (3 for a friend), and the one that failed. */
  shakes: number;
  failedAt: number | null;
  tool: string | null;
  treat: string | null;
  gift: boolean;
  /** The net came back (the tool was not used up). */
  netBack: boolean;
  /** The word the next try with the same tool will show (pity raised it), and whether that try is sure (Mercy). */
  nextWord: ChanceWord | null;
  nextMercy: boolean;
  caught: Creature | null;
  toMeadow: boolean;
  full: boolean;
  coins: number;
  growth: Growth | null;
  /** The child already had a friend of this kind. */
  another: boolean;
  /** The treat given for another friend of the same kind. */
  giftItem: string | null;
}

const refused = (refusal: Refusal): TryResult => ({
  kind: "refused",
  refusal,
  chance: null,
  shakes: 0,
  failedAt: null,
  tool: null,
  treat: null,
  gift: false,
  netBack: false,
  nextWord: null,
  nextMercy: false,
  caught: null,
  toMeadow: false,
  full: refusal === "full",
  coins: 0,
  growth: null,
  another: false,
  giftItem: null,
});

export interface Host {
  world: WorldState;
  eco: Economy;
  monsters: MonsterTable;
  data: BattleData;
  band: Band;
  rng: () => number;
  field: FieldLog;
  onChange: () => void;
  species: string;
  level: number;
  subject: string;
  zone: string;
  gift: string | null;
  fog: () => number;
  maxFog: () => number;
  /** The enemy's statuses now, by the status table's names ("calm" at Fog 0). */
  statuses: () => string[];
  /** Befriending is allowed in this fight and phase now. */
  allowed: () => boolean;
  partnerId: () => string;
  /** The most friends the child can have (60). */
  maxCreatures: number;
}

/** The world variable that remembers the last tool and treat the child chose. */
const LAST = "nagmon_befriend_last";
/** The treat that is given with a friend of a kind the child already has. */
export const REPEAT_GIFT = "berry";
export const MAX_HEARTS = 5;

export class Befriending {
  readonly rules: BefriendRules;
  /** Tries made, and the ones that failed (pity), in this fight. */
  tries = 0;
  failed = 0;
  /** The Gift question: null not asked, true right (x1.5), false wrong or skipped (x1). */
  gift: boolean | null = null;

  constructor(private readonly h: Host) {
    this.rules = befriendRules(h.data, h.band);
  }

  private have = (id: string): number => countOf(this.h.world, id);

  private get target() {
    return { species: this.h.species, subject: this.h.subject, zone: this.h.zone };
  }

  /** The child already knows this kind (befriended one before): the liked treat shows in the tray. */
  likedKnown(): boolean {
    return this.h.world.caught.has(this.h.species);
  }

  options(): Options {
    const tools = toolsIn(this.h.eco, this.have, this.target);
    const treats = treatsIn(this.h.eco, this.have, this.h.species, this.rules);
    return { tools, treats, auto: autoPick(tools, treats), likedKnown: this.likedKnown(), tries: this.tries, failed: this.failed };
  }

  /** The choice the tray opens with: the last one if it is still in the Bag and fits, else Auto. */
  initial(): Selection {
    const o = this.options();
    const last = (this.h.world.variables.get(LAST) ?? "").split("|");
    const tool = o.tools.find((t) => t.item.id === last[0] && t.applies);
    const treat = o.treats.find((t) => t.item.id === last[1]);
    if (tool) return { tool: tool.item.id, treat: treat?.item.id ?? null };
    return o.auto;
  }

  /** The chance a choice gives now (the tray's word and the tests' number). Without a tool the chance is for no tool at all (x1). */
  chance(sel: Selection): Chance {
    const tools = toolsIn(this.h.eco, this.have, this.target);
    const tool = tools.find((t) => t.item.id === sel.tool);
    const treat = treatsIn(this.h.eco, this.have, this.h.species, this.rules).find((t) => t.item.id === sel.treat);
    return this.chanceWith(tool, treat, this.gift === true);
  }

  private chanceWith(tool: Tool | undefined, treat: Treat | undefined, gift: boolean): Chance {
    const rate = this.h.data.species[this.h.species]?.catch_rate ?? 150;
    return chanceOf(
      {
        rate,
        fogNow: this.h.fog(),
        fogMax: this.h.maxFog(),
        level: this.h.level,
        tool: tool?.mult ?? 1,
        treat: treat?.mult ?? 1,
        statuses: this.h.statuses(),
        gift,
        curious: this.h.gift === "curious",
        failed: this.failed,
        firstSafe: !!tool?.item.firstShakeSafe,
        tryNo: this.tries + 1,
      },
      this.rules,
    );
  }

  /** One try with the chosen tool and treat. */
  attempt(sel: Selection): TryResult {
    const h = this.h;
    const w = h.world;
    if (!h.allowed()) return refused("not_now");
    const tool = sel.tool ? toolsIn(h.eco, this.have, this.target).find((t) => t.item.id === sel.tool) : undefined;
    if (!tool) return refused("no_tool");
    const treat = sel.treat ? treatsIn(h.eco, this.have, h.species, this.rules).find((t) => t.item.id === sel.treat) : undefined;
    if (w.creatures.length >= h.maxCreatures) {
      // the friend count is full: it is in the Book, but nothing is used up and nobody joins
      w.seen.add(h.species);
      w.caught.add(h.species);
      h.onChange();
      return refused("full");
    }
    const chance = this.chance({ tool: tool.item.id, treat: treat?.item.id ?? null });
    const giftRight = this.gift === true;
    const roll = chance.mercy ? { ok: true, shakes: this.rules.shakes, failedAt: null } : rollShakes(chance.p, h.rng, this.rules.shakes, tool.item.firstShakeSafe);
    const another = w.caught.has(h.species);
    this.tries++;
    this.gift = null;
    w.variables.set(LAST, `${tool.item.id}|${treat?.item.id ?? ""}`);
    let netBack = false;
    // the tool and the treat are used up, win or lose; a failed net comes back with the band's chance
    if (!roll.ok && isNet(tool.item) && h.rng() < this.rules.netReturn) netBack = true;
    if (!netBack) take(w, tool.item.id);
    if (treat) take(w, treat.item.id);
    const base: TryResult = {
      kind: roll.ok ? "caught" : "failed",
      refusal: null,
      chance,
      shakes: roll.shakes,
      failedAt: roll.failedAt,
      tool: tool.item.id,
      treat: treat?.item.id ?? null,
      gift: giftRight,
      netBack,
      nextWord: null,
      nextMercy: false,
      caught: null,
      toMeadow: false,
      full: false,
      coins: 0,
      growth: null,
      another,
      giftItem: null,
    };
    if (!roll.ok) {
      this.failed++;
      // what the same tool would give on the next try (pity is in): the child sees the word move
      const next = this.chanceWith(tool, treat, false);
      base.nextWord = next.word;
      base.nextMercy = next.mercy;
    } else {
      const c = addCreature(w, h.species, h.level);
      if (treat) c.hearts = Math.min(MAX_HEARTS, (c.hearts ?? 0) + 1);
      base.caught = c;
      base.toMeadow = w.creatures.length > PARTY_SIZE;
      base.coins = h.eco.sealCoins;
      w.addMoney(base.coins);
      base.growth = giveXp(w, h.partnerId(), CATCH_POINTS);
      if (another && h.eco.items[REPEAT_GIFT] && give(w, h.eco, REPEAT_GIFT, 1)) base.giftItem = REPEAT_GIFT;
    }
    h.field.befriend({
      species: h.species,
      tool: tool.item.id,
      treat: treat?.item.id ?? "none",
      gift: giftRight,
      ok: roll.ok,
      shakes: roll.shakes,
      chance: Math.round(chance.p * 100),
      tries: this.tries,
      mercy: chance.mercy,
      netBack,
      fog: h.fog(),
      max: h.maxFog(),
    });
    if (base.caught) h.field.note("catch", { species: base.caught.species, level: base.caught.level, party: base.toMeadow ? 0 : 1 });
    h.onChange();
    return base;
  }
}
