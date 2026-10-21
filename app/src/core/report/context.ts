/**
 * What the screen showing now says about itself, read at the moment a
 * parent taps "something is wrong": the screen's name from the page's
 * `data-screen`, and the rest from the page's own marks and the crumb
 * (src/core/game/breadcrumb.ts). Nothing here changes the screen.
 */
import type { Crumb } from "../game/breadcrumb";
import type { ReportContext } from "./report";

/** The screens that ask a question (a talk's, the owl's, a battle's). */
const ASKING = new Set(["quiz", "battle-ask", "intro-ask"]);

const attr = (el: Element | null, name: string): string | null => el?.getAttribute(name) ?? null;

/** The visible screen: the last `data-screen` in the page, the one on top. */
export function visibleScreen(root: ParentNode): string {
  const all = root.querySelectorAll("[data-screen]");
  return attr(all[all.length - 1] ?? null, "data-screen") ?? "none";
}

export interface ContextSources {
  root: ParentNode;
  crumb: Crumb;
  /** The hero's facing on the map, if the map can say. */
  facing: string | null;
}

/** The screen and the parts of the game state that apply to it. */
export function collectContext({ root, crumb, facing }: ContextSources): { screen: string; context: ReportContext } {
  const screen = visibleScreen(root);
  const context: ReportContext = {};

  if (root.querySelector("[data-screen=play]")) {
    const at = crumb.snapshot();
    const num = (s: string) => (s === "?" ? null : Number(s));
    context.map = { name: at.map, x: num(at.x), y: num(at.y), facing };
  }

  const asking = [...root.querySelectorAll("[data-screen]")].map((e) => e.getAttribute("data-screen") ?? "").filter((s) => ASKING.has(s));
  const note = crumb.questionNote();
  if (asking.length && note) {
    const quiz = root.querySelector("[data-screen=quiz]");
    context.question = { ...note, phase: attr(quiz, "data-phase") };
  }

  const battle = root.querySelector("[data-screen=battle]");
  if (battle) {
    context.battle = { species: attr(battle, "data-wild") ?? "none", phase: attr(battle, "data-view") ?? "none" };
  } else if (root.querySelector("[data-screen=battle-ask]") && crumb.battleSpecies()) {
    const seal = attr(root.querySelector("[data-screen=battle-ask]"), "data-seal") === "true";
    context.battle = { species: crumb.battleSpecies()!, phase: seal ? "seal" : "question" };
  }

  const bag = root.querySelector("[data-screen=bag]");
  if (bag) context.bag = { tab: attr(bag, "data-tab") ?? "none" };

  return { screen, context };
}
