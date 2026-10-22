import { economy } from "../../../src/core/game/items";
import { type Prize, grant } from "../../../src/core/game/loot";
import { type QuestIO, QuestEngine } from "../../../src/core/game/questFlow";
import { questData, type QuestData } from "../../../src/core/game/quests";
import { addDays } from "../../../src/core/world/rand";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "../game/helpers";

export const data = (): QuestData => questData(gameJson("quests.json"));
export const eco = () => economy(gameJson("economy.json"));

/** A scripted child and screen: the answers to questions and choices are given in the order asked. */
export class FakeIO implements QuestIO {
  said: { speaker: string; text: string }[] = [];
  asked: string[] = [];
  chosen: { prompt: string; options: string[] }[] = [];
  acts: string[] = [];
  gaveAll: Prize[] = [];
  saves = 0;
  constructor(
    private readonly world: WorldState,
    public answers: (string | null)[] = [],
    public picks: (string | null)[] = [],
    private readonly economyTable = eco(),
  ) {}
  async say(speaker: string, text: string) {
    this.said.push({ speaker, text });
  }
  async ask(topic: string) {
    this.asked.push(topic);
    return this.answers.length ? (this.answers.shift() ?? null) : "correct";
  }
  async choose(prompt: string, _speaker: string, options: readonly { id: string; label: string }[]) {
    this.chosen.push({ prompt, options: options.map((o) => o.id) });
    return this.picks.length ? (this.picks.shift() ?? null) : (options[0]?.id ?? null);
  }
  async act(line: string) {
    this.acts.push(line);
    const at = line.indexOf(" ");
    const word = line.slice(0, at);
    const rest = line.slice(at + 1);
    if (word === "set_variable") {
      const [k, v] = rest.split(":");
      this.world.variables.set(k!, v ?? "");
    } else if (word === "give_item") {
      const [id, n] = rest.split(",");
      grant(this.world, this.economyTable, { coins: 0, item: id!, n: Number(n) });
    } else if (word === "clear_variable") this.world.variables.delete(rest);
  }
  async gave(p: Prize) {
    this.gaveAll.push(p);
  }
  changed() {
    this.saves += 1;
  }
  text(): string {
    return this.said.map((s) => s.text).join("\n");
  }
}

export interface Rig {
  world: WorldState;
  engine: QuestEngine;
  day: { v: string };
  befriended: string[];
  io: (answers?: (string | null)[], picks?: (string | null)[]) => FakeIO;
  next: (n?: number) => void;
}

/** An engine on a fresh world, a calendar the test can move, and a child of grade 2. */
export function rig(opts: { grade?: number; day?: string; world?: WorldState; seed?: number; weak?: string[] } = {}): Rig {
  const world = opts.world ?? new WorldState();
  const day = { v: opts.day ?? "2026-10-21" };
  const befriended: string[] = [];
  const engine = new QuestEngine({
    data: data(),
    world,
    economy: eco(),
    today: () => day.v,
    grade: () => opts.grade ?? 2,
    name: (s) => s,
    befriend: (s) => befriended.push(s),
    seed: () => opts.seed ?? 12345,
    weak: () => opts.weak ?? [],
  });
  return {
    world,
    engine,
    day,
    befriended,
    io: (a, p) => new FakeIO(world, a, p),
    next: (n = 1) => {
      day.v = addDays(day.v, n);
    },
  };
}
