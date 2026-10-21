/**
 * The map's event scripts, run the old game's way (docs/app/INVENTORY.md
 * §4.2; tuxemon/event/, mods/nagmon/event/), as pure logic: the screens
 * (the dialog, the quiz) are reached through an {@link EventHost}.
 *
 * - An event without a behaviour runs whenever its conditions hold and
 *   it is not running ("auto"): after the map opens and after every talk,
 *   until none holds. Branching is done by events gated on variables.
 * - A `talk <npc>` event runs when the player talks to that person.
 * - Actions run in order. Conditions have no side effects.
 *
 * Milestone M4 runs the subset the cashier needs. An event with an action
 * this interpreter does not know never runs (not half of it): it waits
 * for a later milestone and the log says so once. A condition it does not
 * know never holds.
 */
import { placeEgg, type Pools } from "../game/eggs";
import type { Facts } from "../game/facts";
import { type Economy } from "../game/items";
import { grant, type Loot, type Prize, pickPrize } from "../game/loot";
import type { Action, Condition, WorldEvent } from "./mapData";
import { countOneMore, countToday, type WorldState } from "./worldState";

/** What `ask_quiz` writes into its variable (mods/nagmon/event/actions/ask_quiz.py). */
export type QuizWord = "super" | "correct" | "wrong" | "skip";

export interface EventHost {
  /** Shows a catalogue text (a msgid) as a dialog; resolves when the child has read it. */
  say(msgid: string, speaker: string | null): Promise<void>;
  /**
   * Asks a question on `topic` (a subject, or a skill id with a dot).
   * `answered` is called the moment the child answers, before the
   * feedback is closed; the quiz resolves when it closes. A quiz closed
   * without an answer (Android's back) never calls it.
   */
  quiz(topic: string, context: string, answered: (word: QuizWord) => void): Promise<void>;
  /**
   * The saved part of the world changed (coins, a variable): save it now.
   * Called before the event waits on the child (a dialog, a question) and
   * at its end, so the steps between are saved together: a kill never
   * keeps a cleared variable without the coins it paid.
   */
  changed(): void;
  /**
   * A whole screen of the game over the map: the shop (`open_shop`), the
   * Rest Center (`open_rest`). Resolves when the child closes it.
   */
  screen?(kind: ScreenKind, arg: string): Promise<void>;
  /** Shows what was found (a chest opened, an item given); resolves when the child has seen it. */
  found?(found: Found): Promise<void>;
  /**
   * A chest's question was answered wrong: the child tries again, opens
   * the small gift, or leaves the chest as it is (Android's back). A host
   * without it gives the gift, so nobody is stuck.
   */
  chestWrong?(chest: string): Promise<"again" | "gift" | "leave">;
  /** A sign's fact: its picture and its line. */
  fact?(fact: { emoji: string; text: string }): Promise<void>;
  warn?(message: string): void;
}

/** The screens an event may open. */
export type ScreenKind = "shop" | "rest";

/** What a child found: a chest's prize, its consolation gift, or an item given on the spot. */
export interface Found {
  prize: Prize;
  how: "chest" | "consolation" | "item";
}

/** What the world objects (`give_item`, `open_chest`, `place_egg`, `show_fact`) need to know. */
export interface WorldObjects {
  economy: Economy;
  loot: Loot;
  facts: Facts;
  /** The creatures of a zone, for an egg that hatches. */
  pools: Pools;
  /** The zone of this map (its encounter table): where `place_egg` warms an egg when the event does not say. */
  zone: string;
}

export interface RunnerOptions {
  /** The playing child's grade, 0 (kindergarten) to 9. */
  grade: number;
  /** The phone's local day, `YYYY-MM-DD` (worldState.localDay). */
  today: () => string;
  /**
   * Who the player may talk to; everyone when not given. M4 opens the
   * cashier only: the others' quests need actions of later milestones.
   */
  talkTo?: ReadonlySet<string>;
  /** What the world objects need; without it their events stop and say so. */
  objects?: WorldObjects;
}

