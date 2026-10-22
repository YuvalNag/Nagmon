/**
 * The quest engine (docs/app/WORLD_V2.md 7, slice W3): what happens when a child talks to a person who gives a
 * quest, or to one a quest is waiting at; the board's accepted cards turned into quests; the journal's cards.
 *
 * A quest step is done WITH a person (or a prop), by talking to them: they say something, or ask the learning
 * engine's question, or take what the child brings, or ask for a choice. Nothing here draws a screen: the host
 * is a {@link QuestIO} (the event runner implements it with the dialog, the quiz and the cards), and the actions
 * a step lists (`set_variable nagmon_kitten:asked`, `give_item`, `send_letter`) are run through it, so they are
 * the event interpreter's own actions and a quest adds no engine action.
 *
 * Rules (7.5): a wrong answer never fails a quest. A wrong answer is a free retry; after `hintAfter` the owl
 * gives a hint; after `lesserAfter` the step ends in its lesser form (a share of the coins, the rest unchanged).
 * A choice with no right option (a kindness scene) pays the same whatever is chosen. "Not now" always exists.
 * Nothing is timed. A restart at any step keeps the quest where it was (every change is saved at once through
 * `io.changed`).
 */
import type { Posting, PostingSource } from "./board";
import { runnerIO, type RunnerParts } from "./runnerIO";
import { grant, type Prize } from "./loot";
import { countOf, type Economy, take } from "./items";
import { hashOf, pickDistinct } from "./dayPick";
import { boardFor, cardId, parseCardId } from "./boardGen";
import {
  activeCount,
  type ActiveQuest,
  type Card,
  coinsFor,
  countFinished,
  freshVariants,
  isEligible,
  parseQuests,
  type QuestData,
  type QuestDef,
  type QuestSave,
  type Step,
  stepCoins,
  useVariant,
  weekCount,
} from "./quests";
import { dayNumber } from "./dayPick";
import type { WorldState } from "../world/worldState";

/** What the engine needs from the screen and the interpreter. */
export interface QuestIO {
  /** A person's (or prop's) words, one page; resolves when read. */
  say(speaker: string, text: string): Promise<void>;
  /**
   * Asks the learning engine's question on a subject. Resolves with the child's answer
   * ("correct", "super", "wrong", "skip") or null when the question was closed unanswered.
   */
  ask(topic: string): Promise<string | null>;
  /** A choice of cards; resolves with the id tapped, or null when the card was closed. */
  choose(prompt: string, speaker: string, options: readonly { id: string; label: string }[]): Promise<string | null>;
  /** Runs a line of the event interpreter's own actions (`set_variable nagmon_kitten:asked`). */
  act(line: string): Promise<void>;
  /** Shows what a quest gave (coins or an item), after it was given. */
  gave(prize: Prize): Promise<void>;
  /** The saved world changed: write it now. */
  changed(): void;
}

export interface EngineOptions {
  data: QuestData;
  world: WorldState;
  economy: Economy;
  today: () => string;
  grade: () => number;
  /** A person's name as the speaker's label (a prop's comes from the rules). */
  name: (slug: string) => string;
  /** The giver's friendship goes up by the person's `quest_done` gain. */
  befriend: (slug: string) => void;
  /** The child's own number (the world's `npc_seed`). */
  seed: () => number;
  /** The weakest subjects, for the board (local). */
  weak?: () => readonly string[];
  /** One line for the parents' log: ids and counts only (never a choice of a kindness scene). */
  note?: (kind: string, p: Record<string, string | number>) => void;
}

/** A card of the journal. */
export interface JournalCard {
  id: string;
  title: string;
  emoji: string;
  /** What to do now. */
  todo: string;
  /** The step (1 based) and how many there are: the dots. */
  step: number;
  steps: number;
  /** Who to look for: the person of the current step. */
  who: string;
  whoName: string;
  /** The giver's story line of this time (a variant), if any. */
  story: string | null;
  sel: boolean;
}

export interface DoneCard {
  id: string;
  title: string;
  emoji: string;
  n: number;
}

export class QuestEngine {
  private readonly o: EngineOptions;
  /** A talk loop that is running: the engine is not re-entered. */
  private busy = false;
  /** Quests whose next step waits for the next talk (it is with the same person, but not now). */
  private deferred = new Set<string>();

  constructor(options: EngineOptions) {
    this.o = options;
    // the saved quests are read back unchecked by the world; checked here, once (a damaged save cannot put text in it)
    options.world.quests = parseQuests(options.world.quests);
  }

  /** The engine's view of the screen, made of what the event runner lends (core/game/runnerIO.ts). */
  io(parts: RunnerParts): QuestIO {
    return runnerIO(parts);
  }

  get save(): QuestSave {
    return this.o.world.quests;
  }

  get data(): QuestData {
    return this.o.data;
  }

