/**
 * The parents' area in the app (docs/app/SDD.md §4, §7): a child's name,
 * grade and hero saved; a delete only after its own page asks; the code
 * changed with the old one first; the token through its check into the
 * secret store; and Android's back one page back on every page.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/App";
import type { MapLifecycle } from "../../../src/game/mapGame";
import { openServices } from "../../../src/app/services";
import { forgetChecks } from "../../../src/core/fieldData/github";
import { crumb } from "../../../src/core/game/breadcrumb";
import { t } from "../../../src/i18n";
import { appLogText, installAppLog, uninstallAppLog } from "../../../src/platform/appLog";
import { SECRET_KEYS } from "../../../src/platform/secrets";
import { MemoryFileStore } from "../../../src/platform/storage";
import { parentsBackStep, type ParentsPage } from "../../../src/ui/screens/parents/pages";

const TOKEN = "github_pat_TEST" + "9".repeat(32);

afterEach(() => {
  cleanup();
  forgetChecks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

async function start(children = ["דנה", "גל"], lifecycle?: MapLifecycle) {
  const services = await openServices(new MemoryFileStore());
  await services.parent.setPin("1234");
  for (const name of children) await services.profiles.create({ name, avatar: "girl_teal", grade: 2 });
  let back: (() => void) | null = null;
  const { container } = render(<App services={services} lifecycle={lifecycle} backButton={(h) => ((back = h), () => (back = null))} />);
  await settle();
  const el = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement | null;
  const screen = () => container.querySelector("[data-screen]")!.getAttribute("data-screen");
  const text = () => container.querySelector("[data-screen]")!.textContent ?? "";
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no button ${id} on ${screen()}`);
    fireEvent.click(b, { detail: 0 });
    await settle();
  };
  const androidBack = async () => {
    act(() => back!());
    await settle();
  };
  const waitScreen = (name: string) => vi.waitFor(() => expect(screen()).toBe(name), { timeout: 5000 });
  const code = async (digits: string) => {
    for (const d of digits) await press(`key_${d}`);
    await settle(20);
  };
  // into the area, through the code
  await press("parents");
  await code("1234");
  await waitScreen("parents");
  const ids = (await services.profiles.list()).map((p) => p.id);
  return { services, container, el, press, screen, text, androidBack, waitScreen, code, ids };
}

describe("something is wrong", () => {
  it("writes where the child was into the log, and says so", async () => {
    uninstallAppLog();
    await installAppLog(new MemoryFileStore());
    crumb.screen("quiz");
    crumb.position("classic_route_1", 4, 9);
    const app = await start();
    await app.press("parents_report");
    await vi.waitFor(() => expect(app.text()).toContain(t("reportDone")));
    expect(appLogText()).toContain("REPORT screen=quiz map=classic_route_1 x=4 y=9");
    uninstallAppLog();
  });
});

describe("the children", () => {
  it("a name, a grade and a hero are saved, and who-plays shows them", async () => {
    const app = await start();
    const [dana] = app.ids;
    await app.press("parents_children");
    await app.waitScreen("parents-children");
    expect([...app.container.querySelectorAll(".card")].map((c) => c.textContent)).toEqual(["דנה", "גל"]);
    await app.press(`edit_${dana}`);
    await app.waitScreen("parents-child");

    await app.press("child_name");
    expect(app.screen()).toBe("letters");
    await app.press("board_delete");
    await app.press("letter_ר");
    await app.press("board_done");
    await app.waitScreen("parents-child");
    expect(app.text()).toContain(t("childSaved"));

    await app.press("child_grade");
    expect(app.screen()).toBe("parents-grade");
    await app.press("choice_5");
    await app.waitScreen("parents-child");
    await app.press("child_avatar");
    await app.press("choice_boy_blue");
    await app.waitScreen("parents-child");

    const saved = await app.services.profiles.get(dana!);
    expect({ name: saved.name, grade: saved.grade, avatar: saved.avatar }).toEqual({ name: "דנר", grade: 5, avatar: "boy_blue" });
    // the file on disk, written whole (the store's atomic write: no .tmp left)
    const file = JSON.parse((await app.services.fs.readText(`profiles/${dana}/profile.json`))!);
    expect(file.name).toBe("דנר");
    expect(await app.services.fs.stat(`profiles/${dana}/profile.json.tmp`)).toBeNull();

    await app.androidBack();
    expect(app.screen()).toBe("parents-children");
    await app.androidBack();
    expect(app.screen()).toBe("parents");
    await app.androidBack();
    expect(app.screen()).toBe("who-plays");
    expect([...app.container.querySelectorAll(".card")].map((c) => c.textContent)).toEqual(["דנר", "גל"]);
  });

  it("a name another child has, or an invalid one, is refused on the board", async () => {
    const app = await start();
    await app.press("parents_children");
    await app.waitScreen("parents-children");
    await app.press(`edit_${app.ids[0]}`);
    await app.waitScreen("parents-child");
    await app.press("child_name");
    for (let i = 0; i < 3; i++) await app.press("board_delete");
    await app.press("letter_ג");
    await app.press("letter_ל");
    await app.press("board_done");
    expect(app.screen()).toBe("letters");
    expect(app.text()).toContain(t("nameTaken"));
    expect((await app.services.profiles.get(app.ids[0]!)).name).toBe("דנה");
  });

  it("is deleted only after its own page asks; 'ביטול' keeps them", async () => {
    const app = await start();
    const [, gal] = app.ids;
    await app.press("parents_children");
    await app.waitScreen("parents-children");
    await app.press(`edit_${gal}`);
    await app.waitScreen("parents-child");
    const confirm = vi.spyOn(window, "confirm");
    await app.press("child_delete");
    expect(app.screen()).toBe("parents-delete");
    expect(app.text()).toContain(t("childDeleteAsk", { name: "גל" }));
    await app.press("confirm_no");
    await app.waitScreen("parents-child");
    expect((await app.services.profiles.list()).map((p) => p.name)).toEqual(["דנה", "גל"]);
    // Android's back on the question keeps them too
    await app.press("child_delete");
    await app.androidBack();
    await app.waitScreen("parents-child");
    await app.press("child_delete");
    await app.press("confirm_yes");
    await vi.waitFor(() => expect(app.text()).toContain(t("childDeleted", { name: "גל" })));
    expect(confirm).not.toHaveBeenCalled();
    expect((await app.services.profiles.list()).map((p) => p.name)).toEqual(["דנה"]);
    // moved to the trash, its files with it
    expect((await app.services.profiles.listTrash()).map((e) => e.name)).toEqual(["גל"]);
    await app.press("next");
    await app.waitScreen("parents-children");
    expect([...app.container.querySelectorAll(".card")].map((c) => c.textContent)).toEqual(["דנה"]);
  });
});

describe("the parent code", () => {
  it("is changed with the current code first, then the new one twice", async () => {
    const app = await start();
    await app.press("parents_pin");
    await app.waitScreen("pin");
    expect(app.text()).toContain(t("pinCurrentHint"));
    await app.code("0000");
    await vi.waitFor(() => expect(app.text()).toContain(t("pinWrong", { left: 4 })), { timeout: 5000 });
    await app.code("1234");
    await vi.waitFor(() => expect(app.text()).toContain(t("pinNewHint")), { timeout: 5000 });
    await app.code("5678");
    expect(app.text()).toContain(t("pinAgainHint"));
    await app.code("5679");
    expect(app.text()).toContain(t("pinMismatch"));
    await app.code("5678");
    await app.code("5678");
    await vi.waitFor(() => expect(app.text()).toContain(t("pinChanged")), { timeout: 5000 });
    expect((await app.services.parent.verifyPin("5678")).ok).toBe(true);
    await app.androidBack();
    expect(app.screen()).toBe("parents");
  }, 20_000);
});

describe("locking", () => {
  it("the parents' area locks when the app goes to the background", async () => {
    const leave = new Set<() => void>();
    const lifecycle: MapLifecycle = {
      state: "active",
      onBackground: (fn) => (leave.add(fn), () => void leave.delete(fn)),
      onForeground: () => () => undefined,
    };
    const app = await start(["דנה"], lifecycle);
    expect(app.screen()).toBe("parents");
    act(() => leave.forEach((fn) => fn()));
    await settle();
    expect(app.screen()).toBe("who-plays");
    // coming back asks for the PIN again
    await app.press("parents");
    const pin = app.screen();
    expect(pin).not.toBe("parents");
    // another screen is left alone
    act(() => leave.forEach((fn) => fn()));
    await settle();
    expect(app.screen()).toBe(pin);
  });
});

describe("GitHub", () => {
  it("a pasted token is checked, kept only in the secret store, and shown masked", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ private: true, permissions: { push: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const app = await start();
    await app.press("parents_github");
    await vi.waitFor(() => expect(app.el("gh_paste")).not.toBeNull());
    expect(app.text()).toContain("לא מחובר");
    await app.press("gh_paste");
    expect(app.screen()).toBe("parents-token");
    const input = app.container.querySelector("input")!;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: TOKEN } });
    // while it is typed: never in a DOM attribute or the markup
    expect(input.getAttribute("value")).toBeNull();
    expect(app.container.innerHTML).not.toContain(TOKEN);
    expect(input.value).toBe(TOKEN);
    await app.press("gh_token_save");
    // cleared at once on save
    expect(input.value).toBe("");
    await app.waitScreen("parents-github");
    await vi.waitFor(() => expect(app.text()).toContain(t("ghOk", { repo: "YuvalNag/nagmon-data" })));
    expect(app.el("gh_masked")!.textContent).toBe("***9999");
    expect(app.container.innerHTML).not.toContain(TOKEN);
    expect(await app.services.secrets.get(SECRET_KEYS.githubToken)).toBe(TOKEN);
    // "מחיקה" forgets it
    await app.press("gh_remove");
    await vi.waitFor(() => expect(app.text()).toContain(t("ghRemoved")));
    expect(await app.services.secrets.get(SECRET_KEYS.githubToken)).toBeNull();
    await app.androidBack();
    await app.waitScreen("parents-github");
    await app.androidBack();
    expect(app.screen()).toBe("parents");
  });

  it("an upload waits for 'שליחה' on its own page", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(String(init.method));
        return init.method === "PUT"
          ? new Response("{}", { status: 201 })
          : new Response(JSON.stringify({ private: true, permissions: { push: true } }), { status: 200 });
      }),
    );
    const app = await start();
    await app.services.secrets.set(SECRET_KEYS.githubToken, TOKEN);
    await app.press("parents_github");
    await vi.waitFor(() => expect(app.el("gh_send_progress")).not.toBeNull());
    await app.press("gh_send_progress");
    await app.waitScreen("parents-confirm");
    expect(app.text()).toContain(t("ghConfirmProgress", { count: 2 }));
    expect(app.el("confirm_path")!.textContent).toMatch(/^devices\/[0-9a-f]{8}\/progress\/\d{8}T\d{6}Z\.json$/);
    expect(calls).toEqual([]);
    // back: nothing sent
    await app.androidBack();
    await app.waitScreen("parents-github");
    expect(calls).toEqual([]);
    await app.press("gh_send_progress");
    await app.waitScreen("parents-confirm");
    await app.press("confirm_yes");
    await vi.waitFor(() => expect(app.text()).toContain(t("ghSent")));
    expect(calls).toEqual(["GET", "PUT"]);
  });
});

describe("Android's back in the area", () => {
  it("goes one page back from every page, and out from the first", () => {
    const child = { kind: "child", id: "p00001" } as const;
    const cases: [ParentsPage, ParentsPage | null][] = [
      [{ kind: "home" }, null],
      [{ kind: "children" }, { kind: "home" }],
      [child, { kind: "children" }],
      [{ kind: "child-name", id: "p00001", initial: "x" }, child],
      [{ kind: "child-grade", id: "p00001" }, child],
      [{ kind: "child-avatar", id: "p00001" }, child],
      [{ kind: "child-delete", id: "p00001", name: "x" }, child],
      [{ kind: "pin-old" }, { kind: "home" }],
      [{ kind: "pin-new", current: "1234" }, { kind: "home" }],
      [{ kind: "github" }, { kind: "home" }],
      [{ kind: "token" }, { kind: "github" }],
      [{ kind: "notice", text: "x", next: { kind: "children" } }, { kind: "children" }],
    ];
    for (const [from, to] of cases) expect(parentsBackStep(from), from.kind).toEqual(to);
  });
});
