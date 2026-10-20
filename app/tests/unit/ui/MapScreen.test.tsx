/// <reference types="node" />
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { openPlay, type FetchJson } from "../../../src/app/play";
import { defaultsForGrade } from "../../../src/core/family/gradeDefaults";
import { ProfileStore } from "../../../src/core/family/profiles";
import { readMap, type TiledMap } from "../../../src/core/world/mapData";
import type { MapOptions } from "../../../src/game/mapGame";
import { type JsonObject, MemoryFileStore, pendingWrites } from "../../../src/platform/storage";
import { MapScreen } from "../../../src/ui/screens/MapScreen";

const fetchJson: FetchJson = async (path) => JSON.parse(readFileSync(`public/game/${path}`, "utf8"));
const city = readMap("classic_hearthrock_city", JSON.parse(readFileSync("public/game/maps/classic_hearthrock_city.json", "utf8")) as TiledMap);

afterEach(cleanup);

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

/** The map with a stand-in scene: it opens Hearthrock and reports who stands in front. */
async function start({ grade = 2, settings = defaultsForGrade(2).settings as JsonObject } = {}) {
  const fs = new MemoryFileStore();
  const profiles = new ProfileStore(fs);
  // a made-up name
  const profile = await profiles.create({ name: "תמר", avatar: "girl_teal", grade, settings });
  const calls: string[] = [];
  let opts!: MapOptions;
  const load = async () =>
    ({
      startMap: (o: MapOptions) => {
        opts = o;
        setTimeout(() => {
          o.onMap?.(city);
          o.onReady?.();
        }, 0);
        return {
          pause: (why: string) => calls.push(`pause ${why}`),
          resume: (why: string) => calls.push(`resume ${why}`),
          paused: false,
          destroy: () => calls.push("destroy"),
          debug: () => null,
        };
      },
    }) as unknown as typeof import("../../../src/game/mapGame");
  const backRef = createRef<() => void>() as MutableRefObject<(() => void) | null>;
  const { container } = render(
    <MapScreen
      profile={profile}
      profiles={profiles}
      backRef={backRef}
      onExit={() => calls.push("exit")}
      load={load}
      openPlay={(o) => openPlay({ ...o, fetchJson, seed: 3 })}
    />,
  );
  for (let i = 0; i < 400 && !container.querySelector("[data-play=ready][data-map=ready]"); i++) await settle(25);
  const q = (s: string) => container.querySelector(s) as HTMLElement | null;
  const el = (id: string) => q(`[data-id="${id}"]`) as HTMLButtonElement | null;
  // a keyboard or switch press (no pointer): ScreenTime does not apply
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no ${id}`);
    await act(async () => void fireEvent.click(b, { detail: 0 }));
    await settle();
  };
  const face = async (who: string | null) => {
    await act(async () => opts.onFacing?.(who));
  };
  /** Taps through the dialog showing; its texts. */
  const read = async () => {
    const out: string[] = [];
    while (q("[data-screen=dialog]")) {
      out.push(el("dialog")!.getAttribute("aria-label")!);
      // the whole page first, if it is still typing; then the next
      if (q("[data-screen=dialog]")!.dataset.full !== "true") await press("dialog");
      await press("dialog");
    }
    return out;
  };
  const quiz = () => (window as unknown as { __nagmonQuiz?: () => { phase: string; kind: string; answer: string } }).__nagmonQuiz?.();
  return { fs, profiles, profile, calls, backRef, q, el, press, face, read, quiz, container, opts: () => opts };
}

describe("talking on the map", () => {
  it("shows the talk button only facing the cashier, beside a coin count", async () => {
    const m = await start();
    expect(m.el("coins")?.dataset.coins).toBe("0");
    expect(m.el("map_talk")).toBeNull();
    await m.face("nagmon_owl");
    expect(m.el("map_talk")).toBeNull();
    await m.face("nagmon_cashier");
    expect(m.el("map_talk")?.textContent).toBe("לדבר");
    await m.face(null);
    expect(m.el("map_talk")).toBeNull();
  });

  it("the cashier end to end: hello, a question, the right answer, 20 coins saved", async () => {
    const m = await start();
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    // the map holds still, its d-pad and menu are gone under the words
    expect(m.calls).toContain("pause talk");
    expect(m.el("dpad")).toBeNull();
    expect(m.el("map_menu")).toBeNull();
    expect(await m.read()).toEqual(["המוכר אבי: שלום! אני סופר את הכסף בקופה.", "אפשר לעזור לי עם חשבון קטן?"]);
    expect(m.q("[data-screen=quiz]")).not.toBeNull();
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    const { answer } = m.quiz()!;
    await m.press(`quiz_choice_${answer}`);
    expect(m.q("[data-screen=quiz]")?.dataset.phase).toBe("feedback");
    expect(m.el("quiz_headline")?.textContent).toMatch(/נכון/);
    // the learner is on disk before "continue"
    await pendingWrites(m.fs);
    expect((await m.profiles.loadLearnerDict(m.profile.id))["answers_total"]).toBe(1);
    await m.press("quiz_continue");
    expect(m.el("coins")?.dataset.coins).toBe("20");
    expect((await m.read()).join(" ")).toContain("הנה 20 מטבעות");
    expect(m.calls.at(-1)).toBe("resume talk");
    expect(m.el("map_talk")).not.toBeNull();
    await pendingWrites(m.fs);
    expect((await m.profiles.loadWorldDict(m.profile.id))["money"]).toBe(20);
  });

  it("the hint takes a choice away; 'don't know' shows the answer and how, kindly, with no coins", async () => {
    const m = await start();
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    await m.read();
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    const before = m.container.querySelectorAll(".quiz-choice").length;
    await m.press("quiz_hint");
    expect(m.container.querySelectorAll(".quiz-choice").length).toBe(before - 1);
    expect(m.el("quiz_hint_text")?.textContent).toMatch(/[א-ת]/);
    expect(m.el("quiz_hint")?.disabled).toBe(true);
    await m.press("quiz_dont_know");
    expect(m.el("quiz_headline")?.textContent).toBe("זה בסדר לא לדעת! ככה פותרים:");
    expect(m.el("quiz_answer")?.textContent).toMatch(/התשובה: .*\d/);
    expect(m.el("quiz_explanation")?.textContent).not.toBe("");
    await m.press("quiz_continue");
    expect((await m.read()).join(" ")).toContain("כמעט!");
    expect(m.el("coins")?.dataset.coins).toBe("0");
  });

  it("a number question on the pad, with erase, and the check only once something is typed", async () => {
    const m = await start({ grade: 3, settings: { learning: { answer_mode: "number" } } });
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    await m.read();
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    expect(m.quiz()!.kind).toBe("number");
    expect(m.el("quiz_check")?.disabled).toBe(true);
    await m.press("quiz_key_9");
    await m.press("quiz_key_back");
    expect(m.el("quiz_typed")?.textContent).toBe("_");
    for (const k of m.quiz()!.answer) await m.press(`quiz_key_${k}`);
    expect(m.el("quiz_typed")?.textContent).toBe(m.quiz()!.answer);
    await m.press("quiz_check");
    expect(m.el("quiz_headline")?.textContent).toMatch(/נכון|סופר/);
  });

  it("Android's back: on in the dialog, out of the question with nothing counted, then the menu", async () => {
    const m = await start();
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    const back = async () => {
      await act(async () => m.backRef.current?.());
      await settle();
    };
    const dialog = () => m.q("[data-screen=dialog]");
    if (dialog()!.dataset.full !== "true") await back(); // the whole first page
    expect(dialog()?.dataset.full).toBe("true");
    await back(); // the second page
    expect(dialog()?.dataset.page).toBe("1");
    if (dialog()!.dataset.full !== "true") await back();
    await back(); // closed
    expect(m.q("[data-screen=quiz]")).not.toBeNull();
    await back(); // out of the question
    expect(m.q("[data-screen=quiz]")).toBeNull();
    expect(m.q("[data-screen=map-menu]")).toBeNull();
    await pendingWrites(m.fs);
    expect((await m.profiles.loadLearnerDict(m.profile.id))["answers_total"] ?? 0).toBe(0);
    expect(m.calls.at(-1)).toBe("resume talk");
    await back();
    expect(m.q("[data-screen=map-menu]")).not.toBeNull();
    expect(m.calls).not.toContain("exit");
  });
});
