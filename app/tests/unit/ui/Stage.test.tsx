import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { monsterTable } from "../../../src/core/game/monsters";
import { Stage } from "../../../src/ui/battle/Stage";
import { ResultsCard } from "../../../src/ui/battle/ResultsCard";
import { planFor } from "../../../src/ui/battle/effects";
import { gameJson } from "../game/helpers";

afterEach(cleanup);
const monsters = monsterTable(gameJson("db/monsters.json"));

function show(over: Partial<Parameters<typeof Stage>[0]> = {}) {
  cleanup();
  return render(
    <Stage
      monsters={monsters}
      mine={{ id: "c1", species: "heliobud", level: 6, xp: 2 }}
      myName="ניצן"
      avatar="girl_teal"
      wildSpecies="mercurip"
      wildName="כספית"
      wildLevel={6}
      hp={30}
      maxHp={60}
      pep={{ now: 20, max: 40 }}
      asleep={false}
      need={6}
      subject="science"
      fx={null}
      calm={false}
      victory={false}
      pad={false}
      intent={{ id: "fog_puff", amount: 7, first: true }}
      detail={2}
      loves={[{ id: "geometry", title: "גאומטריה" }]}
      enemyFx={null}
      {...over}
    />,
  ).container;
}
const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLElement>(sel);

describe("the arena's two bars", () => {
  it("Pep of the partner and Fog of the enemy, each a progress bar with its numbers for a screen reader", () => {
    const c = show();
    const pep = q(c, "[data-id=partner_pep]")!;
    expect([pep.getAttribute("aria-valuenow"), pep.getAttribute("aria-valuemax")]).toEqual(["20", "40"]);
    expect(pep.getAttribute("aria-label")).toBe("מרץ של ניצן: 20 מתוך 40");
    expect((pep.firstElementChild as HTMLElement).style.width).toBe("50%");
    const fog = q(c, "[data-id=wild_hp]")!;
    expect(fog.getAttribute("aria-label")).toBe("ערפל של כספית: 30 מתוך 60");
  });

  it("a sleeping partner lies under a blanket and its Pep bar is grey", () => {
    const c = show({ asleep: true, pep: { now: 0, max: 40 } });
    expect(q(c, ".battle-pic.mine")!.getAttribute("data-asleep")).toBe("true");
    expect(q(c, ".blanket")).not.toBeNull();
    expect(q(c, "[data-id=partner_pep]")!.getAttribute("data-asleep")).toBe("true");
    expect(q(show(), ".blanket")).toBeNull();
  });
});

describe("the enemy's intent over it, by age", () => {
  it("ages 5-7: the picture only; 8-10: and the number; 11 and up: and who is faster", () => {
    const a = q(show({ detail: 1 }), "[data-id=battle_intent]")!;
    expect(a.querySelector(".intent-n")).toBeNull();
    expect(a.getAttribute("aria-label")).toBe("נשיפת ערפל");
    const b = q(show({ detail: 2 }), "[data-id=battle_intent]")!;
    expect(b.querySelector(".intent-n")!.textContent).toBe("~7");
    expect(b.getAttribute("aria-label")).toContain("בערך 7");
    const c = q(show({ detail: 3 }), "[data-id=battle_intent]")!;
    expect(c.querySelector(".intent-first")!.textContent).toBe("⚡1");
    expect(c.getAttribute("aria-label")).toContain("פועל ראשון");
    expect(q(show({ detail: 3, intent: { id: "fog_puff", amount: 7, first: false } }), ".intent-first")!.textContent).toBe("⚡2");
  });

  it("a Silly turn shows no number; no intent shows no bubble", () => {
    expect(q(show({ intent: { id: "silly_dance", amount: 0, first: false } }), ".intent-n")).toBeNull();
    expect(q(show({ intent: { id: "giggle", amount: 0, first: false } }), "[data-id=battle_intent]")!.getAttribute("data-intent")).toBe("giggle");
    expect(q(show({ intent: null }), "[data-id=battle_intent]")).toBeNull();
  });
});

describe("what the enemy loves", () => {
  it("shows the subject's picture; an unknown one is a question mark", () => {
    const known = q(show(), "[data-id=battle_loves]")!;
    expect(known.getAttribute("data-known")).toBe("true");
    expect(known.querySelectorAll(".subject-dot")).toHaveLength(1);
    expect(known.getAttribute("aria-label")).toContain("גאומטריה");
    const unknown = q(show({ loves: null }), "[data-id=battle_loves]")!;
    expect(unknown.getAttribute("data-known")).toBe("false");
    expect(unknown.textContent).toContain("?");
  });
});

