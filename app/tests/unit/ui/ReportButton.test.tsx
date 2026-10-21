import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { Reports } from "../../../src/core/report/reports";
import { setCurrentMap } from "../../../src/game/current";
import type { MapController } from "../../../src/game/mapGame";
import { MemoryFileStore } from "../../../src/platform/storage";
import { ReportButton } from "../../../src/ui/ReportButton";
import { crumb } from "../../../src/core/game/breadcrumb";

// the screenshot: the test says what it returns and sees what the page looked like then
const shot = vi.hoisted(() => ({ result: "QUJD" as string | null, calls: [] as string[] }));
vi.mock("../../../src/platform/screenshot", () => ({
  takeScreenshot: async () => {
    shot.calls.push(document.querySelector("[data-report-sheet]") ? "shot with the sheet showing" : "shot");
    return shot.result;
  },
}));

afterEach(() => {
  cleanup();
  setCurrentMap(null);
  shot.result = "QUJD";
  shot.calls.length = 0;
});

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

async function start({ saveFails = false } = {}) {
  const fs = new MemoryFileStore();
  const lines: string[] = [];
  const reports = new Reports({
    fs,
    field: new FieldLog({ info: (m) => lines.push(m) }),
    build: () => ({ version: "0.1.0", build: "9" }),
    log: () => "a line\n",
    names: async () => ["תמר"],
  });
  if (saveFails) vi.spyOn(reports, "save").mockRejectedValue(new Error("disk"));
  const calls: string[] = [];
  setCurrentMap({
    pause: (why?: string) => calls.push(`pause ${why}`),
    resume: (why?: string) => calls.push(`resume ${why}`),
    paused: false,
    destroy: () => {},
    goTo: () => true,
    debug: () => null,
  } as unknown as MapController);
  const backRef = createRef<() => boolean>() as MutableRefObject<(() => boolean) | null>;
  const { container } = render(
    <>
      <main data-screen="bag" data-tab="nets" />
      <ReportButton reports={reports} child="p00001" backRef={backRef} thanksMs={30} />
    </>,
  );
  const el = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement | null;
  // a keyboard press: Tap's path without a pointer, so no wait for fresh screens
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no button ${id}`);
    fireEvent.click(b, { detail: 0 });
    await settle();
  };
  const sheet = () => container.querySelector("[data-report-sheet]");
  return { fs, lines, reports, calls, backRef, container, el, press, sheet };
}

const files = async (app: Awaited<ReturnType<typeof start>>) => (await app.fs.list("profiles/p00001/reports")).map((f) => f.name);

describe("the report button", () => {
  it("is a named button with a Hebrew label", async () => {
    const app = await start();
    const b = app.el("report_open")!;
    expect(b.getAttribute("aria-label")).toBe("משהו לא בסדר? אפשר לספר לנו");
    expect(app.sheet()).toBeNull();
  });

  it("takes the screenshot first, then holds the game, then opens the sheet", async () => {
    const app = await start();
    await app.press("report_open");
    await settle();
    // the picture was taken with no sheet on the screen, before the pause
    expect(shot.calls).toEqual(["shot"]);
    expect(app.calls).toEqual(["pause report"]);
    expect(app.sheet()).not.toBeNull();
    expect(app.container.querySelector(".report-title")!.textContent).toBe("מה לא בסדר?");
    expect(app.container.querySelectorAll(".report-chip")).toHaveLength(4);
    expect(app.container.querySelector("textarea")!.getAttribute("placeholder")).toBe("אפשר לכתוב כאן");
  });

  it("cancel closes it, lets the game go and writes nothing", async () => {
    const app = await start();
    await app.press("report_open");
    await settle();
    await app.press("report_cancel");
    expect(app.sheet()).toBeNull();
    expect(app.calls).toEqual(["pause report", "resume report"]);
    expect(await files(app)).toEqual([]);
    expect(app.lines).toEqual([]);
  });

  it("one tap on a chip, then Send: the files, one log line, a thank-you, and the sheet closes", async () => {
    const app = await start();
    await app.press("report_open");
    await settle();
    await app.press("report_chip_unclear");
    expect(app.el("report_chip_unclear")!.getAttribute("aria-pressed")).toBe("true");
    await app.press("report_send");
    await settle(5);
    expect(app.el("report_thanks")!.textContent).toBe("תודה! נרשם.");
    const names = await files(app);
    expect(names).toHaveLength(2);
    expect(names.map((n) => n.split(".").pop()).sort()).toEqual(["jpg", "json"]);
    const json = JSON.parse((await app.fs.readText(`profiles/p00001/reports/${names.find((n) => n.endsWith(".json"))}`))!);
    expect(json).toMatchObject({ chip: "unclear", screen: "bag", bag: { tab: "nets" }, screenshot: true, text: "" });
    expect(app.lines).toEqual(["REPORT screen=bag chip=unclear"]);
    await settle(60);
    expect(app.sheet()).toBeNull();
    expect(app.calls).toEqual(["pause report", "resume report"]);
  });

  it("Send with nothing chosen is allowed and still records the screen", async () => {
    const app = await start();
    await app.press("report_open");
    await settle();
    await app.press("report_send");
    await settle(5);
    expect(app.lines).toEqual(["REPORT screen=bag chip=none"]);
    expect(await app.reports.count()).toBe(1);
  });

  it("works without a screenshot, and says nothing about it", async () => {
    shot.result = null;
    const app = await start();
    await app.press("report_open");
    await settle();
    expect(app.sheet()!.textContent).not.toMatch(/צילום|תמונה/);
    await app.press("report_send");
    await settle(5);
    expect(await files(app)).toHaveLength(1);
    const [json] = await files(app);
    expect(JSON.parse((await app.fs.readText(`profiles/p00001/reports/${json}`))!).screenshot).toBe(false);
  });

  it("keeps the typed text as typed, and the log line has none of it", async () => {
    const app = await start();
    await app.press("report_open");
    await settle();
    const field = app.container.querySelector("textarea")!;
    fireEvent.change(field, { target: { value: "תמר לא מצליחה לענות" } });
    await app.press("report_chip_stuck");
    await app.press("report_send");
    await settle(5);
    const [json] = (await files(app)).filter((n) => n.endsWith(".json"));
    expect(JSON.parse((await app.fs.readText(`profiles/p00001/reports/${json}`))!).text).toBe("תמר לא מצליחה לענות");
    expect(app.lines).toEqual(["REPORT screen=bag chip=stuck"]);
  });

  it("a tap on the chosen chip takes it back", async () => {
    const app = await start();
    await app.press("report_open");
    await settle();
    await app.press("report_chip_other");
    await app.press("report_chip_other");
    expect(app.el("report_chip_other")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("the field's keyboard moves the sheet to the top, with only the field and the buttons", async () => {
    const app = await start();
    await app.press("report_open");
    await settle();
    const layer = app.sheet()!;
    expect(layer.getAttribute("data-typing")).toBe("false");
    fireEvent.focus(app.container.querySelector("textarea")!);
    expect(layer.getAttribute("data-typing")).toBe("true");
    // a button taking the focus keeps it, so the tap on "שליחה" is not moved away
    fireEvent.blur(app.container.querySelector("textarea")!, { relatedTarget: app.el("report_send") });
    expect(layer.getAttribute("data-typing")).toBe("true");
    fireEvent.blur(app.container.querySelector("textarea")!, { relatedTarget: null });
    expect(layer.getAttribute("data-typing")).toBe("false");
  });

  it("Android's back closes the sheet first", async () => {
    const app = await start();
    expect(app.backRef.current!()).toBe(false);
    await app.press("report_open");
    await settle();
    expect(app.backRef.current!()).toBe(true);
    await settle();
    expect(app.sheet()).toBeNull();
  });

  it("a report that could not be saved says so and stays open to try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = await start({ saveFails: true });
    await app.press("report_open");
    await settle();
    await app.press("report_send");
    await settle(5);
    expect(app.container.querySelector(".report-failed")).not.toBeNull();
    expect(app.sheet()).not.toBeNull();
  });

  it("reads the screen from the page: the question showing, its item and skill", async () => {
    crumb.question({ item_id: "add.1", skill_id: "math.add", difficulty: 2, kind: "choice", choices: [{ id: "a", text_he: "5" }], figure: null });
    const fs = new MemoryFileStore();
    const reports = new Reports({ fs, field: new FieldLog({ info: () => {} }), build: () => ({ version: "1", build: "1" }), log: () => "", names: async () => [] });
    const { container } = render(
      <>
        <main data-screen="play">
          <section data-screen="quiz" data-phase="question" />
        </main>
        <ReportButton reports={reports} child="p00001" thanksMs={10} />
      </>,
    );
    fireEvent.click(container.querySelector("[data-id=report_open]")!, { detail: 0 });
    await settle();
    fireEvent.click(container.querySelector("[data-id=report_send]")!, { detail: 0 });
    await settle(5);
    const [json] = (await fs.list("profiles/p00001/reports")).filter((f) => f.name.endsWith(".json"));
    const saved = JSON.parse((await fs.readText(`profiles/p00001/reports/${json!.name}`))!);
    expect(saved.screen).toBe("quiz");
    expect(saved.question).toMatchObject({ item: "add.1", skill: "math.add", level: 2, phase: "question" });
    expect(saved.map).toBeDefined();
  });
});
