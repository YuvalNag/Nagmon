import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, backStep, type View } from "../../../src/App";
import { openServices } from "../../../src/app/services";
import type { PinCheck } from "../../../src/core/family/parent";
import { MAX_PROFILES, ProfileNameTakenError } from "../../../src/core/family/profiles";
import { t } from "../../../src/i18n";
import { appLogText, installAppLog, uninstallAppLog } from "../../../src/platform/appLog";
import { MemoryFileStore } from "../../../src/platform/storage";
import { currentMap } from "../../../src/game/current";

// the map's Phaser scene does not run in jsdom: a stand-in that records pauses
const mapCalls: string[] = [];
const mapFails = { next: false };
vi.mock("../../../src/game/mapGame", () => ({
  startMap: (opts: { onReady?: () => void; onError?: (e: unknown) => void }) => {
    mapCalls.push("start");
    const fail = mapFails.next;
    setTimeout(() => (fail ? opts.onError?.(new Error("no WebGL")) : opts.onReady?.()), 0);
    return {
      pause: (why: string) => mapCalls.push(`pause ${why}`),
      resume: (why: string) => mapCalls.push(`resume ${why}`),
      paused: false,
      destroy: () => mapCalls.push("destroy"),
      debug: () => null,
    };
  },
}));

afterEach(() => {
  cleanup();
  uninstallAppLog();
  vi.restoreAllMocks();
});

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