/** The actions this interpreter runs. */
export const ACTIONS: ReadonlySet<string> = new Set([
  "translated_dialog",
  "set_variable",
  "clear_variable",
  "modify_money",
  "nagmon_daily_count",
  "ask_quiz",
  "create_npc",
  "char_face",
  "open_shop",
  "open_rest",
  "give_item",
  "open_chest",
  "place_egg",
  "show_fact",
]);

/** The conditions it knows; any other never holds. */
export const CONDITIONS: ReadonlySet<string> = new Set([
  "variable_set",
  "one_of",
  "char_exists",
  "profile_grade_at_least",
  "nagmon_daily_below",
]);

export interface ConditionContext {
  variables: ReadonlyMap<string, string>;
  characters: ReadonlySet<string>;
  grade: number;
  today: string;
}

/** `key:value` at the first colon; a key alone has no value. */
function keyValue(arg: string): [string, string | undefined] {
  const at = arg.indexOf(":");
  return at < 0 ? [arg, undefined] : [arg.slice(0, at), arg.slice(at + 1)];
}

export function conditionHolds(c: Condition, ctx: ConditionContext): boolean {
  let value: boolean;
  switch (c.type) {
    case "variable_set": {
      const [key, want] = keyValue(c.args[0] ?? "");
      const have = ctx.variables.get(key);
      value = want === undefined ? have !== undefined : have === want;
      break;
    }
    case "one_of": {
      const have = ctx.variables.get(c.args[0] ?? "");
      value = have !== undefined && (c.args[1] ?? "").split(":").includes(have);
      break;
    }
    case "char_exists":
      value = ctx.characters.has(c.args[0] ?? "");
      break;
    case "profile_grade_at_least":
      value = ctx.grade >= Number(c.args[0]);
      break;
    case "nagmon_daily_below":
      value = countToday(ctx.variables, c.args[0] ?? "", ctx.today) < Number(c.args[1]);
      break;
    default:
      return false;
  }
  return c.operator === "not" ? !value : value;
}

/** The actions of an event this interpreter cannot run yet. */
export function unknownActions(e: WorldEvent): string[] {
  return [...new Set(e.actions.map((a) => a.type).filter((t) => !ACTIONS.has(t)))];
}

/** The person a talk event is for, or null for an auto event. */
export function talkTarget(e: WorldEvent): string | null {
  return e.behaviors.find((b) => b.type === "talk")?.args[0] ?? null;
}

export class EventRunner {
  /** Who exists on this map now (`create_npc`): not saved, made again on each visit. */
  readonly characters = new Set<string>();
  private running = false;
  /** The world changed since the last `changed()`. */
  private dirty = false;
  private readonly warned = new Set<number>();
  private readonly autos: WorldEvent[];
  private readonly talks: WorldEvent[];

  constructor(
    readonly events: readonly WorldEvent[],
    readonly state: WorldState,
    private readonly host: EventHost,
    private readonly opts: RunnerOptions,
  ) {
    this.autos = events.filter((e) => talkTarget(e) === null && e.behaviors.length === 0);
    this.talks = events.filter((e) => talkTarget(e) !== null);
  }

  /** The events that never run here: an action of a later milestone (for the log). */
  waiting(): string[] {
    return this.events.filter((e) => unknownActions(e).length > 0).map((e) => e.name);
  }

  /** An event, a dialog or a quiz is under way: the map waits. */
  get busy(): boolean {
    return this.running;
  }

  private ctx(): ConditionContext {
    return { variables: this.state.variables, characters: this.characters, grade: this.opts.grade, today: this.opts.today() };
  }

  /** Whether `e` may run now: every action known and every condition holding. */
  ready(e: WorldEvent): boolean {
    const ctx = this.ctx();
    return unknownActions(e).length === 0 && e.conditions.every((c) => conditionHolds(c, ctx));
  }

  private talksFor(slug: string): WorldEvent[] {
    if (this.opts.talkTo && !this.opts.talkTo.has(slug)) return [];
    return this.talks.filter((e) => talkTarget(e) === slug && this.ready(e));
  }

