import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "../../../src/core/game/battle";
import { DEFAULT_MOVES, equipped, WIGGLE } from "../../../src/core/game/moves";
import { monsterTable } from "../../../src/core/game/monsters";
import { moveText } from "../../../src/i18n";
import { ActionBar, type ActionBarProps, type Friend } from "../../../src/ui/battle/ActionBar";
import { gameJson } from "../game/helpers";

afterEach(cleanup);

let host: HTMLElement;
const monsters = monsterTable(gameJson("db/monsters.json"));
const titles: Record<string, string> = { math: "חשבון", geometry: "גאומטריה", science: "מדעים", english: "אנגלית", hebrew: "עברית", logic: "חשיבה" };

const card = (id: string, over: Partial<Card> = {}): Card => {
  const move = DEFAULT_MOVES[id]!;
  return { move, left: move.charges, max: move.charges, dimmed: false, hit: null, home: true, ...over };
};
const cards = (): Card[] => equipped("math", 6).map((m) => card(m.id));
const friends = (): Friend[] => [
  { id: "c1", species: "heliobud", name: "ניצן", active: true, fainted: false, pep: 1 },
  { id: "c2", species: "lunibble", name: "ירח", active: false, fainted: false, pep: 0.5 },
  { id: "c3", species: "terrabub", name: "אדמה", active: false, fainted: true, pep: 0 },
];

function show(over: Partial<ActionBarProps> = {}) {
  cleanup();
  const calls: string[] = [];
  const props: ActionBarProps = {
    monsters,
    cards: cards(),
    moveName: moveText,
    subjectTitle: (s) => titles[s] ?? s,
    friends: friends(),
    calm: false,
    canNet: false,
    live: true,
    idle: true,
    queued: null,
    pick: false,
    turn: 0,
    onMove: (id) => calls.push(`move:${id}`),
    onFriend: (id) => calls.push(`friend:${id}`),
    onNet: () => calls.push("net"),
    onBag: () => calls.push("bag"),
    onLeave: () => calls.push("leave"),
    ...over,
  };
  host = render(<ActionBar {...props} />).container;
  return { calls, el: (id: string) => host.querySelector<HTMLButtonElement>(`[data-id=${id}]`)! };
}

async function tap(b: HTMLButtonElement) {
  await act(async () => b.click());
}