/** A promise the test resolves or rejects when it wants. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

async function start({ pin = "1234" as string | null, children = [] as string[], workTimeoutMs = undefined as number | undefined } = {}) {
  const services = await openServices(new MemoryFileStore());
  if (pin) await services.parent.setPin(pin);
  for (const name of children) await services.profiles.create({ name, avatar: "boy_blue" });
  let back: (() => void) | null = null;
  const backButton = (handler: () => void) => {
    back = handler;
    return () => (back = null);
  };
  const { container } = render(<App services={services} backButton={backButton} workTimeoutMs={workTimeoutMs} />);
  await settle();
  const el = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement | null;
  // a keyboard press: Tap's path without a pointer, so no wait for fresh screens
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no button ${id} on ${screen()}`);
    fireEvent.click(b, { detail: 0 });
    await settle();
  };
  // a finger: down and up on the button, right away (no wait for a fresh screen)
  let finger = 1;
  const tap = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no button ${id} on ${screen()}`);
    const at = { pointerId: ++finger, button: 0, pointerType: "touch", clientX: 0, clientY: 0 };
    fireEvent.pointerDown(b, at);
    fireEvent.pointerUp(b, at);
    await settle();
  };
  const screen = () => container.querySelector("[data-screen]")!.getAttribute("data-screen");
  const text = () => container.querySelector("[data-screen]")!.textContent ?? "";
  const androidBack = async () => {
    act(() => back!());
    await settle();
  };
  return { services, container, el, press, tap, screen, text, androidBack };
}

async function toAvatar(app: Awaited<ReturnType<typeof start>>, name = "דן") {
  await app.press("new_child");
  for (const d of "1234") await app.press(`key_${d}`);
  await settle(50);
  await vi.waitFor(() => expect(app.screen()).toBe("letters"), { timeout: 5000 });
  for (const c of name) await app.press(`letter_${c}`);
  await app.press("board_done");
  await app.press("choice_2");
  expect(app.screen()).toBe("avatar");
}

describe("the parent code", () => {
  it("says how many tries are left after a wrong code", async () => {
    const app = await start();
    await app.press("parents");
    for (const d of "0000") await app.press(`key_${d}`);
    await vi.waitFor(() => expect(app.container.querySelector(".message")!.textContent).toBe(t("pinWrong", { left: 4 })), { timeout: 5000 });
  });

  it("says it is locked right away when the pad opens during a lockout", async () => {
    const app = await start();
    vi.spyOn(app.services.parent, "lockoutRemaining").mockResolvedValue(42);
    await app.press("parents");
    await settle(10);
    expect(app.screen()).toBe("notice");
    expect(app.text()).toContain("42");
  });

  it("can be left while the code is checked, and the late answer is dropped", async () => {
    const app = await start();
    const check = later<PinCheck>();
    vi.spyOn(app.services.parent, "verifyPin").mockReturnValue(check.promise);
    await app.press("parents");
    for (const d of "1234") await app.press(`key_${d}`);
    expect(app.el("pin_cancel")!.disabled).toBe(false);
    await app.press("pin_cancel");
    expect(app.screen()).toBe("who-plays");
    check.resolve({ ok: true, locked: false, attemptsLeft: 5, retryAfterS: 0 });
    await settle(10);
    expect(app.screen()).toBe("who-plays");
    // and the screen works: the next try is not blocked by the old one
    await app.press("parents");
    expect(app.screen()).toBe("pin");
  });

  it("leaves by Android's back during the check, and stays out", async () => {
    const app = await start();
    const check = later<PinCheck>();
    vi.spyOn(app.services.parent, "verifyPin").mockReturnValue(check.promise);
    await app.press("parents");
    for (const d of "0000") await app.press(`key_${d}`);
    await app.androidBack();
    expect(app.screen()).toBe("who-plays");
    check.resolve({ ok: false, locked: false, attemptsLeft: 4, retryAfterS: 0 });
    await settle(10);
    expect(app.screen()).toBe("who-plays");
  });

  it("gives up on a check that never answers, with a fresh pad", async () => {
    const app = await start({ workTimeoutMs: 50 });
    vi.spyOn(app.services.parent, "verifyPin").mockReturnValue(new Promise(() => {}));
    await app.press("parents");
    for (const d of "1234") await app.press(`key_${d}`);
    await settle(120);
    expect(app.screen()).toBe("pin");
    expect(app.container.querySelector(".message")!.textContent).toBe(t("errorTryAgain"));
    expect(app.el("key_1")!.disabled).toBe(false);
  });

  it("counts every digit of a code typed in one rhythm, both times", async () => {
    const app = await start({ pin: null });
    await app.press("parents");
    // the pad has been up a moment; from here on, taps with no pause
    await settle(320);
    for (const d of "12341234") await app.tap(`key_${d}`);
    await settle(10);
    await vi.waitFor(() => expect(app.text()).toContain(t("pinSaved")), { timeout: 5000 });
  });

  it("counts a quick new try after a wrong code", async () => {
    const app = await start();
    await app.press("parents");
    await settle(320);
    for (const d of "0000") await app.tap(`key_${d}`);
    await vi.waitFor(() => expect(app.container.querySelector("[data-screen=pin]")!.getAttribute("data-attempt")).toBe("1"), { timeout: 5000 });
    for (const d of "1234") await app.tap(`key_${d}`);
    await vi.waitFor(() => expect(app.screen()).toBe("parents"), { timeout: 5000 });
  });

  it("gives a fresh pad and a Hebrew notice when the check fails", async () => {
    const app = await start();
    await installAppLog(new MemoryFileStore());
    vi.spyOn(app.services.parent, "verifyPin").mockRejectedValue(new Error("crypto broke"));
    await app.press("parents");
    for (const d of "1234") await app.press(`key_${d}`);
    await settle(10);
    expect(app.screen()).toBe("pin");
    expect(app.container.querySelector("[data-screen=pin]")!.getAttribute("data-waiting")).toBe("false");
    expect(app.container.querySelector(".message")!.textContent).toBe(t("errorTryAgain"));
    expect(appLogText()).toContain("crypto broke");
  });

  it("gives a fresh pad when saving a new code fails", async () => {
    const app = await start({ pin: null });
    vi.spyOn(app.services.parent, "setPin").mockRejectedValue(new Error("disk full"));
    await app.press("parents");
    for (const d of "12341234") await app.press(`key_${d}`);
    await settle(10);
    expect(app.screen()).toBe("pin");
    expect(app.container.querySelector(".message")!.textContent).toBe(t("errorTryAgain"));
    expect(app.el("key_1")!.disabled).toBe(false);
  });
});

describe("a new child", () => {
  it("is saved once when two heroes are tapped during the save", async () => {
    const app = await start();
    await toAvatar(app);
    const real = app.services.profiles.create.bind(app.services.profiles);
    const disk = later<void>();
    const create = vi.spyOn(app.services.profiles, "create").mockImplementation(async (p) => {
      await disk.promise;
      return real(p);
    });
    await app.press("choice_boy_blue");
    expect(app.el("choice_girl_teal")!.disabled).toBe(true);
    expect(app.el("back")!.disabled).toBe(true);
    await app.press("choice_girl_teal");
    disk.resolve();
    await settle(50);
    expect(create).toHaveBeenCalledTimes(1);
    expect(app.text()).toContain(t("childCreated", { name: "דן" }));
    expect(await app.services.profiles.list()).toHaveLength(1);
  });

  it("goes back to the name, with 'taken', when the name was taken meanwhile", async () => {
    const app = await start();
    await toAvatar(app);
    vi.spyOn(app.services.profiles, "create").mockRejectedValue(new ProfileNameTakenError("taken"));
    await app.press("choice_boy_blue");
    await settle(10);
    expect(app.screen()).toBe("letters");
    expect(app.container.querySelector(".message")!.textContent).toBe(t("nameTaken"));
  });

  it("shows a Hebrew notice when the disk fails, and lets them try again", async () => {
    const app = await start();
    await installAppLog(new MemoryFileStore());
    await toAvatar(app);
    vi.spyOn(app.services.profiles, "create").mockRejectedValueOnce(new Error("disk full"));
    await app.press("choice_boy_blue");
    await settle(10);
    expect(app.screen()).toBe("notice");
    expect(app.text()).toContain(t("errorTryAgain"));
    expect(appLogText()).toContain("disk full");
    await app.press("next");
    expect(app.screen()).toBe("avatar");
    await app.press("choice_boy_blue");
    await settle(10);
    expect(app.text()).toContain(t("childCreated", { name: "דן" }));
  });

  it(`is refused before the code is asked when there are ${MAX_PROFILES} children`, async () => {
    const app = await start({ children: ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח"] });
    expect(app.el("new_child")!.disabled).toBe(true);
    expect(app.text()).toContain(t("tooMany"));
    await app.press("new_child");
    expect(app.screen()).toBe("who-plays");
  });

  it("shows a notice, not a frozen screen, when the players cannot be read", async () => {
    const services = await openServices(new MemoryFileStore());
    vi.spyOn(services.profiles, "list").mockRejectedValue(new Error("unreadable"));
    const { container } = render(<App services={services} backButton={() => () => {}} />);
    await settle(10);
    expect(container.querySelector("[data-screen]")!.getAttribute("data-screen")).toBe("notice");
  });
});

describe("Android's back button", () => {
  const who: View = { kind: "who" };

  it("goes one step back in the flow", () => {
    expect(backStep({ kind: "pin-set", goal: "new_child" })).toEqual(who);
    expect(backStep({ kind: "pin-check", goal: "parents" })).toEqual(who);
    expect(backStep({ kind: "name" })).toEqual(who);
    expect(backStep({ kind: "grade", name: "דן" })).toEqual({ kind: "name", initial: "דן" });
    expect(backStep({ kind: "avatar", name: "דן", grade: 2 })).toEqual({ kind: "grade", name: "דן" });
    // a notice is never a way forward ("code saved" leads on to the name)
    expect(backStep({ kind: "notice", text: "x", next: { kind: "name" } })).toEqual(who);
    const avatar: View = { kind: "avatar", name: "דן", grade: 2 };
    expect(backStep({ kind: "notice", text: "x", next: avatar, back: avatar })).toEqual(avatar);
    expect(backStep({ kind: "parents" })).toEqual(who);
    // on the map back is not a screen change: the map opens its pause menu
    expect(backStep({ kind: "play", id: "p1" })).toBeNull();
  });

  it("does nothing on who-plays: the app never closes by itself", () => {
    expect(backStep(who)).toBeNull();
  });

  it("is wired to the screens", async () => {
    const app = await start();
    await app.androidBack();
    expect(app.screen()).toBe("who-plays");
    await toAvatar(app);
    await app.androidBack();
    expect(app.screen()).toBe("grade");
    await app.androidBack();
    expect(app.screen()).toBe("letters");
    expect(app.el("typed")!.textContent).toBe("דן");
    await app.androidBack();
    expect(app.screen()).toBe("who-plays");
  });

  it("does nothing while a child is being saved", async () => {
    const app = await start();
    await toAvatar(app);
    const save = later<never>();
    vi.spyOn(app.services.profiles, "create").mockReturnValue(save.promise);
    await app.press("choice_boy_blue");
    await app.androidBack();
    expect(app.screen()).toBe("avatar");
  });

  it("opens the map's pause menu on the map, closes it on a second press, and never leaves the app", async () => {
    mapCalls.length = 0;
    const app = await start({ children: ["דן"] });
    const [child] = await app.services.profiles.list();
    await app.press(`child_${child.id}`);
    await settle(20);
    expect(app.screen()).toBe("play");
    expect(mapCalls).toEqual(["start"]);
    // the lifecycle module finds the open map here
    expect(currentMap()).not.toBeNull();
    await app.androidBack();
    expect(app.container.querySelector("[data-screen=map-menu]")).not.toBeNull();
    expect(mapCalls).toEqual(["start", "pause menu"]);
    await app.androidBack();
    expect(app.container.querySelector("[data-screen=map-menu]")).toBeNull();
    expect(app.screen()).toBe("play");
    expect(mapCalls).toEqual(["start", "pause menu", "resume menu"]);
    // the menu's "back to who plays" closes the map
    await app.androidBack();
    await app.press("map_exit");
    expect(app.screen()).toBe("who-plays");
    expect(mapCalls).toContain("destroy");
    expect(currentMap()).toBeNull();
  });

  it("goes back to who-plays from 'the map did not open'", async () => {
    mapCalls.length = 0;
    mapFails.next = true;
    try {
      const app = await start({ children: ["דן"] });
      const [child] = await app.services.profiles.list();
      await app.press(`child_${child.id}`);
      await settle(20);
      expect(app.container.querySelector("[data-screen=map-failed]")).not.toBeNull();
      await app.androidBack();
      expect(app.screen()).toBe("who-plays");
      expect(mapCalls).toContain("destroy");
    } finally {
      mapFails.next = false;
    }
  });
});
