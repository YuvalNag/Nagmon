import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionBar, type ActionBarProps } from "../../../src/ui/battle/ActionBar";

afterEach(cleanup);

let host: HTMLElement;

function show(over: Partial<ActionBarProps> = {}) {
  cleanup();
  const calls: string[] = [];
  const props: ActionBarProps = {
    asked: false,
    calm: false,
    canNet: false,
    onAsk: () => calls.push("ask"),
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

describe("the battle's action bar", () => {
  it("has the five buttons in the order Ask, Net, Bag, Friends, Leave, and Ask is the wide one", () => {
    show();
    const ids = [...host.querySelectorAll("button")].map((b) => b.dataset["id"]);
    expect(ids).toEqual(["battle_fight", "battle_net", "battle_bag", "battle_friends", "battle_run"]);
    expect(host.querySelector("[data-id=battle_fight]")!.className).toContain("wide");
    expect(host.querySelector(".action-bar")!.getAttribute("role")).toBe("toolbar");
  });

  it("Ask is for the first question; after it the same slot says 'next question'", () => {
    const first = show();
    expect(first.el("battle_fight").textContent).toContain("לשאול");
    const next = show({ asked: true });
    expect(next.el("battle_fight")).toBeNull();
    expect(next.el("battle_next").textContent).toContain("השאלה הבאה");
    expect(next.el("battle_next").className).toContain("wide");
  });

  it("the Net waits until the creature is calm, then pulses; Ask rests", async () => {
    const waiting = show();
    expect(waiting.el("battle_net").disabled).toBe(true);
    await tap(waiting.el("battle_net"));
    expect(waiting.calls).toEqual([]);
    const calm = show({ calm: true, canNet: true });
    expect(calm.el("battle_net").disabled).toBe(false);
    expect(calm.el("battle_net").className).toContain("pulse");
    expect(calm.el("battle_fight").disabled).toBe(true);
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
    const onAsk = vi.fn();
    const m = show({ onAsk });
    await tap(m.el("battle_fight"));
    expect(onAsk).toHaveBeenCalledTimes(1);
  });
});
