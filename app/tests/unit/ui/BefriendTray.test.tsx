import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Tool, type Treat, toolFor } from "../../../src/core/game/befriend";
import { economy } from "../../../src/core/game/items";
import type { TryResult } from "../../../src/core/game/befriendTry";
import { monsterTable } from "../../../src/core/game/monsters";
import { BefriendResult } from "../../../src/ui/battle/BefriendResult";
import { BefriendThrow, frameAt, type ThrowSound } from "../../../src/ui/battle/BefriendThrow";
import { BefriendTray, cycle, shortName, type TrayProps } from "../../../src/ui/battle/BefriendTray";
import { gameJson } from "../game/helpers";

afterEach(cleanup);
const eco = economy(gameJson("economy.json"));
const moon = { species: "lunibble", subject: "science", zone: "moon" };
const tool = (id: string, n = 2): Tool => toolFor(eco.items[id]!, moon, n);
const treat = (id: string, liked = false): Treat => ({ item: eco.items[id]!, mult: eco.items[id]!.treatMult, liked, count: 3 });

function tray(over: Partial<TrayProps> = {}) {
  cleanup();
  const calls: string[] = [];
  const props: TrayProps = {
    tools: [tool("magic_net", 3), tool("silver_net", 1)],
    treats: [treat("berry"), treat("pie", true)],
    tool: "magic_net",
    treat: null,
    word: "good",
    mercy: false,
    gift: null,
    canGift: true,
    likedKnown: true,
    turn: 0,
    onTool: (id) => calls.push(`tool:${id}`),
    onTreat: (id) => calls.push(`treat:${id}`),
    onGift: () => calls.push("gift"),
    onAuto: () => calls.push("auto"),
    onThrow: () => calls.push("throw"),
    onClose: () => calls.push("close"),
    ...over,
  };
  const host = render(<BefriendTray {...props} />).container;
  return { calls, el: (id: string) => host.querySelector<HTMLButtonElement>(`[data-id=${id}]`)!, host };
}
const tap = (b: HTMLButtonElement) => act(async () => b.click());

describe("the Befriend tray (BATTLE_V3 8.3)", () => {
  it("shows the chance as a word, never a number, and the tool, treat, gift, Throw, Auto and Back as buttons, in reading order", () => {
    const m = tray();
    expect(m.el("befriend_chance").getAttribute("data-word")).toBe("good");
    expect(m.el("befriend_chance").textContent).toContain("טוב");
    expect(m.el("befriend_chance").textContent).not.toMatch(/\d/);
    const ids = [...m.host.querySelectorAll("button")].map((b) => b.dataset["id"]);
    expect(ids).toEqual(["befriend_tool", "befriend_treat", "befriend_gift", "befriend_throw", "befriend_auto", "befriend_back"]);
  });

  it("a tap on a tile goes to the next thing the child owns (the treat has a 'none' place); Throw, Gift, Auto and Back call out", async () => {
    const m = tray();
    await tap(m.el("befriend_tool"));
    await tap(m.el("befriend_treat"));
    await tap(m.el("befriend_gift"));
    await tap(m.el("befriend_throw"));
    await tap(m.el("befriend_auto"));
    await tap(m.el("befriend_back"));
    expect(m.calls).toEqual(["tool:silver_net", "treat:berry", "gift", "throw", "auto", "close"]);
    expect(cycle(["a", "b", "c"], "c", false)).toBe("a");
    expect(cycle(["a", "b"], "b", true)).toBeNull();
    expect(cycle([], null, false)).toBeNull();
  });

  it("Throw rests with no tool; the Gift tile is spent after it was answered; a liked treat shows a heart only once known", () => {
    expect(tray({ tool: null, tools: [] }).el("befriend_throw").disabled).toBe(true);
    expect(tray({ tool: null, tools: [] }).el("befriend_tool").disabled).toBe(true);
    expect(tray({ gift: true }).el("befriend_gift").disabled).toBe(true);
    expect(tray({ gift: true }).el("befriend_gift").dataset["state"]).toBe("right");
    expect(tray({ canGift: false }).el("befriend_gift").disabled).toBe(true);
    expect(tray({ treat: "pie" }).host.querySelector(".tile-heart")).not.toBeNull();
    expect(tray({ treat: "pie", likedKnown: false }).host.querySelector(".tile-heart")).toBeNull();
  });

  it("a card of another subject is marked as not for this creature (dashed, said aloud)", () => {
    const m = tray({ tools: [tool("friend_card_math", 1)], tool: "friend_card_math" });
    expect(m.el("befriend_tool").dataset["off"]).toBe("true");
    expect(m.el("befriend_tool").getAttribute("aria-label")).toContain("לא מתאים");
    expect(m.el("befriend_throw").textContent).toContain("🃏");
  });

  it("long names are shortened for a tile", () => {
    expect(shortName("כרטיס ידידות גאומטריה")).toBe("כרטיס גאומטריה");
    expect(shortName("רשת קסמים")).toBe("רשת קסמים");
  });
});

