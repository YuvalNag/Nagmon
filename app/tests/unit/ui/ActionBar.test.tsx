import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSISTS_PER_BATTLE, type Legal, legalBeats } from "../../../src/core/game/battleBeats";
import { ActionBar, type ActionBarProps } from "../../../src/ui/battle/ActionBar";

afterEach(cleanup);

let host: HTMLElement;

const open = (over: Partial<Parameters<typeof legalBeats>[0]> = {}): Legal =>
  legalBeats({ fighting: true, lastWasQuestion: false, meterFull: false, assistsLeft: ASSISTS_PER_BATTLE, ...over });

function show(over: Partial<ActionBarProps> = {}) {
  cleanup();
  const calls: string[] = [];
  const props: ActionBarProps = {
    asked: false,
    calm: false,
    canNet: false,
    legal: open(),
    assistsLeft: ASSISTS_PER_BATTLE,
    onBeat: (b) => calls.push(b),
    onNet: () => calls.push("net"),
    onBag: () => calls.push("bag"),
    onFriends: () => calls.push("friends"),
    onLeave: () => calls.push("leave"),
    ...over,
  };
  host = render(<ActionBar {...props} />).container;
  return { calls, el: (id: string) => host.querySelector<HTMLButtonElement>(`[data-id=${id}]`)! };
}

async function tap(b: HTMLButtonElement) {
  await act(async () => b.click());
}

describe("the battle's beat menu", () => {
  it("has three big cards (Move, Power-up, friend) and four small buttons (Net, Bag, Friends, Leave)", () => {
    show();
    const ids = [...host.querySelectorAll("button")].map((b) => b.dataset["id"]);
    expect(ids).toEqual(["battle_move", "battle_fight", "battle_friend", "battle_net", "battle_bag", "battle_friends", "battle_run"]);
    expect([...host.querySelectorAll("button.card")]).toHaveLength(3);
    expect([...host.querySelectorAll("button.small")]).toHaveLength(4);
    expect(host.querySelector(".action-bar")!.getAttribute("role")).toBe("toolbar");
  });

  it("each card picks its own beat, once", async () => {
    const m = show();
    await tap(m.el("battle_move"));
    await tap(m.el("battle_fight"));
    await tap(m.el("battle_friend"));
    expect(m.calls).toEqual(["move", "power", "assist"]);
  });

  it("after the first question the Power-up's id reads 'next'", () => {
    const next = show({ asked: true });
    expect(next.el("battle_fight")).toBeNull();
    expect(next.el("battle_next").textContent).toContain("כוח");
  });

  it("just after a question the Power-up rests and says what to do; Move and the friend stay open", async () => {
    const m = show({ legal: open({ lastWasQuestion: true }) });
    expect(m.el("battle_fight").disabled).toBe(true);
    expect(m.el("battle_fight").textContent).toContain("קודם תנועה");
    expect(m.el("battle_move").disabled).toBe(false);
    expect(m.el("battle_friend").disabled).toBe(false);
    await tap(m.el("battle_fight"));
    expect(m.calls).toEqual([]);
  });

  it("the friend's card shows how many assists are left, and rests when none", () => {
    const some = show({ assistsLeft: 1 });
    expect(some.el("battle_friend").textContent).toContain("1");
    const none = show({ assistsLeft: 0, legal: open({ assistsLeft: 0 }) });
    expect(none.el("battle_friend").disabled).toBe(true);
  });

  it("a full meter puts Special in Move's place", async () => {
    const m = show({ legal: open({ meterFull: true }) });
    expect(m.el("battle_move")).toBeNull();
    expect(m.el("battle_special").className).toContain("pulse");
    await tap(m.el("battle_special"));
    expect(m.calls).toEqual(["special"]);
  });

  it("the Power-up pulses when the fog is at its floor (a nudge, never a force)", () => {
    expect(show({ nudge: true }).el("battle_fight").className).toContain("pulse");
    expect(show().el("battle_fight").className).not.toContain("pulse");
  });

  it("the Net waits until the creature is calm, then pulses; the three cards rest", async () => {
    const waiting = show();
    expect(waiting.el("battle_net").disabled).toBe(true);
    await tap(waiting.el("battle_net"));
    expect(waiting.calls).toEqual([]);
    const calm = show({ calm: true, canNet: true, legal: open({ fighting: false }) });
    expect(calm.el("battle_net").disabled).toBe(false);
    expect(calm.el("battle_net").className).toContain("pulse");
    for (const id of ["battle_move", "battle_fight", "battle_friend"]) expect(calm.el(id).disabled).toBe(true);
    await tap(calm.el("battle_net"));
    expect(calm.calls).toEqual(["net"]);
  });

  it("Leave is always there, and free, even when the creature is calm", async () => {
    const m = show({ calm: true, canNet: true });
    expect(m.el("battle_run").disabled).toBe(false);
    await tap(m.el("battle_run"));
    expect(m.calls).toEqual(["leave"]);
  });

  it("Bag and Friends are shortcuts that always open", async () => {
    const m = show();
    await tap(m.el("battle_bag"));
    await tap(m.el("battle_friends"));
    expect(m.calls).toEqual(["bag", "friends"]);
  });

  it("each tap is one call", async () => {
    const onBeat = vi.fn();
    const m = show({ onBeat });
    await tap(m.el("battle_fight"));
    expect(onBeat).toHaveBeenCalledTimes(1);
  });
});
