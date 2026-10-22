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
import { readFact } from "../game/journal";
import { type MailData, queueEvent } from "../game/mail";
import { grant, type Loot, type Prize, pickPrize } from "../game/loot";
import type { ObjectDefs } from "../game/objects";
import { meet } from "../game/people";
import type { QuestEngine, QuestIO } from "../game/questFlow";
import type { Chip, Spoken } from "./director";
import type { Action, Condition, WorldEvent } from "./mapData";
import { phaseOf } from "./npcs";
import { weekdayOf } from "./rand";
import { countOneMore, countToday, type WorldState } from "./worldState";

/** What `ask_quiz` writes into its variable (mods/nagmon/event/actions/ask_quiz.py). */
export type QuizWord = "super" | "correct" | "wrong" | "skip";

export interface EventHost {
  /**
   * Shows a catalogue text (a msgid) as a dialog; resolves when the child has read it.
   * `lead` is what the person of the world opened the talk with (core/world/director.ts):
   * it is the first page(s) of this same dialog, not a box of its own.
   */
  say(msgid: string, speaker: string | null, lead?: readonly string[]): Promise<void>;
  /** A line of a person of the world on its own (a greeting with no dialog of the events after it, a topic's answer); resolves when read. */
  line?(text: string): Promise<void>;
  /**
   * The topic chips of a person: resolves with the id the child tapped, or null when
   * the child is done (the "bye" button, Android's back).
   */
  topics?(slug: string, chips: readonly Chip[]): Promise<string | null>;
  /**
   * Asks a question on `topic` (a subject, or a skill id with a dot).
   * `answered` is called the moment the child answers, before the
   * feedback is closed; the quiz resolves when it closes. A quiz closed
   * without an answer (Android's back) never calls it.
   */
  quiz(topic: string, context: string, answered: (word: QuizWord) => void): Promise<void>;
  /** The tutor's lessons for an institute ("all" lists every lesson); resolves when the child closes them. */
  openTutor?(institute: string): Promise<void>;
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
  /**
   * A choice of a quest (the offer "gladly / not now", a kindness scene, a book's shelf): resolves with the id
   * tapped, or null when the card was closed (Android's back). A host without it takes the first option.
   */
  choose?(prompt: string, speaker: string, options: readonly { id: string; label: string }[]): Promise<string | null>;
  warn?(message: string): void;
}

/** The screens an event may open. */
export type ScreenKind = "shop" | "rest" | "object";

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
  /** The working objects' definitions (`open_object`, core/game/objects.ts); none when the build has none. */
  defs?: ObjectDefs;
  /** The authored letters (`send_letter <id>` queues one for the next morning). */
  mail?: MailData;
  /** The slugs of the people of the PC's directory: talking to one of them means the child has met them (core/game/people.ts). */
  people?: ReadonlySet<string>;
}

/**
 * The people of the world as the interpreter sees them (core/world/director.ts
 * implements it): who has a definition, what they say, the chips they offer
 * and who the resolver put on this map now. Any person with a definition can
 * be talked to: there is no allow-list.
 */
export interface People {
  defined(slug: string): boolean;
  /** The opening of a talk (records the talk); null if the person has no words. */
  greet(slug: string): Promise<Spoken | null>;
  /** The topic chips open now at the child's friendship. */
  chips(slug: string): readonly Chip[];
  topic(slug: string, id: string): Promise<Spoken | null>;
  farewell(slug: string): Promise<Spoken | null>;
  /** Friendship level 0 to 3, and the flags the person remembers. */
  level(slug: string): number;
  flags(slug: string): readonly string[];
  /** Who stands on this map now. */
  placed(): readonly { slug: string }[];
}

export interface RunnerOptions {
  /** The playing child's grade, 0 (kindergarten) to 9. */
  grade: number;
  /** The phone's local day, `YYYY-MM-DD` (worldState.localDay). */
  today: () => string;
  /** The phone's local hour, 0 to 23 (the day part for `phase_is`); the clock's when not given. */
  hour?: () => number;
  /** The people of the world; without them only the map's own talk events speak. */
  people?: People;
  /**
   * Who the player may talk to; everyone when not given (a test may limit it).
   * An event that uses an action this interpreter does not know never runs anyway.
   */
  talkTo?: ReadonlySet<string>;
  /** What the world objects need; without it their events stop and say so. */
  objects?: WorldObjects;
  /** The quest engine (core/game/questFlow.ts): who a quest is waiting at, offers, steps. */
  quests?: QuestEngine;
}

/**
 * The actions a quest step may run (tools/app/quests.py STEP_ACTIONS): the interpreter's own, no new ones.
 * Money is paid by the quest's reward, never by a step.
 */
export const QUEST_ACTIONS: ReadonlySet<string> = new Set(["set_variable", "clear_variable", "give_item", "send_letter"]);