  private get today(): string {
    return this.o.today();
  }

  private get ctx() {
    return { today: this.today, grade: this.o.grade() };
  }

  speakerOf(slug: string): string {
    return this.o.data.rules.props[slug] ?? this.o.name(slug);
  }

  // ------------------------------------------------------------------ what is asked of the engine

  /** The active quests, newest last. */
  activeIds(): string[] {
    return Object.keys(this.save.active).filter((id) => this.o.data.quests[id]);
  }

  /** The active quest whose current step is with `slug`, if any (the first in the order they were taken). */
  stepAt(slug: string, skip: ReadonlySet<string> = new Set()): { def: QuestDef; rec: ActiveQuest; step: Step } | null {
    for (const id of this.activeIds()) {
      if (skip.has(id)) continue;
      const def = this.o.data.quests[id]!;
      const rec = this.save.active[id]!;
      const step = def.steps[rec.step];
      if (step && step.npc === slug) return { def, rec, step };
    }
    return null;
  }

  /** The quests `slug` would offer now (free to take, not said "not now" to today), if the journal has room. */
  offersAt(slug: string): QuestDef[] {
    if (activeCount(this.save) >= this.o.data.rules.activeMax) return [];
    const ctx = this.ctx;
    return Object.values(this.o.data.quests)
      .filter((d) => d.offer.at === slug && isEligible(d, this.save, ctx) && this.save.declined[d.id] !== ctx.today)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /** Whether talking to `slug` now would move a quest: a step is waiting there, or an offer. */
  talkable(slug: string): boolean {
    return this.stepAt(slug) !== null || this.offersAt(slug).length > 0;
  }

  // ------------------------------------------------------------------ starting a quest

  /** Picks the variant of a quest for the child's band and the day (never one in its cooldown if another is free). */
  private variantFor(def: QuestDef, nth: number): string | undefined {
    if (!def.variants.length) return undefined;
    const r = this.o.data.rules;
    const fresh = freshVariants(def, this.save, this.o.grade(), r);
    const from = fresh.length ? fresh : def.variants;
    return from[hashOf(`${this.o.seed()}|offer|${this.today}|${def.id}|${nth}`) % from.length]!.id;
  }

  /** Takes a quest: it is active at its first step. Returns false when it cannot be taken now. */
  start(def: QuestDef, opts: { variant?: string | undefined; from?: string } = {}): boolean {
    if (this.save.active[def.id] || activeCount(this.save) >= this.o.data.rules.activeMax) return false;
    const variant = opts.variant ?? this.variantFor(def, 0);
    const rec: ActiveQuest = { step: 0, day: this.today, stepDay: this.today, wrong: 0, ent: -1 };
    if (variant) rec.variant = variant;
    if (opts.from) rec.from = opts.from;
    this.save.active[def.id] = rec;
    delete this.save.declined[def.id];
    if (variant && !opts.from) useVariant(this.save, def.id, variant);
    this.o.note?.("quest", { start: def.id, via: opts.from ? "board" : "person" });
    return true;
  }

  /** The day's board cards (made once and kept). */
  cards(day: string = this.today): Card[] {
    return boardFor(this.o.data, this.save, { today: day, grade: this.o.grade(), seed: this.o.seed(), weak: this.o.weak?.() ?? [] });
  }

  /** The day's cards as the board screen shows them (core/game/board.ts: the posting source of the quests). */
  postings(day: string = this.today): Posting[] {
    return this.cards(day).flatMap((c): Posting[] => {
      const def = this.o.data.quests[c.quest];
      if (!def?.board) return [];
      return [{ id: c.id, slot: c.slot, giver: this.speakerOf(def.giver), giverSlug: this.o.data.rules.props[def.giver] ? null : def.giver, emoji: def.emoji, goal: def.board.goal, quest: def.id }];
    });
  }

  source(): PostingSource {
    return { postings: (day) => this.postings(day) };
  }

  /**
   * Turns the board's accepted cards into quests (the contract with W2: `board.accepted`). A card whose quest is
   * active or done already, or that is not ours, only counts as seen. Returns the quests that were taken.
   */
  syncBoard(): QuestDef[] {
    const started: QuestDef[] = [];
    for (const id of Object.keys(this.o.world.board.accepted)) {
      if (this.save.taken.includes(id)) continue;
      const card = parseCardId(id);
      const def = card ? this.o.data.quests[card.quest] : undefined;
      if (!card || !def) continue;
      if (this.start(def, { variant: card.variant, from: id })) {
        started.push(def);
        this.save.taken = [...this.save.taken, id].slice(-40);
      } else if (!this.save.active[def.id]) {
        // no room in the journal: the card waits (it is still accepted) until there is
        continue;
      } else {
        this.save.taken = [...this.save.taken, id].slice(-40);
      }
    }
    return started;
  }

  /** The id of the card a quest is posted under today, for the accepted-card contract. */
  postingId(questId: string, variant?: string): string {
    return cardId(questId, this.today, variant);
  }

  // ------------------------------------------------------------------ the talk

  /** The actions that wait to run: the `enter` of the step a quest is at, once. */
  async enterPending(io: QuestIO): Promise<void> {
    for (const id of this.activeIds()) {
      const def = this.o.data.quests[id]!;
      const rec = this.save.active[id]!;
      while (rec.ent < rec.step) {
        rec.ent = rec.step;
        for (const line of def.steps[rec.step]?.enter ?? []) await this.safeAct(io, line);
        io.changed();
      }
    }
  }

  private async safeAct(io: QuestIO, line: string): Promise<void> {
    try {
      await io.act(line);
    } catch {
      // a broken action must not stop a child's quest: the rest goes on
    }
  }

  private line(variants: readonly string[], salt: string): string {
    return variants.length ? pickDistinct(variants, 1, `${this.o.seed()}|${this.today}|${salt}`)[0]! : "";
  }

  /**
   * The child talks to `slug`: the steps waiting there are done one after the other, or a quest is offered.
   * Returns whether anything was said or done. A question closed unanswered leaves the quest as it was.
   */
  async talk(slug: string, io: QuestIO): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.deferred = new Set();
    try {
      await this.enterPending(io);
      let did = false;
      for (let guard = 0; guard < 12; guard++) {
        const at = this.stepAt(slug, this.deferred);
        if (!at) break;
        did = true;
        if (await this.doStep(at, slug, io)) return did;
      }
      if (!did) did = await this.offer(slug, io);
      return did;
    } finally {
      this.busy = false;
    }
  }