describe("the battle's menu (BATTLE_V3 2.2)", () => {
  it("has the friends strip, the four move cards in a 2 x 2 grid, and Net, Bag and Run", () => {
    show();
    const ids = [...host.querySelectorAll("button")].map((b) => b.dataset["id"]);
    expect(ids).toEqual(["battle_friend_c1", "battle_friend_c2", "battle_friend_c3", "battle_move_number_nudge", "battle_move_sum_spark", "battle_move_block_bounce", "battle_move_letter_toss", "battle_net", "battle_bag", "battle_run"]);
    expect(host.querySelectorAll(".move-grid .move-card")).toHaveLength(4);
    expect(host.querySelector(".action-bar")!.getAttribute("role")).toBe("toolbar");
  });

  it("each card casts its own move, once; a friend's portrait swaps; Net, Bag and Run do their own", async () => {
    const m = show({ canNet: true });
    await tap(m.el("battle_move_sum_spark"));
    await tap(m.el("battle_move_letter_toss"));
    await tap(m.el("battle_friend_c2"));
    await tap(m.el("battle_net"));
    await tap(m.el("battle_bag"));
    await tap(m.el("battle_run"));
    expect(m.calls).toEqual(["move:sum_spark", "move:letter_toss", "friend:c2", "net", "bag", "leave"]);
  });

  it("a card shows the move's name, its subject, its flames, a tier badge and the charges as dots, and says all of it to a screen reader", () => {
    const m = show();
    const c = m.el("battle_move_sum_spark");
    expect(c.textContent).toContain(moveText("sum_spark"));
    expect(c.querySelector(".flames")!.textContent).toBe("🔥🔥");
    expect(c.querySelectorAll(".dots i")).toHaveLength(5);
    expect(c.querySelectorAll(".dots i[data-on=true]")).toHaveLength(5);
    expect(c.getAttribute("aria-label")).toBe("ניצוץ סכום, חשבון, נשארו 10 מתוך 10");
    expect(m.el("battle_move_number_nudge").querySelector(".flames")!.textContent).toBe("🔥");
    expect(c.getAttribute("data-tier")).toBe("N");
  });

  it("charges show in proportion: half the charges is about half the dots", () => {
    const m = show({ cards: [card("sum_spark", { left: 3, max: 10 }), card("number_nudge")] });
    expect(m.el("battle_move_sum_spark").querySelectorAll(".dots i[data-on=true]")).toHaveLength(2);
  });

  it("a Sparkle shows on the card and in its label; Sturdy shows a shield", () => {
    const m = show({ cards: [card("sum_spark", { hit: "sparkle" }), card("block_bounce", { hit: "sturdy" }), card("number_nudge")] });
    expect(m.el("battle_move_sum_spark").classList.contains("sparkle")).toBe(true);
    expect(m.el("battle_move_sum_spark").textContent).toContain("✨");
    expect(m.el("battle_move_sum_spark").getAttribute("aria-label")).toContain("מנצנץ");
    expect(m.el("battle_move_block_bounce").textContent).toContain("🛡️");
    expect(m.el("battle_move_number_nudge").getAttribute("data-hit")).toBe("none");
  });

  it("a card with no charges left is dimmed and cannot be tapped", async () => {
    const m = show({ cards: [card("sum_spark", { left: 0, dimmed: true }), card("number_nudge")] });
    expect(m.el("battle_move_sum_spark").disabled).toBe(true);
    expect(m.el("battle_move_sum_spark").classList.contains("dimmed")).toBe(true);
    await tap(m.el("battle_move_sum_spark"));
    expect(m.calls).toEqual([]);
  });

  it("the Little Wiggle is the one card when the four are out: wide, with no question and no dots", () => {
    const m = show({ cards: [card(WIGGLE, { left: null, max: null, home: false })] });
    expect(host.querySelector(".move-grid")!.getAttribute("data-count")).toBe("1");
    expect(m.el(`battle_move_${WIGGLE}`).textContent).toContain("בלי שאלה");
    expect(m.el(`battle_move_${WIGGLE}`).textContent).toContain("∞");
  });

  it("the partner is marked, a sleeping friend is dimmed with a Zz and cannot be tapped", async () => {
    const m = show();
    expect(m.el("battle_friend_c1").getAttribute("aria-pressed")).toBe("true");
    expect(m.el("battle_friend_c1").disabled).toBe(true);
    expect(m.el("battle_friend_c3").disabled).toBe(true);
    expect(m.el("battle_friend_c3").getAttribute("data-asleep")).toBe("true");
    expect(m.el("battle_friend_c3").textContent).toContain("💤");
    expect(m.el("battle_friend_c3").getAttribute("aria-label")).toContain("נרדם");
    await tap(m.el("battle_friend_c3"));
    expect(m.calls).toEqual([]);
  });

  it("while our own animation plays the cards and the Bag rest; Run is always free", async () => {
    const m = show({ live: false, idle: false });
    expect(m.el("battle_move_sum_spark").disabled).toBe(true);
    expect(m.el("battle_bag").disabled).toBe(true);
    expect(m.el("battle_friend_c2").disabled).toBe(true);
    expect(m.el("battle_run").disabled).toBe(false);
    await tap(m.el("battle_run"));
    expect(m.calls).toEqual(["leave"]);
  });

  it("late in a round the cards take taps (they wait for the end) and the queued one is marked", () => {
    const m = show({ live: true, idle: false, queued: "sum_spark" });
    expect(m.el("battle_move_sum_spark").disabled).toBe(false);
    expect(m.el("battle_move_sum_spark").classList.contains("queued")).toBe(true);
    expect(m.el("battle_friend_c2").disabled).toBe(true);
  });

  it("when the partner fell asleep the cards wait and the friends who are awake pulse (a free swap)", async () => {
    const f = friends();
    f[0] = { ...f[0]!, fainted: true, pep: 0 };
    const m = show({ pick: true, friends: f });
    expect(m.el("battle_move_sum_spark").disabled).toBe(true);
    expect(m.el("battle_friend_c2").disabled).toBe(false);
    expect(m.el("battle_friend_c2").classList.contains("pulse")).toBe(true);
    await tap(m.el("battle_friend_c2"));
    expect(m.calls).toEqual(["friend:c2"]);
  });

  it("calm: only the Net is the next step; the cards rest", () => {
    const m = show({ calm: true, canNet: true });
    expect(m.el("battle_net").disabled).toBe(false);
    expect(m.el("battle_net").classList.contains("pulse")).toBe(true);
    expect(m.el("battle_move_sum_spark").disabled).toBe(true);
  });

  it("with no net to throw, Net rests", () => {
    expect(show({ canNet: false }).el("battle_net").disabled).toBe(true);
  });

  it("every button has a label a screen reader can read (text or aria-label)", () => {
    show();
    for (const b of host.querySelectorAll("button")) expect((b.getAttribute("aria-label") ?? b.textContent ?? "").trim().length).toBeGreaterThan(0);
  });
});