/** The actions this interpreter runs. */
export const ACTIONS: ReadonlySet<string> = new Set([
  "translated_dialog",
  "set_variable",
  "clear_variable",
  "modify_money",
  "nagmon_daily_count",
  "open_tutor",
  "ask_quiz",
  "create_npc",
  "char_face",
  "open_shop",
  "open_rest",
  "give_item",
  "open_chest",
  "place_egg",
  "show_fact",
  "open_object",
  "send_letter",
  "place_npcs",
]);

/** The conditions it knows; any other never holds. */
export const CONDITIONS: ReadonlySet<string> = new Set([
  "variable_set",
  "one_of",
  "char_exists",
  "profile_grade_at_least",
  "nagmon_daily_below",
  "npcs_placed",
  "npc_here",
  "phase_is",
  "weekday_is",
  "friendship_at_least",
  "npc_flag",
]);

export interface ConditionContext {
  variables: ReadonlyMap<string, string>;
  characters: ReadonlySet<string>;
  grade: number;
  today: string;
  /** `place_npcs` has run on this map. */
  placed?: boolean;
  /** The day part and the weekday (0 = Sunday) now. */
  phase?: string;
  weekday?: number;
  /** The people of the world: friendship level and remembered flags; without them those conditions never hold. */
  friendship?: (slug: string) => number;
  npcFlags?: (slug: string) => readonly string[];
}