describe("the hit numbers", () => {
  const fx = (over: object) => ({ id: 1, correct: true, damage: 12, won: false, plan: planFor(true, false), ...over });

  it("a Sparkle hit is marked for the gold ring, a Sturdy one for grey, a Brilliant one has a star", () => {
    expect(q(show({ fx: fx({ wheel: "sparkle" }) }), ".fx-number")!.getAttribute("data-wheel")).toBe("sparkle");
    expect(q(show({ fx: fx({ wheel: "sturdy" }) }), ".fx-number")!.getAttribute("data-wheel")).toBe("sturdy");
    const b = q(show({ fx: fx({ brilliant: true }) }), ".fx-number")!;
    expect(b.querySelector(".fx-brilliant")).not.toBeNull();
    expect(b.textContent).toContain("-12");
  });

  it("a wrong answer still shows its small number, without a hit; no number for a zero", () => {
    const plan = planFor(false, false, 4);
    expect(plan.number).toBe(true);
    expect(plan.wildHit).toBe(false);
    expect(plan.oops).toBe(true);
    expect(planFor(false, false).number).toBe(false);
    expect(q(show({ fx: fx({ correct: false, damage: 4, plan }) }), ".fx-number")!.textContent).toBe("-4");
  });

  it("the enemy's Puff shows a cloud and the number on the partner; a Giggle shows what it gave back; a Silly Dance shows notes", () => {
    const puff = show({ enemyFx: { id: 1, kind: "puff", amount: 5 } });
    expect(q(puff, ".fx-cloud")).not.toBeNull();
    expect(q(puff, ".fx-number.mine")!.textContent).toBe("-5");
    expect(q(show({ enemyFx: { id: 2, kind: "giggle", amount: 3 } }), ".fx-number.giggle")!.textContent).toBe("+3");
    expect(q(show({ enemyFx: { id: 3, kind: "silly", amount: 0 } }), ".fx-notes")).not.toBeNull();
    expect(q(show(), ".fx-layer.enemy")).toBeNull();
  });
});

describe("the results card", () => {
  const reward = (over = {}) => ({ coins: 17, points: 3, brilliant: 0, capped: false, found: null as string | null, stars: { calm: true as const, steady: true, bright: false }, ...over });

  it("three stars (Calm always, Steady when nobody slept, Bright for two Brilliant hits), the coins and the points", () => {
    const c = render(<ResultsCard reward={reward()} asleep={[]} line="נרגע" />).container;
    expect([...c.querySelectorAll("[data-star]")].map((s) => [s.getAttribute("data-star"), s.getAttribute("data-on")])).toEqual([["calm", "true"], ["steady", "true"], ["bright", "false"]]);
    expect(c.textContent).toContain("קיבלת 17 מטבעות");
    expect(c.textContent).toContain("3 נקודות גדילה");
    expect(c.querySelector("[data-id=battle_asleep]")).toBeNull();
  });

  it("a card the creature left shows on the card, with a gift mark and its name; none when it left nothing", () => {
    cleanup();
    const c = render(<ResultsCard reward={reward({ found: "zone_card_sun" })} asleep={[]} line="נרגע" found="ניצן השאיר לך מתנה: כרטיס התפתחות השמש!" />).container;
    expect(c.querySelector("[data-id=battle_found]")!.textContent).toContain("כרטיס התפתחות השמש");
    cleanup();
    expect(render(<ResultsCard reward={reward()} asleep={[]} line="נרגע" />).container.querySelector("[data-id=battle_found]")).toBeNull();
  });

  it("a missing star takes nothing away, and friends who need rest are named gently", () => {
    cleanup();
    const c = render(<ResultsCard reward={reward({ stars: { calm: true, steady: false, bright: false } })} asleep={["ניצן"]} line="נרגע" />).container;
    expect(c.querySelector("[data-star=steady]")!.getAttribute("data-on")).toBe("false");
    expect(c.querySelector("[data-id=battle_asleep]")!.textContent).toContain("ניצן");
    expect(c.querySelector("[data-id=battle_asleep]")!.textContent).toContain("מנוחה");
  });
});
