import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/App";
import { openServices } from "../../../src/app/services";
import { uninstallAppLog } from "../../../src/platform/appLog";
import { MemoryFileStore } from "../../../src/platform/storage";
import { preloadAll } from "../../../src/ui/lazy";

// the rarely used screens are separate chunks: fetched once, so each test finds them as soon as it asks
beforeAll(() => preloadAll());

// the map's Phaser scene does not run in jsdom: a stand-in
vi.mock("../../../src/game/mapGame", () => ({
  startMap: (opts: { onReady?: () => void }) => {
    setTimeout(() => opts.onReady?.(), 0);
    return { pause: () => {}, resume: () => {}, paused: false, destroy: () => {}, debug: () => null };
  },
}));

afterEach(() => {
  cleanup();
  uninstallAppLog();
});

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));
const BUTTON = '[data-id="report_open"]';

async function start() {
  const services = await openServices(new MemoryFileStore());
  await services.parent.setPin("1234");
  const child = await services.profiles.create({ name: "דן", avatar: "boy_blue" });
  const { container } = render(<App services={services} />);
  await settle();
  const el = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement | null;
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no button ${id} on ${screen()}`);
    fireEvent.click(b, { detail: 0 });
    await settle();
  };
  const screen = () => container.querySelector("[data-screen]")!.getAttribute("data-screen");
  const code = async () => {
    for (const d of "1234") await press(`key_${d}`);
    await vi.waitFor(() => expect(["pin", "loading"]).not.toContain(screen()), { timeout: 5000 });
  };
  const hasButton = () => container.querySelector(BUTTON) !== null;
  return { container, child, press, screen, hasButton, code };
}

describe("where the report button is", () => {
  it("is not on who-plays", async () => {
    const app = await start();
    expect(app.screen()).toBe("who-plays");
    expect(app.hasButton()).toBe(false);
  });

  it("is not on the parent code, nor in the parents' area, nor on its pages", async () => {
    const app = await start();
    await app.press("parents");
    expect(app.screen()).toBe("pin");
    expect(app.hasButton()).toBe(false);
    await app.code();
    expect(app.screen()).toBe("parents");
    expect(app.hasButton()).toBe(false);
    await app.press("parents_github");
    expect(app.screen()).toBe("parents-github");
    expect(app.hasButton()).toBe(false);
  });

  it("is not on the screens that add a child", async () => {
    const app = await start();
    await app.press("new_child");
    await app.code();
    expect(app.screen()).toBe("letters");
    expect(app.hasButton()).toBe(false);
  });

  it("is on the map where the child plays, with its dialogs and menu, and gone back on who-plays", async () => {
    const app = await start();
    await app.press(`child_${app.child.id}`);
    await settle(20);
    expect(app.screen()).toBe("play");
    expect(app.hasButton()).toBe(true);
    // the menu is a screen of the same play
    await app.press("map_menu");
    expect(app.container.querySelector("[data-screen=map-menu]")).not.toBeNull();
    expect(app.hasButton()).toBe(true);
    // one button only, mounted once
    expect(app.container.querySelectorAll(BUTTON)).toHaveLength(1);
    await app.press("map_exit");
    expect(app.screen()).toBe("who-plays");
    expect(app.hasButton()).toBe(false);
  });
});