  /** Offers the first quest `slug` has for the child; "not now" is always there. */
  private async offer(slug: string, io: QuestIO): Promise<boolean> {
    const list = this.offersAt(slug);
    if (!list.length) return false;
    const def = list[hashOf(`${this.o.seed()}|offerpick|${this.today}|${slug}`) % list.length]!;
    const speaker = this.speakerOf(slug);
    const lines = this.o.data.rules.lines;
    const text = this.line(def.offer.lines, `offer|${def.id}`);
    if (def.offer.ask) {
      const pick = await io.choose(text, speaker, [
        { id: "yes", label: lines.yes },
        { id: "no", label: lines.no },
      ]);
      if (pick === null) return true;
      if (pick !== "yes") {
        this.save.declined[def.id] = this.today;
        io.changed();
        return true;
      }
    } else {
      await io.say(speaker, text);
    }
    if (!this.start(def)) return true;
    io.changed();
    await this.enterPending(io);
    // the first step may be with this very person: it goes on in the same talk
    for (let guard = 0; guard < 12; guard++) {
      const at = this.stepAt(slug, this.deferred);
      if (!at) break;
      if (await this.doStep(at, slug, io)) break;
    }
    return true;
  }

  private async pay(io: QuestIO, coins: number, items: readonly { id: string; n: number }[]): Promise<void> {
    if (coins > 0) {
      const got = grant(this.o.world, this.o.economy, { coins, item: null, n: 0 });
      io.changed();
      await io.gave(got);
    }
    for (const it of items) {
      if (!this.o.economy.items[it.id]) continue;
      const got = grant(this.o.world, this.o.economy, { coins: 0, item: it.id, n: it.n });
      io.changed();
      await io.gave(got);
    }
  }