const base = (over: Partial<TryResult> = {}): TryResult => ({
  kind: "failed",
  refusal: null,
  chance: null,
  shakes: 2,
  failedAt: 2,
  tool: "magic_net",
  treat: null,
  gift: false,
  netBack: false,
  nextWord: "fair",
  nextMercy: false,
  caught: null,
  toMeadow: false,
  full: false,
  coins: 0,
  growth: null,
  another: false,
  giftItem: null,
  ...over,
});

/** Mounts a throw inside a stand-in scene, collects the steps it shows. */
async function playThrow(r: TryResult, tapAt?: number[]) {
  cleanup();
  const steps: string[] = [];
  const sounds: string[] = [];
  const onDone = vi.fn();
  const sound = (s: ThrowSound, k?: number) => sounds.push(k ? `${s}${k}` : s);
  const { container } = render(
    <div className="battle-scene">
      <div className="battle-pic mine">
        <div className="monster-pic" />
      </div>
      <div className="battle-pic theirs">
        <div className="monster-pic" />
      </div>
      <BefriendThrow r={r} scale={0.02} sound={sound} onDone={onDone} />
    </div>,
  );
  const layer = container.querySelector<HTMLElement>("[data-id=befriend_throw]")!;
  const obs = new MutationObserver(() => steps.push(layer.dataset["step"]!));
  obs.observe(layer, { attributes: true, attributeFilter: ["data-step"] });
  for (let i = 0; i < 400 && !onDone.mock.calls.length; i++) {
    await act(async () => void (await new Promise((res) => setTimeout(res, 10))));
    if (tapAt?.includes(i)) await act(async () => container.querySelector<HTMLButtonElement>("[data-id=befriend_throw_skip]")!.click());
  }
  obs.disconnect();
  return { steps, sounds, onDone, container, wild: container.querySelector<HTMLElement>(".battle-pic.theirs")! };
}

describe("the throw (BATTLE_V3 8.7)", () => {
  it("a friend: fly, catch, three shakes, then the click; the creature stays hidden for the result card", async () => {
    const r = await playThrow(base({ kind: "caught", shakes: 3, failedAt: null }));
    expect(r.steps).toEqual(["catch", "shake1", "shake2", "shake3", "click", "done"]);
    expect(r.sounds).toEqual(["throw", "shake1", "shake2", "shake3", "win"]);
    expect(r.onDone).toHaveBeenCalledTimes(1);
    expect(r.wild.style.opacity).toBe("0");
  });

  it("a fail on shake 2: the net pops open early after two shakes, the creature is back and visible", async () => {
    const r = await playThrow(base());
    expect(r.steps).toEqual(["catch", "shake1", "shake2", "pop", "done"]);
    expect(r.sounds).toEqual(["throw", "shake1", "shake2", "pop"]);
    expect(r.wild.style.opacity).toBe("1");
    expect(r.onDone).toHaveBeenCalledTimes(1);
  });

  it("a fail on the first shake pops after one", async () => {
    const r = await playThrow(base({ shakes: 1, failedAt: 1 }));
    expect(r.steps).toEqual(["catch", "shake1", "pop", "done"]);
  });

  it("a tap speeds it up, a second skips to the end state and finishes at once", async () => {
    const r = await playThrow(base({ kind: "caught", shakes: 3, failedAt: null }), [0, 1]);
    expect(r.onDone).toHaveBeenCalledTimes(1);
    expect(r.wild.style.opacity).toBe("0");
    expect(r.container.querySelector<HTMLElement>(".throw-net")!.style.opacity).toBe("1");
  });

  it("the sheet's frames are the 4 x 2 grid", () => {
    expect(frameAt(0)).toBe("0% 0%");
    expect(frameAt(3)).toBe("100% 0%");
    expect(frameAt(4)).toBe("0% 100%");
    expect(frameAt(7)).toBe("100% 100%");
  });
});

describe("the result card (BATTLE_V3 8.6)", () => {
  const monsters = monsterTable(gameJson("db/monsters.json"));
  it("one big Next and a quiet Name it chip; another friend of a kind says so and the gift; no letter board in the way", async () => {
    const calls: string[] = [];
    const r = base({ kind: "caught", another: true, giftItem: "berry", coins: 5, toMeadow: true });
    render(<BefriendResult monsters={monsters} species="lunibble" name="לוניבל" r={r} canName onNext={() => calls.push("next")} onName={() => calls.push("name")} />);
    const el = (id: string) => document.querySelector<HTMLButtonElement>(`[data-id=${id}]`)!;
    const text = document.querySelector(".name-line")!.textContent!;
    expect(text).toContain("עוד חבר מאותו סוג");
    expect(text).toContain("5");
    expect(text).toContain("בגינה");
    expect(document.querySelector("[data-id=battle_new_friend]")!.textContent).toContain("לוניבל");
    await tap(el("battle_befriend_next"));
    await tap(el("battle_name_chip"));
    expect(calls).toEqual(["next", "name"]);
    cleanup();
    render(<BefriendResult monsters={monsters} species="lunibble" name="לוניבל" r={r} canName={false} onNext={() => {}} onName={() => {}} />);
    expect(document.querySelector("[data-id=battle_name_chip]")).toBeNull();
  });
});