  /** Whether talking to `slug` now would start something (the map's "talk" button). */
  talkable(slug: string): boolean {
    return !this.running && this.characters.has(slug) && this.talksFor(slug).length > 0;
  }

  /** The map opened: the events that hold run (who is created, a reward left from before). */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.settle();
    } finally {
      this.running = false;
    }
  }

  /** The player talks to `slug`: its talk events, then whatever they set off. False if nothing ran. */
  async talk(slug: string): Promise<boolean> {
    if (this.running || !this.characters.has(slug)) return false;
    const events = this.talksFor(slug);
    if (!events.length) return false;
    this.running = true;
    try {
      for (const e of events) if (this.ready(e)) await this.run(e);
      await this.settle();
    } finally {
      this.running = false;
    }
    return true;
  }

  /**
   * Runs the auto events that hold, in the map's order, again and again
   * until none does. Each runs at most once per settle: one whose actions
   * do not change its own conditions would otherwise run forever.
   */
  private async settle(): Promise<void> {
    const ran = new Set<number>();
    for (let pass = 0; pass <= this.autos.length; pass++) {
      let any = false;
      for (const e of this.autos) {
        if (!this.ready(e)) continue;
        if (ran.has(e.id)) {
          if (!this.warned.has(e.id)) this.host.warn?.(`Event "${e.name}" still holds after it ran; not run again`);
          this.warned.add(e.id);
          continue;
        }
        ran.add(e.id);
        any = true;
        await this.run(e);
      }
      if (!any) return;
    }
  }

  private async run(e: WorldEvent): Promise<void> {
    try {
      for (const a of e.actions) {
        try {
          await this.act(a);
        } catch (err) {
          // a broken step must not stop the game; the rest of the event is skipped
          this.host.warn?.(`Event "${e.name}" stopped at ${a.type}: ${String(err)}`);
          return;
        }
      }
    } finally {
      this.save();
    }
  }

  private objectsFor(action: string): WorldObjects {
    if (!this.opts.objects) throw new Error(`no world objects for ${action}`);
    return this.opts.objects;
  }

  /** Saves what changed, then shows what was found (a host that cannot show it just goes on). */
  private async show(found: Found): Promise<void> {
    this.save();
    await this.host.found?.(found);
  }

  /**
   * A chest with a question for a lock. A right answer opens it with the
   * next prize of its list; a wrong one (or "don't know") lets the child
   * try again or open the small consolation gift, so nobody is stuck or
   * punished. A daily chest is shut for the rest of the day once opened,
   * and one that opens once stays open: both say so kindly instead.
   */
  private async openChest(args: string[]): Promise<void> {
    const o = this.objectsFor("open_chest");
    const [id = "", topic = ""] = args;
    const chest = o.loot.chests[id];
    if (!chest || !topic) throw new Error(`bad open_chest ${args.join(",")}`);
    const vars = this.state.variables;
    const today = this.opts.today();
    const key = `chest_${id}`;
    const done = chest.repeat === "once" ? vars.get(`nagmon_${key}_done`) !== undefined : countToday(vars, key, today) > 0;
    if (done) {
      this.save();
      await this.host.say(chest.repeat === "once" ? "nagmon_world_chest_empty_once" : "nagmon_world_chest_empty_daily", null);
      return;
    }
    for (;;) {
      let word: QuizWord | null = null;
      // the answer is the child's own: it only counts once it is given (a question closed with back asks nothing)
      await this.host.quiz(topic, "chest", (w) => {
        word = w;
      });
      if (word === null) return;
      if (word === "correct" || word === "super") {
        const opens = Number(vars.get(`nagmon_${key}_n`)) || 0;
        vars.set(`nagmon_${key}_n`, String(opens + 1));
        this.close(chest.repeat, key, today);
        const got = grant(this.state, o.economy, pickPrize(chest.prizes, opens));
        this.dirty = true;
        await this.show({ prize: got, how: "chest" });
        return;
      }
      const choice = this.host.chestWrong ? await this.host.chestWrong(id) : "gift";
      if (choice === "leave") return;
      if (choice === "gift") {
        this.close(chest.repeat, key, today);
        const got = grant(this.state, o.economy, chest.consolation);
        this.dirty = true;
        await this.show({ prize: got, how: "consolation" });
        return;
      }
    }
  }

  /** The chest is shut: for today, or for ever. */
  private close(repeat: "daily" | "once", key: string, today: string): void {
    if (repeat === "once") this.state.variables.set(`nagmon_${key}_done`, "yes");
    else countOneMore(this.state.variables, key, today);
  }

  /** Hands what changed to the host to save, once. */
  private save(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.host.changed();
  }

  private async act(a: Action): Promise<void> {
    const vars = this.state.variables;
    switch (a.type) {
      case "translated_dialog":
        this.save();
        await this.host.say(a.args[0] ?? "", a.args[1] ?? null);
        return;
      case "set_variable": {
        const [key, value] = keyValue(a.args[0] ?? "");
        vars.set(key, value ?? "");
        this.dirty = true;
        return;
      }
      case "clear_variable":
        if (vars.delete(a.args[0] ?? "")) this.dirty = true;
        return;
      case "modify_money": {
        const amount = Number(a.args[1]);
        if (a.args[0] !== "player" || !Number.isFinite(amount)) throw new Error(`bad modify_money ${a.args.join(",")}`);
        if (this.state.addMoney(amount) !== 0) this.dirty = true;
        return;
      }
      case "nagmon_daily_count":
        countOneMore(vars, a.args[0] ?? "", this.opts.today());
        this.dirty = true;
        return;
      case "ask_quiz": {
        const [topic = "", variable = "", context = "quest"] = a.args;
        this.save();
        // a question with no answer (none found, or closed with back) writes nothing:
        // no reward for nothing answered (the old game wrote "skip", which paid)
        await this.host.quiz(topic, context, (word) => {
          vars.set(variable, word);
          this.dirty = true;
          // the answer is saved the moment it is given
          this.save();
        });
        return;
      }
      case "create_npc":
        this.characters.add(a.args[0] ?? "");
        return;
      case "open_shop":
      case "open_rest": {
        if (!this.host.screen) throw new Error(`no screen for ${a.type}`);
        // what changed so far is saved first: the child may stay long, and a kill must lose nothing
        this.save();
        await this.host.screen(a.type === "open_shop" ? "shop" : "rest", a.args[0] ?? "");
        return;
      }
      case "give_item": {
        const o = this.objectsFor(a.type);
        const [id = "", count = "1"] = a.args;
        const n = Number(count);
        if (!o.economy.items[id] || !Number.isInteger(n) || n < 1) throw new Error(`bad give_item ${a.args.join(",")}`);
        const got = grant(this.state, o.economy, { coins: 0, item: id, n });
        this.dirty = true;
        await this.show({ prize: got, how: "item" });
        return;
      }
      case "open_chest":
        await this.openChest(a.args);
        return;
      case "place_egg": {
        const o = this.objectsFor(a.type);
        const r = placeEgg(this.state, o.economy, a.args[0] || o.zone);
        if (r.ok) this.dirty = true;
        this.save();
        await this.host.say(r.ok ? "nagmon_world_egg_placed" : r.reason === "none" ? "nagmon_world_egg_none" : "nagmon_world_egg_full", null);
        return;
      }
      case "show_fact": {
        const o = this.objectsFor(a.type);
        const fact = o.facts[a.args[0] ?? ""];
        if (!fact) throw new Error(`unknown fact ${a.args[0] ?? ""}`);
        if (!this.host.fact) throw new Error("no screen for show_fact");
        this.save();
        await this.host.fact(fact);
        return;
      }
      case "char_face":
        // the people face the way the map's start says (mapData.readMap)
        return;
      default:
        throw new Error(`unknown action ${a.type}`);
    }
  }
}
