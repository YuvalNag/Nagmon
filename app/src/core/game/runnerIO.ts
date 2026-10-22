import type { Prize } from "./loot";
import type { QuestIO } from "./questFlow";
import type { EventHost, QuizWord } from "../world/events";
import type { Action } from "../world/mapData";

/** What the event runner lends the quest engine (see core/world/events.ts `questIO`). */
export interface RunnerParts {
  host: EventHost;
  lead: () => boolean;
  flushLead: () => Promise<void>;
  save: () => void;
  mark: () => void;
  allowed: ReadonlySet<string>;
  act: (a: Action) => Promise<void>;
  show: (p: Prize) => Promise<void>;
}

/**
 * The quest engine's view of the screen: it speaks, asks the learning engine's question, offers a choice, runs
 * the interpreter's own few actions and shows a prize, all through the runner's host. Kept in its own file so the
 * start script does not carry it.
 */
export function runnerIO(r: RunnerParts): QuestIO {
  const ready = async () => {
    if (r.lead()) await r.flushLead();
    r.save();
  };
  return {
    say: async (speaker, text) => {
      await ready();
      await r.host.line?.(speaker ? `${speaker}: ${text}` : text);
    },
    ask: async (topic) => {
      await ready();
      let word: QuizWord | null = null;
      // the answer is the child's own: only an answer given counts (a question closed with back asks nothing)
      await r.host.quiz(topic, "quest", (w) => {
        word = w;
      });
      return word;
    },
    choose: async (prompt, speaker, options) => {
      await ready();
      return r.host.choose ? r.host.choose(prompt, speaker, options) : (options[0]?.id ?? null);
    },
    act: async (line) => {
      const at = line.indexOf(" ");
      const type = at < 0 ? line : line.slice(0, at);
      if (!r.allowed.has(type)) throw new Error(`a quest may not run ${type}`);
      await r.act({ type, args: at < 0 ? [] : line.slice(at + 1).split(",") });
    },
    gave: (p) => r.show(p),
    changed: () => {
      r.mark();
      r.save();
    },
  };
}
