/**
 * The text review inside the parents' area (docs/app/TEXT_REVIEW.md §3): behind the parent code,
 * a door on the first page, Android's back one page back, the waiting decisions counted at home.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/App";
import { openServices } from "../../../src/app/services";
import { forgetChecks } from "../../../src/core/fieldData/github";
import { MemoryFileStore } from "../../../src/platform/storage";
import { preloadAll } from "../../../src/ui/lazy";

afterEach(() => {
  cleanup();
  forgetChecks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

const FILE = {
  version: 1,
  items: [
    { id: "npc:a:greet_first/0", type: "npc", src: "s", key: "k", he: "שלום שלום!", ctx: "אופיר האופה", hash: "h0" },
    { id: "npc:a:greet_first/1", type: "npc", src: "s", key: "k", he: "להתראות!", ctx: "אופיר האופה", hash: "h1" },
  ],
};

async function start() {
  await preloadAll();
  vi.stubGlobal("fetch", async (url: string) => (String(url).endsWith("game/review.json") ? new Response(JSON.stringify(FILE)) : new Response("", { status: 404 })));
  const services = await openServices(new MemoryFileStore());
  await services.parent.setPin("1234");
  await services.profiles.create({ name: "דנה", avatar: "girl_teal", grade: 2 });
  let back: (() => void) | null = null;
  const { container } = render(<App services={services} backButton={(h) => ((back = h), () => (back = null))} />);
  await settle();
  const el = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement | null;
  const screen = () => container.querySelector("[data-screen]")!.getAttribute("data-screen");
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no button ${id} on ${screen()}`);
    fireEvent.click(b, { detail: 0 });
    await settle();
  };
  const waitScreen = (name: string) => vi.waitFor(() => expect(screen()).toBe(name), { timeout: 5000 });
  return { services, container, el, press, screen, waitScreen, androidBack: async () => (act(() => back!()), settle()) };
}

describe("the text review in the parents' area", () => {
  it("is not on who-plays, and the parents' area asks for the code first", async () => {
    const app = await start();
    expect(app.el("parents_review")).toBeNull();
    await app.press("parents");
    expect(app.screen()).toBe("pin");
    expect(app.el("parents_review")).toBeNull();
    for (const d of "1234") await app.press(`key_${d}`);
    await app.waitScreen("parents");
    expect(app.el("parents_review")!.textContent).toBe("בדיקת ניסוח");
  });

  it("opens from the first page, decides, goes back with Android's back, and the home counts the queue", async () => {
    const app = await start();
    await app.press("parents");
    for (const d of "1234") await app.press(`key_${d}`);
    await app.waitScreen("parents");
    expect(app.el("review_waiting")).toBeNull();
    await app.press("parents_review");
    await app.waitScreen("parents-review");
    await vi.waitFor(() => expect(app.el("review_line")?.textContent).toBe("שלום שלום!"));
    await app.press("review_approve");
    await vi.waitFor(() => expect(app.el("review_line")?.textContent).toBe("להתראות!"));
    await app.androidBack();
    await app.waitScreen("parents");
    await vi.waitFor(() => expect(app.el("review_waiting")?.textContent).toBe("1 תיקוני ניסוח מחכים לשליחה"));
    // the decision is on the phone
    expect((await app.services.review.unsent()).map((d) => d.id)).toEqual(["npc:a:greet_first/0"]);
  });
});
