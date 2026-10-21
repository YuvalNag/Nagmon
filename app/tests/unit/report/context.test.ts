import { describe, expect, it } from "vitest";
import { Crumb } from "../../../src/core/game/breadcrumb";
import { collectContext, visibleScreen } from "../../../src/core/report/context";

function page(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

const question = {
  item_id: "add.1",
  skill_id: "math.add",
  difficulty: 2,
  kind: "choice",
  choices: [
    { id: "a", text_he: "חמש" },
    { id: "b", text_he: "שש" },
  ],
  figure: { kind: "bar" },
};

describe("the visible screen", () => {
  it("is the last data-screen: the one on top", () => {
    expect(visibleScreen(page(`<main data-screen="play"><div data-screen="map-menu"></div></main>`))).toBe("map-menu");
    expect(visibleScreen(page(`<p></p>`))).toBe("none");
  });
});

describe("what the screen says", () => {
  it("on the map: the map, the tile and the facing", () => {
    const crumb = new Crumb();
    crumb.position("town", 12, 7);
    const { screen, context } = collectContext({ root: page(`<main data-screen="play"></main>`), crumb, facing: "up" });
    expect(screen).toBe("play");
    expect(context).toEqual({ map: { name: "town", x: 12, y: 7, facing: "up" } });
  });

  it("a question over the map: the item, skill, level, choices and the figure", () => {
    const crumb = new Crumb();
    crumb.question(question);
    const root = page(`<main data-screen="play"><section data-screen="quiz" data-phase="question"></section></main>`);
    const { screen, context } = collectContext({ root, crumb, facing: null });
    expect(screen).toBe("quiz");
    expect(context.question).toEqual({
      item: "add.1",
      skill: "math.add",
      level: 2,
      kind: "choice",
      choices: [
        { id: "a", text: "חמש" },
        { id: "b", text: "שש" },
      ],
      figure: "bar",
      phase: "question",
    });
  });

  it("no question showing: the last one made is not reported", () => {
    const crumb = new Crumb();
    crumb.question(question);
    expect(collectContext({ root: page(`<main data-screen="play"></main>`), crumb, facing: null }).context.question).toBeUndefined();
  });

  it("a battle: the creature and the phase; a question in it still says the battle", () => {
    const crumb = new Crumb();
    crumb.battle("fox");
    const fight = page(`<main data-screen="play"><section data-screen="battle" data-view="turn" data-wild="fox"></section></main>`);
    expect(collectContext({ root: fight, crumb, facing: null }).context.battle).toEqual({ species: "fox", phase: "turn" });
    const ask = page(`<main data-screen="play"><div data-screen="battle-ask" data-seal="true"></div></main>`);
    expect(collectContext({ root: ask, crumb, facing: null }).context.battle).toEqual({ species: "fox", phase: "seal" });
  });

  it("the bag: its tab", () => {
    const root = page(`<main data-screen="play"><div data-screen="bag" data-tab="snacks"></div></main>`);
    expect(collectContext({ root, crumb: new Crumb(), facing: null }).context.bag).toEqual({ tab: "snacks" });
  });
});