  /** One step with the person. True ends the talk (the child must come back, or closed the question). */
  private async doStep(at: { def: QuestDef; rec: ActiveQuest; step: Step }, slug: string, io: QuestIO): Promise<boolean> {
    const { def, rec, step } = at;
    const r = this.o.data.rules;
    const speaker = this.speakerOf(slug);
    const idx = rec.step;
    // a chain's next link waits for another day
    if (step.afterDays > 0 && dayNumber(this.today) - dayNumber(rec.stepDay) < step.afterDays) {
      await io.say(speaker, r.lines.later);
      return true;
    }
    let lesser = false;
    if (step.kind === "ask") {
      // the story around the question (the baker's variant), once, before the first try
      const story = def.variants.find((v) => v.id === rec.variant)?.text;
      if (story && rec.wrong === 0) await io.say(speaker, story);
      for (;;) {
        const word = await io.ask(step.topic!);
        if (word === null) return true;
        if (word === "correct" || word === "super") break;
        rec.wrong += 1;
        io.changed();
        if (rec.wrong >= r.lesserAfter) {
          lesser = true;
          await io.say(speaker, r.lines.lesser);
          break;
        }
        if (rec.wrong === r.hintAfter) await io.say(r.lines.owl, r.lines.hint);
        else await io.say(speaker, r.lines.retry);
      }
    } else if (step.kind === "bring") {
      const need = step.n ?? 1;
      if (countOf(this.o.world, step.item!) < need) {
        await io.say(speaker, step.wait || r.lines.later);
        return true;
      }
      take(this.o.world, step.item!, need);
      io.changed();
    } else if (step.kind === "choose") {
      const opts = step.options!;
      const order = [...opts].sort((a, b) => hashOf(`${this.o.seed()}|${this.today}|${def.id}|${idx}|${a.id}`) - hashOf(`${this.o.seed()}|${this.today}|${def.id}|${idx}|${b.id}`));
      for (;;) {
        const pick = await io.choose(step.prompt!, speaker, order.map((o) => ({ id: o.id, label: o.label })));
        if (pick === null) return true;
        const chosen = opts.find((o) => o.id === pick);
        if (!chosen) continue;
        if (step.correct === undefined) {
          // a kindness scene or a free choice: the person replies, the reward is the same for every option
          await io.say(speaker, chosen.reply);
          break;
        }
        if (pick === step.correct) {
          await io.say(speaker, chosen.reply);
          break;
        }
        rec.wrong += 1;
        io.changed();
        await io.say(speaker, chosen.reply);
        if (rec.wrong >= r.lesserAfter) {
          lesser = true;
          await io.say(speaker, opts.find((o) => o.id === step.correct)!.reply);
          await io.say(speaker, r.lines.lesser);
          break;
        }
        if (rec.wrong === r.hintAfter && step.hint) await io.say(r.lines.owl, step.hint);
      }
    }
    if (!lesser && step.kind !== "choose" && step.say.length) await io.say(speaker, this.line(step.say, `${def.id}|${idx}`));
    if (lesser) rec.lesser = true;
    await this.complete(at, io, lesser);
    // the next step goes on in this talk only if it is with the same person and does not wait for another day
    const next = def.steps[rec.step];
    if (this.save.active[def.id] === rec && next && (next.later || next.afterDays > 0)) this.deferred.add(def.id);
    return false;
  }

  /** A step is done: its actions, its own reward, then the next step or the end of the quest. */
  private async complete(at: { def: QuestDef; rec: ActiveQuest; step: Step }, io: QuestIO, lesser: boolean): Promise<void> {
    const { def, rec, step } = at;
    const r = this.o.data.rules;
    for (const line of step.done) await this.safeAct(io, line);
    if (step.reward) await this.pay(io, stepCoins(step, lesser, r), step.reward.items);
    if (step.reward?.friendship) this.o.befriend(step.npc);
    const last = rec.step >= def.steps.length - 1;
    if (!last) {
      rec.step += 1;
      rec.stepDay = this.today;
      rec.wrong = 0;
      io.changed();
      await this.enterPending(io);
      return;
    }
    // the end of the quest: the final reward from the rules, then it is done
    const coins = coinsFor(def, this.save, this.today, r, lesser || rec.lesser === true);
    countFinished(this.save, def, this.today);
    this.o.note?.("quest", { done: def.id, ...(lesser || rec.lesser ? { lesser: 1 } : {}), coins });
    delete this.save.active[def.id];
    const d = this.save.done[def.id];
    this.save.done[def.id] = { day: this.today, n: (d?.n ?? 0) + 1 };
    io.changed();
    await this.pay(io, coins, def.reward.items);
    if (def.reward.friendship) this.o.befriend(def.giver);
    io.changed();
  }

  // ------------------------------------------------------------------ the journal

  /** The active quests as cards: what to do now, the dots, who to look for. */
  journal(): JournalCard[] {
    return this.activeIds().map((id) => {
      const def = this.o.data.quests[id]!;
      const rec = this.save.active[id]!;
      const s = def.steps[Math.min(rec.step, def.steps.length - 1)]!;
      return {
        id,
        title: def.title,
        emoji: def.emoji,
        todo: s.todo,
        step: rec.step + 1,
        steps: def.steps.length,
        who: s.npc,
        whoName: this.speakerOf(s.npc),
        story: def.variants.find((v) => v.id === rec.variant)?.text ?? null,
        sel: def.sel,
      };
    });
  }

  /** The finished quests, the most recent first. */
  doneShelf(): DoneCard[] {
    return Object.entries(this.save.done)
      .filter(([id]) => this.o.data.quests[id])
      .sort((a, b) => (a[1].day < b[1].day ? 1 : a[1].day > b[1].day ? -1 : a[0] < b[0] ? -1 : 1))
      .map(([id, d]) => ({ id, title: this.o.data.quests[id]!.title, emoji: this.o.data.quests[id]!.emoji, n: d.n }));
  }

  /** How many repeatable quests are done this week (the 4th pays a share). */
  weekCount(): number {
    return weekCount(this.save, this.today);
  }
}