const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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
    case "npcs_placed":
      value = ctx.placed === true;
      break;
    case "npc_here":
      value = ctx.characters.has(c.args[0] ?? "");
      break;
    case "phase_is":
      value = ctx.phase !== undefined && (c.args[0] ?? "").split(":").includes(ctx.phase);
      break;
    case "weekday_is":
      value =
        ctx.weekday !== undefined &&
        (c.args[0] ?? "")
          .split(":")
          .some((d) => (/^\d$/.test(d) ? Number(d) : WEEKDAY_NAMES.indexOf(d)) === ctx.weekday);
      break;
    case "friendship_at_least":
      if (!ctx.friendship) return false;
      value = ctx.friendship(c.args[0] ?? "") >= Number(c.args[1]);
      break;
    case "npc_flag":
      if (!ctx.npcFlags) return false;
      value = ctx.npcFlags(c.args[0] ?? "").includes(c.args[1] ?? "");
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
  /** `place_npcs` has run. */
  private placed = false;
  /** What a person of the world just opened the talk with, until a dialog of the talk carries it. */
  private lead: string[] = [];
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
    const today = this.opts.today();
    const people = this.opts.people;
    return {
      variables: this.state.variables,
      characters: this.characters,
      grade: this.opts.grade,
      today,
      placed: this.placed,
      phase: phaseOf(this.opts.hour ? this.opts.hour() : new Date().getHours()),
      weekday: weekdayOf(today),
      ...(people ? { friendship: (s: string) => people.level(s), npcFlags: (s: string) => people.flags(s) } : {}),
    };
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

  /** Whether this person is one of the world (has a definition) and may be talked to. */
  private known(slug: string): boolean {
    return (this.opts.people?.defined(slug) ?? false) && (!this.opts.talkTo || this.opts.talkTo.has(slug));
  }

  /** Whether talking to `slug` now would start something (the map's "talk" button). */
  talkable(slug: string): boolean {
    return !this.running && this.characters.has(slug) && (this.known(slug) || this.talksFor(slug).length > 0 || (this.opts.quests?.talkable(slug) ?? false));
  }

  /** Whether the person has topic chips to offer now (the map's "ask" button). */
  askable(slug: string): boolean {
    return !this.running && this.characters.has(slug) && this.known(slug) && !!this.host.topics && (this.opts.people?.chips(slug).length ?? 0) > 0;
  }

  /** The map opened: the events that hold run (who is created, a reward left from before). */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // the board's accepted cards become quests, and the first step's actions run (a prop shows where a quest says)
      const quests = this.opts.quests;
      if (quests) {
        if (quests.syncBoard().length) this.dirty = true;
        await quests.enterPending(this.questIO());
        this.save();
      }
      await this.settle();
    } finally {
      this.running = false;
    }
  }

  /**
   * The player talks to `slug`. A person of the world opens with a line of
   * their own (the first page of the first dialog of the talk), then the
   * talk events run, then whatever they set off. False if nothing ran.
   */
  async talk(slug: string): Promise<boolean> {
    if (this.running || !this.characters.has(slug)) return false;
    const events = this.talksFor(slug);
    const person = this.known(slug);
    const quests = this.opts.quests;
    if (!events.length && !person && !quests?.talkable(slug)) return false;
    this.running = true;
    try {
      if (person) {
        const spoken = await this.opts.people!.greet(slug);
        this.dirty = true;
        this.lead = spoken ? [`${spoken.speaker}: ${spoken.text}`] : [];
      }
      for (const e of events) if (this.ready(e)) await this.run(e);
      // a quest waiting at this person, or one they offer (core/game/questFlow.ts); the greeting leads its first words
      if (quests && quests.talkable(slug) && (await quests.talk(slug, this.questIO()))) this.dirty = true;
      // someone of the town without a definition in the people system: met, and a heart more on a new day (the PC's People tab); the others have their friendship there
      if (!person && this.opts.objects?.people?.has(slug) && meet(this.state, slug, this.opts.today())) this.dirty = true;
      // no dialog of the events carried the greeting: it is said on its own, before what they set off
      if (this.lead.length) await this.flushLead();
      this.save();
      await this.settle();
    } finally {
      this.lead = [];
      this.running = false;
    }
    return true;
  }

  /**
   * The child asks `slug` about a topic: chips, an answer, chips again, until
   * the child is done; then a word of goodbye if anything was asked. A new
   * topic is a friendship point (core/world/director.ts). False if nothing ran.
   */
  async ask(slug: string): Promise<boolean> {
    const people = this.opts.people;
    if (!people || !this.askable(slug)) return false;
    this.running = true;
    try {
      let asked = 0;
      for (;;) {
        const chips = people.chips(slug);
        if (!chips.length) break;
        this.save();
        const id = await this.host.topics!(slug, chips);
        if (id === null || !chips.some((c) => c.id === id)) break;
        const spoken = await people.topic(slug, id);
        this.dirty = true;
        asked++;
        this.save();
        if (spoken) {
          await this.host.line?.(`${spoken.speaker}: ${spoken.text}`);
          const fact = spoken.fact ? this.opts.objects?.facts[spoken.fact] : undefined;
          if (fact) await this.host.fact?.(fact);
        }
      }
      if (asked > 0) {
        const bye = await people.farewell(slug);
        this.dirty = true;
        this.save();
        if (bye) await this.host.line?.(`${bye.speaker}: ${bye.text}`);
      }
    } finally {
      this.running = false;
    }
    return true;
  }

  /** What the quest engine may do through this runner (core/game/questFlow.ts `runnerIO` builds it: it stays out of the start script). */
  private questIO(): QuestIO {
    return this.opts.quests!.io({
      host: this.host,
      lead: () => this.lead.length > 0,
      flushLead: () => this.flushLead(),
      save: () => this.save(),
      mark: () => {
        this.dirty = true;
      },
      allowed: QUEST_ACTIONS,
      act: (a) => this.act(a),
      show: (prize) => this.show({ prize, how: "item" }),
    });
  }

  /** What opened the talk, if no dialog has carried it yet, said now on its own. */
  private async flushLead(): Promise<void> {
    if (!this.lead.length) return;
    const text = this.lead.join("\n");
    this.lead = [];
    this.save();
    await this.host.line?.(text);
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
    if (this.lead.length) await this.flushLead();
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
    if (this.lead.length) await this.flushLead();
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
      case "translated_dialog": {
        this.save();
        const lead = this.lead;
        this.lead = [];
        await this.host.say(a.args[0] ?? "", a.args[1] ?? null, lead.length ? lead : undefined);
        return;
      }
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
        if (this.lead.length) await this.flushLead();
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
      case "open_tutor":
        if (!this.host.openTutor) throw new Error("no tutor screen");
        if (this.lead.length) await this.flushLead();
        this.save();
        await this.host.openTutor(a.args[0] || "all");
        return;
      case "create_npc":
        this.characters.add(a.args[0] ?? "");
        return;
      case "place_npcs":
        // the resolver's people (core/world/resolver.ts), decided when the map opened
        for (const p of this.opts.people?.placed() ?? []) this.characters.add(p.slug);
        this.placed = true;
        return;
      case "open_shop":
      case "open_rest": {
        if (!this.host.screen) throw new Error(`no screen for ${a.type}`);
        if (this.lead.length) await this.flushLead();
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
        if (this.lead.length) await this.flushLead();
        this.save();
        await this.host.say(r.ok ? "nagmon_world_egg_placed" : r.reason === "none" ? "nagmon_world_egg_none" : "nagmon_world_egg_full", null);
        return;
      }
      case "show_fact": {
        const o = this.objectsFor(a.type);
        const fact = o.facts[a.args[0] ?? ""];
        if (!fact) throw new Error(`unknown fact ${a.args[0] ?? ""}`);
        if (!this.host.fact) throw new Error("no screen for show_fact");
        if (this.lead.length) await this.flushLead();
        // a sign read is a fact learned: it goes in the journal, once
        if (readFact(this.state, a.args[0] ?? "", this.opts.today())) this.dirty = true;
        this.save();
        await this.host.fact(fact);
        return;
      }
      case "send_letter": {
        // an event letter (thanks from someone helped, a gift): it arrives the next morning
        const o = this.objectsFor(a.type);
        const id = a.args[0] ?? "";
        if (!o.mail?.letters[id]) throw new Error(`unknown letter ${id}`);
        if (queueEvent(this.state, o.mail, id, this.opts.today())) this.dirty = true;
        return;
      }
      case "open_object": {
        const o = this.objectsFor(a.type);
        const id = a.args[0] ?? "";
        if (!o.defs?.[id]) throw new Error(`unknown object ${id}`);
        if (!this.host.screen) throw new Error("no screen for open_object");
        // what changed so far is saved first: the child may stay long, and a kill must lose nothing
        this.save();
        await this.host.screen("object", id);
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
